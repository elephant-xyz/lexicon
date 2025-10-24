import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataGroup } from '../types/lexicon';
import { schemaService } from '../services/schemaService';

interface DataGroupViewerProps {
  dataGroups: DataGroup[];
  searchTerm?: string;
}

export const DataGroupViewer: React.FC<DataGroupViewerProps> = ({ dataGroups, searchTerm }) => {
  const navigate = useNavigate();
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [expandedDeprecatedRelationships, setExpandedDeprecatedRelationships] = useState<Set<string>>(new Set());
  const [schemaManifest, setSchemaManifest] = useState<
    Record<string, { ipfsCid: string; type: string }>
  >({});
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  // Load schema manifest
  useEffect(() => {
    schemaService.getManifest().then(manifest => {
      setSchemaManifest(manifest);
    });
  }, []);

  // Auto-expand groups with matches when searching
  useEffect(() => {
    const newExpanded = new Set<number>();

    if (searchTerm) {
      dataGroups.forEach((group, index) => {
        if (group._searchMatches && group._searchMatches.length > 0) {
          newExpanded.add(index);
        }
      });
      setExpandedGroups(newExpanded);
    } else {
      // Collapse all when not searching
      setExpandedGroups(new Set());
    }
  }, [searchTerm, dataGroups]);

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedGroups(newExpanded);
  };

  const toggleDeprecatedRelationshipsExpanded = (groupLabel: string) => {
    const newExpanded = new Set(expandedDeprecatedRelationships);
    if (newExpanded.has(groupLabel)) {
      newExpanded.delete(groupLabel);
    } else {
      newExpanded.add(groupLabel);
    }
    setExpandedDeprecatedRelationships(newExpanded);
  };

  const handleClassClick = (className: string) => {
    navigate(`/class/${className}`);
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      setTimeout(() => setCopiedValue(null), 2000); // Clear feedback after 2 seconds
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = value;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedValue(value);
      setTimeout(() => setCopiedValue(null), 2000);
    }
  };

  const renderHighlightedText = (text: string): React.JSX.Element => {
    return <span dangerouslySetInnerHTML={{ __html: text }} />;
  };

  const getHighlightedGroupName = (group: DataGroup): string => {
    if (!searchTerm || !group._searchMatches) return group.label;

    const classMatch = group._searchMatches.find(m => m.type === 'class' && m.field === 'type');
    return classMatch?.value || group.label;
  };

  const isOneToManyRelationship = (relationshipType: string, group: DataGroup): boolean => {
    // Check if the group has one_to_many_relationships property and if the relationship type is in it
    return group.one_to_many_relationships?.includes(relationshipType) || false;
  };

  return (
    <div className="lexicon-viewer">
      {dataGroups.map((group, index) => (
        <div key={index} className="method-list-item data-group" data-type={group.label}>
          <div className="method-list-item-label">
            <div className="method-list-item-header">
              <div className="method-list-item-label-name">
                {renderHighlightedText(getHighlightedGroupName(group))}
              </div>
              <button
                className="expand-button"
                onClick={() => toggleExpanded(index)}
                aria-label={expandedGroups.has(index) ? 'Collapse' : 'Expand'}
              >
                {expandedGroups.has(index) ? '−' : '+'}
              </button>
            </div>
            {searchTerm && group._searchMatches && group._searchMatches.length > 0 && (
              <div className="search-match-indicator">
                Found in {group._searchMatches.length} match
                {group._searchMatches.length === 1 ? '' : 'es'}
              </div>
            )}
          </div>

          {expandedGroups.has(index) && (
            <div className="method-list-item-content">
              {/* JSON Schema Download for data groups */}
              {(() => {
                const groupKey = group.label.replace(/\s+/g, '_');
                const schemaInfo = schemaManifest[groupKey];
                return schemaInfo && schemaInfo.type === 'dataGroup' ? (
                  <div className="json-schema-section">
                    <div className="json-schema-link">
                      <span className="json-schema-label">Data Group Schema:</span>
                      <a
                        href={schemaService.getIPFSUrl(schemaInfo.ipfsCid)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ipfs-download-link"
                        title="Download schema from IPFS"
                      >
                        📥 Download from IPFS
                      </a>
                      <button
                        className={`cid-copy-button ${copiedValue === schemaInfo.ipfsCid ? 'cid-copy-button-copied' : ''}`}
                        onClick={() => copyToClipboard(schemaInfo.ipfsCid)}
                        title="Click to copy CID to clipboard"
                      >
                        {copiedValue === schemaInfo.ipfsCid
                          ? '✓ Copied!'
                          : `CID: ${schemaInfo.ipfsCid}`}
                      </button>
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Data Group Example Display */}
              {group.example &&
                (() => {
                  const groupKey = group.label.replace(/\s+/g, '_');
                  const exampleKey = `${groupKey}_example`;
                  const exampleCid = schemaManifest[exampleKey]?.ipfsCid;

                  if (exampleCid) {
                    return (
                      <div className="json-example-section">
                        <div className="json-example-link">
                          <span className="json-example-label">JSON Example:</span>
                          <a
                            href={schemaService.getIPFSUrl(exampleCid)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ipfs-download-link"
                            title="Download example from IPFS"
                          >
                            📥 Download from IPFS
                          </a>
                          <button
                            className={`cid-copy-button ${copiedValue === exampleCid ? 'cid-copy-button-copied' : ''}`}
                            onClick={() => copyToClipboard(exampleCid)}
                            title="Click to copy CID to clipboard"
                          >
                            {copiedValue === exampleCid ? '✓ Copied!' : `CID: ${exampleCid}`}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // Fallback to showing full JSON if no CID found
                  return (
                    <div className="json-examples-section">
                      <h4>JSON Example:</h4>
                      <div className="examples-list">
                        <div className="example-item">
                          <div className="example-header">
                            <span className="example-label">Example</span>
                          </div>
                          <div className="example-content">
                            <button
                              className={`example-copy-button`}
                              onClick={() =>
                                navigator.clipboard.writeText(
                                  JSON.stringify(group.example, null, 2)
                                )
                              }
                              title="Click to copy example to clipboard"
                            >
                              Copy Example
                            </button>
                            <div className="example-json">
                              <pre>{JSON.stringify(group.example, null, 2)}</pre>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              <div className="relationships-section">
                <h4>Relationships:</h4>
                <div className="relationships-list">
                  {(() => {
                    // Separate deprecated and non-deprecated relationships
                    const nonDeprecatedRels = group.relationships.filter(
                      rel => !group.deprecated_relationships?.includes(rel.relationship_type)
                    );
                    const deprecatedRels = group.relationships.filter(
                      rel => group.deprecated_relationships?.includes(rel.relationship_type)
                    );

                    const renderRelationship = (rel: any, isDeprecated: boolean = false) => {
                      const relKey = `${rel.from}_to_${rel.to}`;
                      const relSchemaInfo = schemaManifest[relKey];

                      return (
                        <div key={relKey} className={`method-list-item method-list-item-isChild ${isDeprecated ? 'relationship-deprecated' : ''}`}>
                          <div className="method-list-item-label">
                            <div className="method-list-item-label-name">
                              {rel.relationship_type || `has_${rel.to}`}
                              {isOneToManyRelationship(rel.relationship_type, group) && (
                                <span
                                  className="array-indicator"
                                  title="One-to-many relationship (array)"
                                >
                                  [Array]
                                </span>
                              )}
                              {group.required?.includes(rel.relationship_type) && (
                                <span
                                  className="required-badge"
                                  title="This relationship is required"
                                >
                                  Required
                                </span>
                              )}
                            </div>
                            <div className="method-list-item-label-description">
                              <div className="relationship-targets-container">
                                <span className="relationship-targets-label">Links to</span>
                                <span className="relationship-from">
                                  From
                                  <button
                                    className="relationship-target-link"
                                    onClick={() => handleClassClick(rel.from)}
                                    title={`Navigate to ${rel.from} class`}
                                  >
                                    {rel.from}
                                  </button>
                                </span>
                                <span className="relationship-arrow">→</span>
                                <span className="relationship-to">
                                  To
                                  <button
                                    className="relationship-target-link"
                                    onClick={() => handleClassClick(rel.to)}
                                    title={`Navigate to ${rel.to} class`}
                                  >
                                    {rel.to}
                                  </button>
                                </span>
                              </div>
                              {relSchemaInfo && relSchemaInfo.type === 'relationship' && (
                                <div className="relationship-schema-link">
                                  <a
                                    href={schemaService.getIPFSUrl(relSchemaInfo.ipfsCid)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ipfs-download-link"
                                    title={`Download ${relKey} schema from IPFS`}
                                  >
                                    📥 Schema
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    };

                    return (
                      <>
                        {/* Non-deprecated relationships */}
                        {nonDeprecatedRels.map(rel => renderRelationship(rel, false))}
                        
                        {/* Deprecated relationships section */}
                        {deprecatedRels.length > 0 && (
                          <div className="deprecated-relationships-section">
                            <div className="deprecated-relationships-header">
                              <h4 className="deprecated-relationships-label">Deprecated Relationships:</h4>
                              <button
                                className="deprecated-relationships-toggle"
                                onClick={() => toggleDeprecatedRelationshipsExpanded(group.label)}
                                aria-label={expandedDeprecatedRelationships.has(group.label) ? 'Collapse deprecated relationships' : 'Expand deprecated relationships'}
                              >
                                <span className="deprecated-relationships-arrow">{expandedDeprecatedRelationships.has(group.label) ? '−' : '+'}</span>
                              </button>
                            </div>
                            
                            {expandedDeprecatedRelationships.has(group.label) && (
                              <div className="deprecated-relationships-content">
                                {deprecatedRels.map(rel => renderRelationship(rel, true))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {searchTerm && group._searchMatches && group._searchMatches.length > 0 && (
                <div className="search-matches-section">
                  <h4>Search Matches:</h4>
                  <div className="search-matches-list">
                    {group._searchMatches.map((match, matchIndex) => (
                      <div key={matchIndex} className="method-list-item method-list-item-isChild">
                        <div className="method-list-item-label">
                          <div className="method-list-item-label-name">{match.field}</div>
                          <div className="method-list-item-label-description">
                            {renderHighlightedText(
                              match.highlightedRelationshipTarget || match.value
                            )}
                            <span className="match-score">
                              {' '}
                              ({(match.score * 100).toFixed(0)}% match)
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
