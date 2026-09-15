import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  displayName,
  getManifest,
  ManifestEntry,
  PublishedSchemaType,
  SchemaManifest,
} from './services/ipfsCatalog';
import './styles.css';

interface CatalogSection {
  id: string;
  label: string;
  type: PublishedSchemaType;
  entries: Array<[string, ManifestEntry]>;
}

function isExample(name: string): boolean {
  return name.toLowerCase().includes('example');
}

const PublishedCatalogViewer: React.FC = () => {
  const [manifest, setManifest] = useState<SchemaManifest | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    getManifest()
      .then(value => {
        if (active) setManifest(value);
      })
      .catch(reason => {
        if (active) setError(reason instanceof Error ? reason.message : 'Manifest request failed.');
      });
    return () => {
      active = false;
    };
  }, []);

  const sections = useMemo<CatalogSection[]>(() => {
    if (!manifest) return [];
    const entries = Object.entries(manifest);
    const filter = ([name]: [string, ManifestEntry]) =>
      name.toLowerCase().includes(query.trim().toLowerCase());

    return [
      {
        id: 'data-groups',
        label: 'Data groups',
        type: 'dataGroup',
        entries: entries.filter(([, entry]) => entry.type === 'dataGroup').filter(filter),
      },
      {
        id: 'classes',
        label: 'Classes',
        type: 'class',
        entries: entries
          .filter(([name, entry]) => entry.type === 'class' && !isExample(name))
          .filter(filter),
      },
      {
        id: 'relationships',
        label: 'Relationships',
        type: 'relationship',
        entries: entries.filter(([, entry]) => entry.type === 'relationship').filter(filter),
      },
      {
        id: 'examples',
        label: 'Examples',
        type: 'class',
        entries: entries
          .filter(([name, entry]) => entry.type === 'class' && isExample(name))
          .filter(filter),
      },
    ];
  }, [manifest, query]);

  const total = manifest ? Object.keys(manifest).length : 0;

  return (
    <main className="published-shell">
      <header className="published-hero">
        <div className="published-hero__eyebrow">
          <span className="published-status-dot" />
          Content-addressed source
        </div>
        <img src="/logoElephant-white.svg" alt="Elephant" className="published-hero__logo" />
        <h1>Elephant Lexicon</h1>
        <p>
          The published data model, read directly from immutable IPFS schemas. Every definition
          below is identified by its content.
        </p>
        <div className="published-proof">
          <span>LIVE MANIFEST</span>
          <strong>{manifest ? `${total} published objects` : 'Resolving catalog…'}</strong>
          <code>/json-schemas/schema-manifest.json</code>
        </div>
      </header>

      <section className="published-controls" aria-label="Catalog controls">
        <label htmlFor="published-search">Find a published schema</label>
        <input
          id="published-search"
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search groups, classes, relationships…"
        />
      </section>

      {error && (
        <section className="published-error" role="alert">
          <strong>Published catalog unavailable</strong>
          <p>{error}</p>
          <p>The legacy git working copy remains available from the Legacy tab.</p>
        </section>
      )}

      {!manifest && !error && <div className="published-loading">Resolving the IPFS catalog…</div>}

      {manifest && (
        <div className="published-sections">
          {sections.map(section => (
            <section className="published-section" key={section.id} id={section.id}>
              <div className="published-section__heading">
                <h2>{section.label}</h2>
                <span>{section.entries.length}</span>
              </div>
              {section.entries.length > 0 ? (
                <div className="published-grid">
                  {section.entries.map(([name, entry]) => (
                    <Link
                      to={`/schema/${encodeURIComponent(name)}`}
                      className="published-card"
                      key={name}
                    >
                      <span className="published-card__type">
                        {section.id === 'examples' ? 'example' : entry.type}
                      </span>
                      <strong>{displayName(name)}</strong>
                      <code title={entry.ipfsCid}>{entry.ipfsCid}</code>
                      <span className="published-card__open">Open schema →</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="published-section__empty">No published schemas match “{query}”.</p>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
};

export default PublishedCatalogViewer;
