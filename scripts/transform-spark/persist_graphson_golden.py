#!/usr/bin/env python3
"""Golden tests for sale-availability-persist-input-to-persist-graphson on the Transform Spark worker.

Delivery shape: {"address_status": "NORMALIZED" | "UNPARSEABLE", "graph": <canonical tinker:graph @value text> | null}.
Runs every case through the deployed engine's own code path: resolve-plans.ts builds resolved plans with the
Transform resolver from this repository's catalog, and transform_with_sql_mappings.materialize_transform_outputs
executes them on a local object store (schema-bound input validation, target validation, canonical-json check
and inline delivery). Expectations come only from the executable spec.

Usage (Python 3.10 + pyspark 3.3.0 + pyarrow, Java 17):
  persist_graphson_golden.py --transform-root <transform checkout> [--spec-dir <dir with build_graphson.py>
      --scale-dir <scale-test dir> [--all]] [--report report.json]
"""
import argparse
import datetime
import glob
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CATALOG_ROOT = REPO / "publish" / "pipelines" / "transform"
MAPPING_ID = "sale-availability-persist-input-to-persist-graphson"
MAPPING_ROOT = CATALOG_ROOT / "mappings" / MAPPING_ID / "1.0.0"
FROM, TO = "sale-availability-persist-input", "persist-graphson"


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--transform-root", required=True)
    ap.add_argument("--spec-dir")
    ap.add_argument("--scale-dir")
    ap.add_argument("--all", action="store_true", help="every real run instead of the representative set")
    ap.add_argument("--report")
    ap.add_argument("--only", help="run only case ids containing this text")
    return ap.parse_args()


class Harness:
    def __init__(self, transform_root):
        sys.path.insert(0, str(Path(transform_root) / "glue_scripts"))
        import transform_with_sql_mappings as worker
        from pyspark.sql import SparkSession

        self.worker = worker
        self.transform_root = transform_root
        self.root = Path(tempfile.mkdtemp(prefix="persist-graphson-golden-"))
        (self.root / "lexicon-catalog").symlink_to(CATALOG_ROOT)

        class Store(worker.LocalTransformObjectStore):
            def write_immutable_bytes(self, s3_uri, body, content_type):
                from dataclasses import replace
                return replace(super().write_immutable_bytes(s3_uri, body, content_type), version_id="local-version-1")

        self.store = Store(self.root)
        self.spark = (
            SparkSession.builder.master("local[2]")
            .config("spark.ui.enabled", "false")
            .config("spark.sql.shuffle.partitions", "2")
            .getOrCreate()
        )
        self.spark.sparkContext.setLogLevel("ERROR")
        self.cases = []

    def stage(self, case_id, tables):
        """tables: {table: ("parquet-files", [paths]) | ("rows", [dicts]) | ("jsonl", [dicts])}"""
        execution_id = "golden-" + hashlib.sha256(case_id.encode()).hexdigest()[:24]
        inputs = []
        for table, (kind, payload) in tables.items():
            prefix = f"{execution_id}/{table}"
            target = self.root / "inputs" / execution_id / table
            target.mkdir(parents=True, exist_ok=True)
            if kind == "parquet-files":
                for i, path in enumerate(payload):
                    shutil.copy(path, target / f"part-{i:05d}.parquet")
            elif kind == "jsonl":
                (target / "part-00000.jsonl").write_text("".join(json.dumps(r) + "\n" for r in payload))
            else:
                self._write_rows(table, payload, target)
            objects = [
                {"bucket": "inputs", "key": f"{prefix}/{p.name}", "path": str(p)}
                for p in sorted(target.iterdir())
                if p.is_file() and not p.name.startswith((".", "_"))
            ]
            inputs.append({"table": table, "s3Uri": f"s3://inputs/{prefix}/", "objects": objects})
        self.cases.append({"executionId": execution_id, "outputS3Prefix": "s3://outputs/runs", "inputs": inputs, "_id": case_id})
        return execution_id

    def _write_rows(self, table, rows, target):
        from pyspark.sql.types import StructType

        schema = StructType.fromJson(self._source_schema(table))

        def convert(value, data_type):
            name = data_type.typeName()
            if value is None:
                return None
            if name == "timestamp":
                return datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(datetime.timezone.utc)
            if name == "struct":
                return {f.name: convert(value.get(f.name), f.dataType) for f in data_type.fields}
            if name == "array":
                return [convert(v, data_type.elementType) for v in value]
            return value

        data = [{f.name: convert(r.get(f.name), f.dataType) for f in schema.fields} for r in rows]
        self.spark.createDataFrame(data, schema).coalesce(1).write.mode("overwrite").parquet(str(target / "_tmp"))
        for part in (target / "_tmp").glob("part-*.parquet"):
            part.rename(target / part.name)
        shutil.rmtree(target / "_tmp")

    def _source_schema(self, table):
        if not hasattr(self, "_schemas"):
            self._schemas = {}
            language = json.loads((CATALOG_ROOT / "languages" / FROM / "1.0.0" / f"{FROM}.json").read_text())
            for dataset in language["datasets"]:
                self._schemas[dataset["type"]] = dataset
        dataset = self._schemas[table]

        def spark_type(prop):
            t = prop["type"][0] if isinstance(prop["type"], list) else prop["type"]
            if t == "string":
                return "timestamp" if prop.get("format") == "date-time" else ("date" if prop.get("format") == "date" else "string")
            if t == "integer":
                return "long"
            if t == "number":
                return "double"
            if t == "boolean":
                return "boolean"
            if t == "array":
                return {"type": "array", "elementType": spark_type(prop["items"]), "containsNull": isinstance(prop["items"]["type"], list)}
            if t == "object":
                return struct(prop)
            raise ValueError(t)

        def struct(node):
            req = set(node.get("required", []))
            return {"type": "struct", "fields": [
                {"name": k, "type": spark_type(v), "nullable": k not in req or isinstance(v["type"], list), "metadata": {}}
                for k, v in node["properties"].items()]}

        return struct(dataset)

    def resolve(self):
        request = {"transformRoot": self.transform_root, "catalogRoot": str(CATALOG_ROOT), "from": FROM, "to": TO,
                   "cases": [{k: v for k, v in c.items() if k != "_id"} for c in self.cases]}
        req_path = self.root / "cases.json"
        req_path.write_text(json.dumps(request))
        out = subprocess.run(["npx", "tsx", str(REPO / "scripts" / "transform-spark" / "resolve-plans.ts"), str(req_path)],
                             cwd=self.transform_root, capture_output=True, text=True)
        if out.returncode != 0:
            raise SystemExit(f"plan resolution failed:\n{out.stderr}")
        resolved = json.loads(out.stdout)
        return resolved["mapping"], {c["_id"]: p for c, p in zip(self.cases, resolved["plans"])}

    def run(self, plan):
        body = canonical(plan).encode()
        sha = hashlib.sha256(body).hexdigest()
        uri = f"s3://plans/{plan['executionId']}.json"
        self.store.write_bytes(uri, body, "application/json")
        parsed = self.worker.read_verified_execution_plan(self.store, uri, sha, plan["executionId"])
        try:
            metadata = self.worker.materialize_transform_outputs(self.spark, self.store, parsed, uri, sha)
        except Exception as error:  # noqa: BLE001
            return None, _error_message(str(error))
        return metadata["delivery"], None


