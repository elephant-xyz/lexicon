import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LexiconClass, SearchMatch } from '../types/lexicon';

interface LexiconClassViewerProps {
  classes: LexiconClass[];
  searchTerm?: string;
}

const LexiconClassViewer: React.FC<LexiconClassViewerProps> = ({ classes, searchTerm }) => {
  const navigate = useNavigate();
  const [expandedClasses, setExpandedClasses] = useState<Set<number>>(new Set());
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  // Auto-expand classes with property or relationship matches when searching
  useEffect(() => {
    if (searchTerm) {
      const newExpanded = new Set<number>();
      classes.forEach((cls, index) => {
        if (cls._hasPropertyMatches || cls._hasRelationshipMatches) {
          newExpanded.add(index);
        }
      });
      setExpandedClasses(newExpanded);
    }
  }, [searchTerm, classes]);

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedClasses);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedClasses(newExpanded);
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      setTimeout(() => setCopiedValue(null), 2000); // Clear feedback after 2 seconds
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
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
    if (matchedProps.length === 0) return true; // If no property matches, show all
    
    return matchedProps.includes(propName); // Only show matched properties
  };

  const renderHighlightedText = (text: string): JSX.Element => {
    return <span dangerouslySetInnerHTML={{ __html: text }} />;
  };

  const getHighlightedDescription = (cls: LexiconClass, propName: string): string => {
    if (!searchTerm || !cls._searchMatches) return '';
    
    const descMatch = cls._searchMatches.find(m => 
      m.type === 'property' && 
      m.field === 'description' && 
      m.value === propName
    );
    return descMatch?.highlightedDescription || '';
  };

  const getHighlightedEnumValues = (cls: LexiconClass, propName: string): Map<string, string> => {
    const enumHighlights = new Map<string, string>();
    if (!searchTerm || !cls._searchMatches) return enumHighlights;
    
    const enumMatches = cls._searchMatches.filter(m => 
      m.type === 'property' && 
      m.field === 'enum' && 
      m.value === propName
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
    
    const typeMatch = cls._searchMatches.find(m => 
      m.type === 'property' && 
      m.field === 'type' && 
      m.value === propName
    );
    return typeMatch?.highlightedType || '';
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

  const getHighlightedRelationshipName = (cls: LexiconClass, relName: string): string => {
    if (!searchTerm || !cls._searchMatches) return '';
    
    const relMatch = cls._searchMatches.find(m => 
      m.type === 'relationship' && 
      m.field === 'name' && 
      m.value === relName
    );
    return relMatch?.highlightedRelationshipName || '';
  };

  const getHighlightedRelationshipTargets = (cls: LexiconClass, relName: string): Map<string, string> => {
    const targetHighlights = new Map<string, string>();
    if (!searchTerm || !cls._searchMatches) return targetHighlights;
    
    const targetMatches = cls._searchMatches.filter(m => 
      m.type === 'relationship' && 
      m.field === 'target' && 
      m.value === relName
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
    
    const relDescMatch = cls._searchMatches.find(m => 
      m.type === 'relationship' && 
      m.field === 'description' && 
      m.value === relName
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
                  <>Found in {getMatchedProperties(cls).length} propert{getMatchedProperties(cls).length === 1 ? 'y' : 'ies'} and {getMatchedRelationships(cls).length} relationship{getMatchedRelationships(cls).length === 1 ? '' : 's'}</>
                )}
                {cls._hasPropertyMatches && !cls._hasRelationshipMatches && (
                  <>Found in {getMatchedProperties(cls).length} propert{getMatchedProperties(cls).length === 1 ? 'y' : 'ies'}</>
                )}
                {!cls._hasPropertyMatches && cls._hasRelationshipMatches && (
                  <>Found in {getMatchedRelationships(cls).length} relationship{getMatchedRelationships(cls).length === 1 ? '' : 's'}</>
                )}
              </div>
            )}
            {cls.is_deprecated && <div className="deprecated-badge">DEPRECATED</div>}
          </div>
          {expandedClasses.has(index) && (
            <div className="method-list-item-content">
              {(() => {
                const matchedProps = getMatchedProperties(cls);
                const hasVisibleProperties = Object.entries(cls.properties || {}).some(([propName]) => {
                  const isDeprecated = cls.deprecated_properties?.includes(propName);
                  return !isDeprecated && shouldShowProperty(cls, propName);
                });
                
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
                            {searchTerm && cls._searchMatches ? 
                              renderHighlightedText(
                                cls._searchMatches.find(m => 
                                  m.type === 'property' && m.value.replace(/<\/?mark>/g, '') === propName
                                )?.value || propName
                              ) : 
                              propName
                            }
                          </div>
                          <div className="method-list-item-label-type">
                            Type: {searchTerm && getHighlightedType(cls, propName) ? 
                              renderHighlightedText(getHighlightedType(cls, propName)) :
                              propData.type
                            }
                          </div>
                          {propData.enum && (
                            <div className="method-list-item-label-enum">
                              <span className="enum-label">Possible Values:</span>
                              <div className="enum-values">
                                {[...propData.enum].sort((a, b) => a.localeCompare(b)).map((value, idx) => {
                                  const enumHighlights = getHighlightedEnumValues(cls, propName);
                                  const highlightedValue = enumHighlights.get(value);
                                  
                                  return (
                                    <button 
                                      key={idx} 
                                      className={`enum-value ${copiedValue === value ? 'enum-value-copied' : ''}`}
                                      onClick={() => copyToClipboard(value)}
                                      title="Click to copy to clipboard"
                                    >
                                      {copiedValue === value ? '✓ Copied!' : 
                                        (searchTerm && highlightedValue ? 
                                          <span dangerouslySetInnerHTML={{ __html: highlightedValue }} /> :
                                          value
                                        )
                                      }
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          <div className="method-list-item-label-description">
                            {searchTerm && getHighlightedDescription(cls, propName) ? 
                              renderHighlightedText(getHighlightedDescription(cls, propName)) :
                              propData.comment || ''
                            }
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
                const hasVisibleRelationships = cls.relationships && Object.entries(cls.relationships).some(([relName]) => 
                  shouldShowRelationship(cls, relName)
                );
                
                if (!hasVisibleRelationships) return null;
                
                return (
                  <div className="relationships-section">
                    <h4>Relationships:</h4>
                    <div className="relationships-list">
                      {Object.entries(cls.relationships || {}).map(([relName, relData]) => {
                        if (!shouldShowRelationship(cls, relName)) return null;
                      
                      const matchedRels = getMatchedRelationships(cls);
                      const isMatchedRelationship = matchedRels.includes(relName);
                      const targetHighlights = getHighlightedRelationshipTargets(cls, relName);
                      
                      return (
                        <div 
                          key={relName} 
                          className={`method-list-item method-list-item-isChild ${isMatchedRelationship ? 'property-matched' : ''}`}
                        >
                          <div className="method-list-item-label">
                            <div className="method-list-item-label-name">
                              {searchTerm && getHighlightedRelationshipName(cls, relName) ? 
                                renderHighlightedText(getHighlightedRelationshipName(cls, relName)) :
                                relName
                              }
                            </div>
                            <div className="method-list-item-label-type">
                              Targets: [
                              {relData.targets?.map((target, idx) => {
                                const highlightedTarget = targetHighlights.get(target);
                                return (
                                  <span key={idx}>
                                    <button
                                      className="relationship-target-link"
                                      onClick={() => navigate(`/class/${target}`)}
                                      title={`Navigate to ${target} class`}
                                    >
                                      {searchTerm && highlightedTarget ? 
                                        renderHighlightedText(highlightedTarget) :
                                        target
                                      }
                                    </button>
                                    {idx < (relData.targets?.length || 0) - 1 ? ', ' : ''}
                                  </span>
                                );
                              }) || ''}
                              ]
                            </div>
                            <div className="method-list-item-label-description">
                              {searchTerm && getHighlightedRelationshipDescription(cls, relName) ? 
                                renderHighlightedText(getHighlightedRelationshipDescription(cls, relName)) :
                                relData.comment || ''
                              }
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