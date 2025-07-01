import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LexiconClass, LexiconTag } from '../types/lexicon';
import { schemaService } from '../services/schemaService';
import dataService from '../services/dataService';

interface LexiconClassViewerProps {
  classes: LexiconClass[];
  searchTerm?: string;
  expandByDefault?: boolean;
}

const LexiconClassViewer: React.FC<LexiconClassViewerProps> = ({
  classes,
  searchTerm,
  expandByDefault = false,
}) => {
  const navigate = useNavigate();
  const [expandedClasses, setExpandedClasses] = useState<Set<number>>(new Set());
  const [_expandedExamples, setExpandedExamples] = useState<Set<number>>(new Set());
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [schemaManifest, setSchemaManifest] = useState<Record<string, { ipfsCid: string }>>({});
  const [isBlockchainClass, setIsBlockchainClass] = useState<Set<string>>(new Set());

  // Auto-expand classes with property or relationship matches when searching, or expand by default
  useEffect(() => {
    const newExpanded = new Set<number>();

    if (expandByDefault) {
      // Expand all classes when expandByDefault is true
      classes.forEach((cls, index) => {
        newExpanded.add(index);
      });
    } else if (searchTerm) {
      // Auto-expand classes with matches when searching
      classes.forEach((cls, index) => {
        if (cls._hasPropertyMatches || cls._hasRelationshipMatches) {
          newExpanded.add(index);
        }
      });
    }

    setExpandedClasses(newExpanded);
  }, [searchTerm, classes, expandByDefault]);

  // Load schema manifest and blockchain classes
  useEffect(() => {
    schemaService.getManifest().then(manifest => {
      setSchemaManifest(manifest);
    });

    // Get blockchain classes
    const lexiconData = dataService.getAllData();
    const blockchainTag = lexiconData.tags.find((tag: LexiconTag) => tag.name === 'blockchain');
    if (blockchainTag) {
      setIsBlockchainClass(new Set(blockchainTag.classes));
    }
  }, []);

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedClasses);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedClasses(newExpanded);
  };

  const _toggleExampleExpanded = (index: number) => {
    const newExpanded = new Set(_expandedExamples);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedExamples(newExpanded);
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

  const scrollToCommonPattern = (format: string) => {
    const patternsSection = document.querySelector('.patterns-section');

    if (patternsSection) {
      patternsSection.scrollIntoView({ behavior: 'smooth' });
      // Highlight the specific pattern
      setTimeout(() => {
        const patternCards = document.querySelectorAll('.pattern-card');

        patternCards.forEach(card => {
          const patternName = card.querySelector('.pattern-name')?.textContent;

          // Map format values to pattern types, handling inconsistencies
          const formatToTypeMap: { [key: string]: string } = {
            currency: 'currency',
            currancy: 'currency', // Handle typo
            date: 'date',
            uri: 'uri',
            'ipfs-uri': 'ipfs_uri', // Handle hyphen vs underscore
            ipfs_uri: 'ipfs_uri',
            rate_percent: 'rate_percent',
          };

          const expectedType = formatToTypeMap[format];

          if (patternName === expectedType) {
            card.classList.add('pattern-highlighted');
            setTimeout(() => card.classList.remove('pattern-highlighted'), 3000);
          }
        });
      }, 500);
    }
  };

  const getHighlightedClassName = (cls: LexiconClass): string => {
    if (!searchTerm || !cls._searchMatches) return cls.type;

    const classMatch = cls._searchMatches.find(m => m.type === 'class' && m.field === 'type');
    return classMatch?.value || cls.type;
  };
  const getMatchedProperties = (cls: LexiconClass): string[] => {
    if (!searchTerm || !cls._searchMatches) return [];

    return cls._searchMatches
      .filter(m => m.type === 'property')
      .map(m => m.value.replace(/<\/?mark>/g, '')) // Remove highlight tags to get property name
      .filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates
  };

  const shouldShowProperty = (cls: LexiconClass, propName: string): boolean => {
    if (!searchTerm) return true; // Show all properties when not searching

    const matchedProps = getMatchedProperties(cls);

    // If we have property matches, only show matched properties
    if (matchedProps.length > 0) {
      return matchedProps.includes(propName);
    }

    // If no property matches but we have relationship matches, show no properties
    if (cls._hasRelationshipMatches) {
      return false;
    }

    // If no property or relationship matches, show all (this shouldn't happen in filtered results)
    return true;
  };

  const renderHighlightedText = (text: string): React.JSX.Element => {
    return <span dangerouslySetInnerHTML={{ __html: text }} />;
  };

  const getHighlightedDescription = (cls: LexiconClass, propName: string): string => {
    if (!searchTerm || !cls._searchMatches) return '';

    const descMatch = cls._searchMatches.find(
      m => m.type === 'property' && m.field === 'description' && m.value === propName
    );
    return descMatch?.highlightedDescription || '';
  };

  const getHighlightedEnumValues = (cls: LexiconClass, propName: string): Map<string, string> => {
    const enumHighlights = new Map<string, string>();
    if (!searchTerm || !cls._searchMatches) return enumHighlights;

    const enumMatches = cls._searchMatches.filter(
      m => m.type === 'property' && m.field === 'enum' && m.value === propName
    );

    enumMatches.forEach(match => {
      if (match.highlightedEnum) {
        // Extract the original enum value from the highlighted text
        const originalValue = match.highlightedEnum.replace(/<\/?mark>/g, '');
        enumHighlights.set(originalValue, match.highlightedEnum);
      }
    });

    return enumHighlights;
  };

  const getHighlightedType = (cls: LexiconClass, propName: string): string => {
    if (!searchTerm || !cls._searchMatches) return '';

    const typeMatch = cls._searchMatches.find(
      m => m.type === 'property' && m.field === 'type' && m.value === propName
    );
    return typeMatch?.highlightedType || '';
  };

  const getHighlightedPattern = (cls: LexiconClass, propName: string): string => {
    if (!searchTerm || !cls._searchMatches) return '';

    const patternMatch = cls._searchMatches.find(
      m => m.type === 'property' && m.field === 'pattern' && m.value === propName
    );
    return patternMatch?.highlightedPattern || '';
  };

  const getHighlightedFormat = (cls: LexiconClass, propName: string): string => {
    if (!searchTerm || !cls._searchMatches) return '';

    const formatMatch = cls._searchMatches.find(
      m => m.type === 'property' && m.field === 'format' && m.value === propName
    );
    return formatMatch?.highlightedFormat || '';
  };

  const getMatchedRelationships = (cls: LexiconClass): string[] => {
    if (!searchTerm || !cls._searchMatches) return [];

    return cls._searchMatches
      .filter(m => m.type === 'relationship')
      .map(m => m.value)
      .filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates
  };

  const shouldShowRelationship = (cls: LexiconClass, relName: string): boolean => {
    if (!searchTerm) return true; // Show all relationships when not searching

    const matchedRels = getMatchedRelationships(cls);

    // If we have relationship matches, only show matched relationships
    if (matchedRels.length > 0) {
      return matchedRels.includes(relName);
    }

    // If no relationship matches but we have property matches, show no relationships
    if (cls._hasPropertyMatches) {
      return false;
    }

    // If no property or relationship matches, show all (this shouldn't happen in filtered results)
    return true;
  };

  const shouldShowRelationshipBasedOnDeprecation = (
    cls: LexiconClass,
    relName: string
  ): boolean => {
    // Check if this relationship name corresponds to a deprecated property
    // Relationship names often match property names, so we check if the relationship name
    // is in the deprecated_properties list
    if (cls.deprecated_properties?.includes(relName)) {
      return false;
    }

    // Also check if the relationship name contains any deprecated property names
    // This handles cases where relationship names might be variations of property names
    const isRelatedToDeprecatedProperty = cls.deprecated_properties?.some(
      deprecatedProp =>
        relName.toLowerCase().includes(deprecatedProp.toLowerCase()) ||
        deprecatedProp.toLowerCase().includes(relName.toLowerCase())
    );

    return !isRelatedToDeprecatedProperty;
  };

  const getHighlightedRelationshipName = (cls: LexiconClass, relName: string): string => {
    if (!searchTerm || !cls._searchMatches) return '';

    const relMatch = cls._searchMatches.find(
      m => m.type === 'relationship' && m.field === 'name' && m.value === relName
    );
    return relMatch?.highlightedRelationshipName || '';
  };

  const getHighlightedRelationshipTargets = (
    cls: LexiconClass,
    relName: string
  ): Map<string, string> => {
    const targetHighlights = new Map<string, string>();
    if (!searchTerm || !cls._searchMatches) return targetHighlights;

    const targetMatches = cls._searchMatches.filter(
      m => m.type === 'relationship' && m.field === 'target' && m.value === relName
    );

    targetMatches.forEach(match => {
      if (match.highlightedRelationshipTarget) {
        // Extract the original target value from the highlighted text
        const originalTarget = match.highlightedRelationshipTarget.replace(/<\/?mark>/g, '');
        targetHighlights.set(originalTarget, match.highlightedRelationshipTarget);
      }
    });

    return targetHighlights;
  };

  const getHighlightedRelationshipDescription = (cls: LexiconClass, relName: string): string => {
    if (!searchTerm || !cls._searchMatches) return '';

    const relDescMatch = cls._searchMatches.find(
      m => m.type === 'relationship' && m.field === 'description' && m.value === relName
    );
    return relDescMatch?.highlightedRelationshipDescription || '';
  };

  return (
    <div className="lexicon-viewer">
      {classes.map((cls, index) => (
        <div key={index} className="method-list-item" data-type={cls.type}>
          <div className="method-list-item-label">
            <div className="method-list-item-header">
              <div className="method-list-item-label-name">
                {renderHighlightedText(getHighlightedClassName(cls))}
              </div>
              <button
                className="expand-button"
                onClick={() => toggleExpanded(index)}
                aria-label={expandedClasses.has(index) ? 'Collapse' : 'Expand'}
              >
                {expandedClasses.has(index) ? '−' : '+'}
              </button>
            </div>
            {searchTerm && (cls._hasPropertyMatches || cls._hasRelationshipMatches) && (
              <div className="search-match-indicator">
                {cls._hasPropertyMatches && cls._hasRelationshipMatches && (
                  <>
                    Found in {getMatchedProperties(cls).length} propert
                    {getMatchedProperties(cls).length === 1 ? 'y' : 'ies'} and{' '}
                    {getMatchedRelationships(cls).length} relationship
                    {getMatchedRelationships(cls).length === 1 ? '' : 's'}
                  </>
                )}
                {cls._hasPropertyMatches && !cls._hasRelationshipMatches && (
                  <>
                    Found in {getMatchedProperties(cls).length} propert
                    {getMatchedProperties(cls).length === 1 ? 'y' : 'ies'}
                  </>
                )}
                {!cls._hasPropertyMatches && cls._hasRelationshipMatches && (
                  <>
                    Found in {getMatchedRelationships(cls).length} relationship
                    {getMatchedRelationships(cls).length === 1 ? '' : 's'}
                  </>
                )}
              </div>
            )}
            {cls.is_deprecated && <div className="deprecated-badge">DEPRECATED</div>}
          </div>
          {expandedClasses.has(index) && (
            <div className="method-list-item-content">
              {cls.description && (
                <div className="class-description-section">
                  <div className="class-description">{cls.description}</div>
                </div>
              )}
              {cls.source_url && (
                <div className="class-source-section">
                  <div className="class-source">
                    <span className="source-label">Source URL:</span>
                    <div className="source-details">
                      <span className="source-type">Type: {cls.source_url.type}</span>
                      <span className="source-format">Format: {cls.source_url.format}</span>
                    </div>
                    {cls.source_url.comment && (
                      <div className="source-description">{cls.source_url.comment}</div>
                    )}
                  </div>
                </div>
              )}

              {/* JSON Schema and Example Downloads for blockchain classes */}
              {isBlockchainClass.has(cls.type) && schemaManifest[cls.type] && (
                <div className="json-schema-section">
                  <div className="json-schema-link">
                    <span className="json-schema-label">JSON Schema:</span>
                    <a
                      href={schemaService.getIPFSUrl(schemaManifest[cls.type].ipfsCid)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ipfs-download-link"
                      title="Download schema from IPFS"
                    >
                      📥 Download from IPFS
                    </a>
                    <button
                      className={`cid-copy-button ${copiedValue === schemaManifest[cls.type].ipfsCid ? 'cid-copy-button-copied' : ''}`}
                      onClick={() => copyToClipboard(schemaManifest[cls.type].ipfsCid)}
                      title="Click to copy CID to clipboard"
                    >
                      {copiedValue === schemaManifest[cls.type].ipfsCid
                        ? '✓ Copied!'
                        : `CID: ${schemaManifest[cls.type].ipfsCid}`}
                    </button>
                  </div>
                </div>
              )}
              {/* Single Example Display */}
              {cls.example &&
                isBlockchainClass.has(cls.type) &&
                schemaManifest[`${cls.type}_example`] && (
                  <div className="json-example-section">
                    <div className="json-example-link">
                      <span className="json-example-label">JSON Example:</span>
                      <a
                        href={schemaService.getIPFSUrl(
                          schemaManifest[`${cls.type}_example`].ipfsCid
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ipfs-download-link"
                        title="Download example from IPFS"
                      >
                        📥 Download from IPFS
                      </a>
                      <button
                        className={`cid-copy-button ${copiedValue === schemaManifest[`${cls.type}_example`].ipfsCid ? 'cid-copy-button-copied' : ''}`}
                        onClick={() =>
                          copyToClipboard(schemaManifest[`${cls.type}_example`].ipfsCid)
                        }
                        title="Click to copy CID to clipboard"
                      >
                        {copiedValue === schemaManifest[`${cls.type}_example`].ipfsCid
                          ? '✓ Copied!'
                          : `CID: ${schemaManifest[`${cls.type}_example`].ipfsCid}`}
                      </button>
                    </div>
                  </div>
                )}

              {/* Multiple Examples Display */}
              {cls.examples && cls.examples.length > 0 && (
                <div className="json-examples-section">
                  <h4>JSON Examples:</h4>
                  <div className="examples-list">
                    {cls.examples.map((example, index) => {
                      // For relationship class, show IPFS download links with type labels
                      if (cls.type === 'relationship' && 'type' in example) {
                        const exampleType = (example as Record<string, unknown>).type as string;
                        const exampleKey = `${cls.type}_${exampleType}_example`;
                        const exampleCid = schemaManifest[exampleKey]?.ipfsCid;

                        if (exampleCid) {
                          const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${exampleCid}`;
                          return (
                            <div key={index} className="example-item">
                              <div className="example-header">
                                <span className="example-label">{exampleType}:</span>
                              </div>
                              <div className="example-content">
                                <div className="example-ipfs-links">
                                  <a
                                    href={ipfsUrl}
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
                                    {copiedValue === exampleCid
                                      ? '✓ Copied!'
                                      : `CID: ${exampleCid}`}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        }
                      }

                      // For other classes, show the full JSON with copy button
                      return (
                        <div key={index} className="example-item">
                          <div className="example-header">
                            <span className="example-label">Example {index + 1}:</span>
                            {(() => {
                              const desc = (example as Record<string, unknown>).description;
                              return typeof desc === 'string' ? (
                                <span className="example-description">{desc}</span>
                              ) : null;
                            })()}
                          </div>
                          <div className="example-content">
                            <button
                              className={`example-copy-button ${copiedValue === JSON.stringify(example, null, 2) ? 'example-copy-button-copied' : ''}`}
                              onClick={() => copyToClipboard(JSON.stringify(example, null, 2))}
                              title="Click to copy example to clipboard"
                            >
                              {copiedValue === JSON.stringify(example, null, 2)
                                ? '✓ Copied!'
                                : 'Copy Example'}
                            </button>
                            <div className="example-json">
                              <pre>{JSON.stringify(example, null, 2)}</pre>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {(() => {
                const matchedProps = getMatchedProperties(cls);
                const hasVisibleProperties = Object.entries(cls.properties || {}).some(
                  ([propName]) => {
                    const isDeprecated = cls.deprecated_properties?.includes(propName);
                    return !isDeprecated && shouldShowProperty(cls, propName);
                  }
                );

                if (!hasVisibleProperties) return null;

                return (
                  <div className="properties-section">
                    <h4>Properties:</h4>
                    <div className="properties-list">
                      {Object.entries(cls.properties || {}).map(([propName, propData]) => {
                        const isDeprecated = cls.deprecated_properties?.includes(propName);
                        if (isDeprecated || !shouldShowProperty(cls, propName)) return null;

                        const isMatchedProperty = matchedProps.includes(propName);

                        return (
                          <div
                            key={propName}
                            className={`method-list-item method-list-item-isChild ${isMatchedProperty ? 'property-matched' : ''}`}
                          >
                            <div className="method-list-item-label">
                              <div className="method-list-item-label-name">
                                <span className="property-name">
                                  {searchTerm && cls._searchMatches
                                    ? renderHighlightedText(
                                        cls._searchMatches.find(
                                          m =>
                                            m.type === 'property' &&
                                            m.value.replace(/<\/?mark>/g, '') === propName
                                        )?.value || propName
                                      )
                                    : propName}
                                </span>
                                {cls.required?.includes(propName) && (
                                  <span className="required-badge" title="This field is required">
                                    Required
                                  </span>
                                )}
                              </div>
                              <div className="method-list-item-label-type">
                                <span className="property-type-label">Data Type</span>
                                <span className="property-type-value">
                                  {searchTerm && getHighlightedType(cls, propName)
                                    ? renderHighlightedText(getHighlightedType(cls, propName))
                                    : propData.type}
                                </span>
                              </div>
                              {propData.enum && (
                                <div className="method-list-item-label-enum">
                                  <span className="enum-label">Possible Values:</span>
                                  <div className="enum-values">
                                    {[...propData.enum]
                                      .sort((a, b) => a.localeCompare(b))
                                      .map((value, idx) => {
                                        const enumHighlights = getHighlightedEnumValues(
                                          cls,
                                          propName
                                        );
                                        const highlightedValue = enumHighlights.get(value);

                                        return (
                                          <button
                                            key={idx}
                                            className={`enum-value ${copiedValue === value ? 'enum-value-copied' : ''}`}
                                            onClick={() => copyToClipboard(value)}
                                            title="Click to copy to clipboard"
                                          >
                                            {copiedValue === value ? (
                                              '✓ Copied!'
                                            ) : searchTerm && highlightedValue ? (
                                              <span
                                                dangerouslySetInnerHTML={{
                                                  __html: highlightedValue,
                                                }}
                                              />
                                            ) : (
                                              value
                                            )}
                                          </button>
                                        );
                                      })}
                                  </div>
                                </div>
                              )}
                              {propData.pattern && (
                                <div className="method-list-item-label-pattern">
                                  <span className="pattern-label">Pattern:</span>
                                  <button
                                    className={`pattern-value ${copiedValue === propData.pattern ? 'pattern-value-copied' : ''}`}
                                    onClick={() => copyToClipboard(propData.pattern!)}
                                    title="Click to copy pattern to clipboard"
                                  >
                                    {copiedValue === propData.pattern ? (
                                      '✓ Copied!'
                                    ) : searchTerm && getHighlightedPattern(cls, propName) ? (
                                      <span
                                        dangerouslySetInnerHTML={{
                                          __html: getHighlightedPattern(cls, propName),
                                        }}
                                      />
                                    ) : (
                                      propData.pattern
                                    )}
                                  </button>
                                </div>
                              )}
                              {propData.format && (
                                <div className="method-list-item-label-format">
                                  <span className="format-label">Format:</span>
                                  <button
                                    className={`format-value format-link ${copiedValue === propData.format ? 'format-value-copied' : ''}`}
                                    onClick={() => scrollToCommonPattern(propData.format!)}
                                    title="Click to view format details in Common Patterns section"
                                  >
                                    {searchTerm && getHighlightedFormat(cls, propName) ? (
                                      <span
                                        dangerouslySetInnerHTML={{
                                          __html: getHighlightedFormat(cls, propName),
                                        }}
                                      />
                                    ) : (
                                      propData.format
                                    )}
                                  </button>
                                </div>
                              )}
                              <div className="method-list-item-label-description">
                                {searchTerm && getHighlightedDescription(cls, propName)
                                  ? renderHighlightedText(getHighlightedDescription(cls, propName))
                                  : propData.comment || ''}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const matchedRels = getMatchedRelationships(cls);
                const hasVisibleRelationships =
                  cls.relationships &&
                  Object.entries(cls.relationships).some(
                    ([relName]) =>
                      shouldShowRelationship(cls, relName) &&
                      shouldShowRelationshipBasedOnDeprecation(cls, relName)
                  );

                if (!hasVisibleRelationships) return null;

                return (
                  <div className="relationships-section">
                    <h4>Relationships:</h4>
                    <div className="relationships-list">
                      {Object.entries(cls.relationships || {}).map(([relName, relData]) => {
                        if (
                          !shouldShowRelationship(cls, relName) ||
                          !shouldShowRelationshipBasedOnDeprecation(cls, relName)
                        )
                          return null;

                        const isMatchedRelationship = matchedRels.includes(relName);
                        const targetHighlights = getHighlightedRelationshipTargets(cls, relName);

                        return (
                          <div
                            key={relName}
                            className={`method-list-item method-list-item-isChild ${isMatchedRelationship ? 'property-matched' : ''}`}
                          >
                            <div className="method-list-item-label">
                              <div className="method-list-item-label-name">
                                {searchTerm && getHighlightedRelationshipName(cls, relName)
                                  ? renderHighlightedText(
                                      getHighlightedRelationshipName(cls, relName)
                                    )
                                  : relName}
                              </div>
                              <div className="relationship-targets-container">
                                <span className="relationship-targets-label">Links To</span>
                                {relData.targets?.map((target, idx) => {
                                  const highlightedTarget = targetHighlights.get(target);
                                  return (
                                    <button
                                      key={idx}
                                      className="relationship-target-link"
                                      onClick={() => navigate(`/class/${target}`)}
                                      title={`Navigate to ${target} class`}
                                    >
                                      {searchTerm && highlightedTarget
                                        ? renderHighlightedText(highlightedTarget)
                                        : target}
                                    </button>
                                  );
                                }) || ''}
                              </div>
                              <div className="method-list-item-label-description">
                                {searchTerm && getHighlightedRelationshipDescription(cls, relName)
                                  ? renderHighlightedText(
                                      getHighlightedRelationshipDescription(cls, relName)
                                    )
                                  : relData.comment || ''}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default LexiconClassViewer;