def _error_message(message):
    for line in message.splitlines():
        if "Exception: " in line or "Error: " in line:
            return line.strip()[:400]
    return (message.splitlines() or [""])[0][:400]


def first_diff(actual, expected):
    if actual is None or expected is None:
        return {"actual": actual is not None and "graph", "expected": expected is not None and "graph"}
    a, e = json.loads(actual), json.loads(expected)
    for key in ("vertices", "edges"):
        if len(a[key]) != len(e[key]):
            return {"path": key, "actualCount": len(a[key]), "expectedCount": len(e[key])}
        for i, (x, y) in enumerate(zip(a[key], e[key])):
            if x != y:
                xp, yp = x["@value"].get("properties", {}), y["@value"].get("properties", {})
                changed = {k: {"actual": xp.get(k), "expected": yp.get(k)} for k in sorted(set(xp) | set(yp)) if xp.get(k) != yp.get(k)}
                return {"path": f"{key}[{i}]", "label": y["@value"].get("label"), "properties": changed,
                        "ids": [x["@value"].get("id"), y["@value"].get("id")] if not changed else None}
    return {"path": "?"}


def address_vertex(graph):
    if graph is None:
        return None
    for v in json.loads(graph)["vertices"]:
        if v["@value"]["label"] == "address":
            return {k: p[0]["@value"]["value"] for k, p in v["@value"]["properties"].items()}
    return None


