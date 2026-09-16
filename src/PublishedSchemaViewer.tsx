import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  CatalogNotConfiguredError,
  displayName,
  getJsonByCid,
  getManifest,
  getManifestEntry,
  JsonSchema,
  ManifestEntry,
  SchemaManifest,
} from './services/ipfsCatalog';
import './styles.css';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

function renderValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(' | ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

const PublishedSchemaViewer: React.FC = () => {
  const { schemaName = '' } = useParams<{ schemaName: string }>();
  const decodedName = decodeURIComponent(schemaName);
  const [manifest, setManifest] = useState<SchemaManifest | null>(null);
  const [schema, setSchema] = useState<JsonSchema | null>(null);
  const [entry, setEntry] = useState<ManifestEntry | null>(null);
  const [error, setError] = useState('');
  const [unconfigured, setUnconfigured] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setAttempt(0);
  }, [decodedName]);

  useEffect(() => {
    let active = true;
    let retry = 0;
    setSchema(null);
    setError('');
    setUnconfigured(false);

    getManifest()
      .then(async catalog => {
        if (!active) return;
        setManifest(catalog);
        const match = getManifestEntry(catalog, decodedName);
        if (!match) throw new Error(`“${decodedName}” is not in the published manifest.`);
        setEntry(match[1]);
        const publishedSchema = await getJsonByCid(match[1].ipfsCid);
        if (active) setSchema(publishedSchema);
      })
      .catch(reason => {
        if (!active) return;
        if (reason instanceof CatalogNotConfiguredError) {
          setUnconfigured(true);
          setError(reason.message);
          return;
        }
        // A first read of a cold CID often fails while the gateways are still
        // fetching the block, and succeeds moments later.
        if (attempt < MAX_ATTEMPTS - 1) {
          retry = window.setTimeout(() => setAttempt(current => current + 1), RETRY_DELAY_MS);
          return;
        }
        setError(reason instanceof Error ? reason.message : 'Schema request failed.');
      });

    return () => {
      active = false;
      window.clearTimeout(retry);
    };
  }, [decodedName, attempt, reload]);

  const retryNow = () => {
    setError('');
    setAttempt(0);
    setReload(current => current + 1);
  };

  const cidTargets = useMemo(() => {
    if (!manifest) return new Map<string, string>();
    return new Map(Object.entries(manifest).map(([name, value]) => [value.ipfsCid, name]));
  }, [manifest]);

  const properties = schema?.properties ? Object.entries(schema.properties) : [];

  return (
    <main className="published-shell published-schema">
      <Link to="/" className="published-back">
        ← Published catalog
      </Link>

      {error && unconfigured && (
        <section className="published-error" role="alert">
          <strong>No published catalog is configured</strong>
          <p>
            This deployment has no IPFS catalog pointer, so published schemas cannot be resolved.
            Set <code>LEXICON_MANIFEST_IPNS</code> or <code>LEXICON_MANIFEST_URL</code> on the host.
          </p>
          <div className="published-error__actions">
            <Link to="/legacy">Use Legacy</Link>
          </div>
        </section>
      )}

      {error && !unconfigured && (
        <section className="published-error" role="alert">
          <strong>This schema didn’t load</strong>
          <p>
            {displayName(decodedName)} is stored on IPFS, and the public gateways didn’t answer in
            time. This usually clears within a few seconds.
          </p>
          <div className="published-error__actions">
            <button type="button" className="published-retry" onClick={retryNow}>
              Try again
            </button>
            <Link to="/">Back to catalog</Link>
          </div>
          <details className="published-error__details">
            <summary>Technical details</summary>
            <p>{error}</p>
          </details>
        </section>
      )}

      {!schema && !error && (
        <div className="published-loading">
          {attempt === 0 ? 'Resolving schema from IPFS…' : 'Still resolving from IPFS…'}
        </div>
      )}

      {schema && entry && (
        <>
          <header className="published-schema__header">
            <span className="published-schema__type">{entry.type}</span>
            <h1>{displayName(decodedName)}</h1>
            <p>{schema.description || 'Published JSON Schema definition.'}</p>
            <div className="published-schema__cid">
              <span>IPFS CID</span>
              <code>{entry.ipfsCid}</code>
              <a
                href={`https://ipfs.filebase.io/ipfs/${entry.ipfsCid}`}
                target="_blank"
                rel="noreferrer"
              >
                Open raw ↗
              </a>
            </div>
          </header>

          <section className="published-schema__facts">
            <div>
              <span>Schema dialect</span>
              <strong>{schema.$schema || 'Not declared'}</strong>
            </div>
            <div>
              <span>Object type</span>
              <strong>{renderValue(schema.type || 'Not declared')}</strong>
            </div>
            <div>
              <span>Properties</span>
              <strong>{properties.length}</strong>
            </div>
            <div>
              <span>Required</span>
              <strong>{schema.required?.length || 0}</strong>
            </div>
          </section>

          {properties.length > 0 && (
            <section className="published-properties">
              <div className="published-section__heading">
                <h2>Properties</h2>
                <span>{properties.length}</span>
              </div>
              <div className="published-property-list">
                {properties.map(([name, property]) => {
                  const targetName = property.cid ? cidTargets.get(property.cid) : undefined;
                  return (
                    <article className="published-property" key={name}>
                      <div className="published-property__name">
                        <code>{name}</code>
                        {schema.required?.includes(name) && <span>required</span>}
                      </div>
                      {property.description && <p>{property.description}</p>}
                      <dl>
                        {Object.entries(property)
                          .filter(([key]) => !['description', 'cid'].includes(key))
                          .map(([key, value]) => (
                            <div key={key}>
                              <dt>{key}</dt>
                              <dd>{renderValue(value)}</dd>
                            </div>
                          ))}
                      </dl>
                      {property.cid && (
                        <div className="published-property__link">
                          <span>Schema CID</span>
                          {targetName ? (
                            <Link to={`/schema/${encodeURIComponent(targetName)}`}>
                              {displayName(targetName)} →
                            </Link>
                          ) : (
                            <code>{property.cid}</code>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <details className="published-raw">
            <summary>Raw published JSON</summary>
            <pre>{JSON.stringify(schema, null, 2)}</pre>
          </details>
        </>
      )}
    </main>
  );
};

export default PublishedSchemaViewer;
