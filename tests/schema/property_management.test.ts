import { describe, expect, it } from "vitest";

import lexiconJson from "../../src/data/lexicon.json";
import type { LexiconData } from "../../src/types/lexicon";

const lexicon = lexiconJson as unknown as LexiconData;

function getClass(type: string) {
  const lexiconClass = lexicon.classes.find((candidate) => candidate.type === type);
  expect(lexiconClass, `Expected ${type} class to exist`).toBeDefined();
  return lexiconClass!;
}

describe("property management lexicon", () => {
  it("adds CID link properties on property and homeowners_association", () => {
    const property = getClass("property");
    expect(property.properties.hoa_cid).toBeDefined();
    expect(property.properties.property_manager_cid).toBeDefined();
    expect(property.relationships?.has_property_management?.targets).toEqual(["company"]);

    const hoa = getClass("homeowners_association");
    expect(hoa.properties.sunbiz_document_number).toBeDefined();
    expect(hoa.properties.company_cid).toBeDefined();
    expect(hoa.properties.property_manager_cid).toBeDefined();
    expect(hoa.relationships?.has_property_management?.targets).toEqual(["company"]);

    const company = getClass("company");
    expect(company.properties.sunbiz_document_number).toBeDefined();
  });

  it("defines a Property Management data group containing company", () => {
    const group = lexicon.data_groups.find((entry) => entry.label === "Property Management");
    expect(group, "Expected Property Management data group").toBeDefined();
    const types = group!.relationships.map((relationship) => relationship.relationship_type);
    expect(types).toContain("property_has_property_management");
    expect(types).toContain("homeowners_association_has_property_management");
    expect(group!.relationships.every((relationship) => relationship.to === "company" || relationship.from === "company")).toBe(
      true,
    );
  });
});