def main():
    args = parse_args()
    golden = json.loads((MAPPING_ROOT / "tests" / "persist-graphson-golden-cases.json").read_text())
    h = Harness(args.transform_root)
    expectations = {}

    for case in golden["graphCases"]:
        cid = f"golden:{case['id']}"
        h.stage(cid, {"listing_observations": ("rows", case["inputs"]["listing_observations"]),
                      "sale_availability_assessments": ("rows", case["inputs"]["sale_availability_assessments"]),
                      "request_address": ("jsonl", case["inputs"]["request_address"])})
        expectations[cid] = {"kind": "graph", **case["expected"]}
    host = golden["graphCases"][0]["inputs"]
    for case in golden["addressCases"]:
        cid = f"vector:{case['id']}"
        h.stage(cid, {"listing_observations": ("rows", host["listing_observations"]),
                      "sale_availability_assessments": ("rows", host["sale_availability_assessments"]),
                      "request_address": ("jsonl", [case["request"]])})
        expectations[cid] = {"kind": "address", **case["expected"]}
    for case in golden["failureCases"]:
        cid = f"failure:{case['id']}"
        tables = {k: v for k, v in host.items()}
        tables.update(case["mutate"])
        h.stage(cid, {"listing_observations": ("rows", tables["listing_observations"]),
                      "sale_availability_assessments": ("rows", tables["sale_availability_assessments"]),
                      "request_address": ("jsonl", tables["request_address"])})
        expectations[cid] = {"kind": "failure", "error": case["error"]}

    if args.scale_dir:
        sys.path.insert(0, args.spec_dir)
        import build_graphson as bg
        import scale_build as sb

        index = [i for i in json.load(open(os.path.join(args.scale_dir, "s3-run-index.json"))) if i.get("state")]
        edge = ("BAYMEADOWS", "OLD KINGS", "A1A", " LOOP", " RUN", " UNIT", " APT", "#", "CANARY")
        selected = []
        for i in sorted(index, key=lambda x: x["run"]):
            canon = i.get("canonical") or ""
            parsed = sb.parse_address_text(canon)
            reasons = []
            if i["state"] != "UNKNOWN":
                reasons.append(i["state"])
            if any(e in canon.upper() for e in edge) or (parsed and parsed.get("unit")):
                reasons.append("address-edge-case")
            if not reasons and int(i["run"][:2], 16) % 8 == 0:
                reasons.append("unknown-sample")
            if args.all or reasons:
                selected.append((i, reasons or ["all"]))
        for i, reasons in selected:
            run_dir = os.path.join(args.scale_dir, "runs", i["run"])
            canon = i.get("canonical") or ""
            variants = [("text", {"canonical": canon})]
            if "address-edge-case" in reasons:
                upper = " ".join(canon.upper().split())
                variants.append(("text-upper", {"canonical": upper}))
                parsed = sb.parse_address_text(canon)
                if parsed:
                    structured = {k: v.upper() for k, v in parsed.items() if v}
                    structured.setdefault("postalCode", "")
                    if structured["postalCode"]:
                        variants.append(("structured-upper", {"canonical": upper, "structured": {**structured, "countryCode": "US"}}))
            orig = bg.read_rows
            bg.read_rows = lambda r, ds: sorted(orig(r, ds), key=lambda x: x["observation_identifier"]) if ds == "listing_observations" else orig(r, ds)
            try:
                for name, address in variants:
                    parsed = address.get("structured") or sb.parse_address_text(address["canonical"])
                    props = bg.normalize_address(parsed) if parsed else None
                    graph = bg.build(run_dir, parsed or {})
                    cid = f"real:{i['run']}:{name}"
                    h.stage(cid, {
                        "listing_observations": ("parquet-files", sorted(glob.glob(f"{run_dir}/tables/listing_observations/*.parquet"))),
                        "sale_availability_assessments": ("parquet-files", sorted(glob.glob(f"{run_dir}/tables/sale_availability_assessments/*.parquet"))),
                        "request_address": ("jsonl", [{"address": address, "independentPropertyReference": None}]),
                    })
                    expectations[cid] = {"kind": "graph", "state": i["state"], "reasons": reasons, "mapping": i.get("mapping"),
                                         "address_status": "NORMALIZED" if props else "UNPARSEABLE",
                                         "graph": canonical(graph["@value"]) if props else None}
            finally:
                bg.read_rows = orig

    if args.only:
        h.cases = [c for c in h.cases if args.only in c["_id"]]
    mapping, plans = h.resolve()
    results = []
    for cid, plan in plans.items():
        exp = expectations[cid]
        delivery, error = h.run(plan)
        r = {"case": cid, "kind": exp["kind"]}
        if exp["kind"] == "failure":
            r["pass"] = error is not None and exp["error"] in error
            r["error"] = error
        elif error is not None:
            r.update({"pass": False, "error": error})
        else:
            value = delivery["value"]
            r["valueSizeBytes"] = delivery["valueSizeBytes"]
            r["address_status"] = value["address_status"]
            if exp["kind"] == "address":
                got = address_vertex(value["graph"])
                r["pass"] = value["address_status"] == exp["status"] and got == exp.get("address") and set(value) == {"address_status", "graph"}
                if not r["pass"]:
                    r["diff"] = {"actual": got, "expected": exp.get("address")}
            else:
                r["byteIdentical"] = value["graph"] == exp["graph"]
                r["pass"] = (r["byteIdentical"] and value["address_status"] == exp["address_status"]
                             and set(value) == {"address_status", "graph"})
                for k in ("state", "reasons", "mapping"):
                    if k in exp:
                        r[k] = exp[k]
                if not r["pass"]:
                    r["diff"] = first_diff(value["graph"], exp["graph"])
        results.append(r)
        print(("PASS" if r["pass"] else "FAIL"), cid, r.get("error") or r.get("diff") or "", flush=True)

    passed = sum(r["pass"] for r in results)
    summary = {"mapping": mapping, "cases": len(results), "passed": passed, "failed": len(results) - passed,
               "byKind": {k: {"cases": sum(r["kind"] == k for r in results), "passed": sum(r["pass"] for r in results if r["kind"] == k)}
                          for k in ("graph", "address", "failure")},
               "maxValueSizeBytes": max((r.get("valueSizeBytes", 0) for r in results), default=0)}
    print(json.dumps(summary, indent=1))
    if args.report:
        Path(args.report).write_text(json.dumps({"summary": summary, "results": results}, indent=1))
    shutil.rmtree(h.root, ignore_errors=True)
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
