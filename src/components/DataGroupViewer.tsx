import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataGroup } from '../types/lexicon';

interface DataGroupViewerProps {
  dataGroups: DataGroup[];
  searchTerm?: string;
}

export const DataGroupViewer: React.FC<DataGroupViewerProps> = ({ dataGroups, searchTerm }) => {
  const navigate = useNavigate();
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

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

  const handleClassClick = (className: string) => {
    navigate(`/class/${className}`);
  };

  const renderHighlightedText = (text: string): React.JSX.Element => {
    return <span dangerouslySetInnerHTML={{ __html: text }} />;
  };

  const getHighlightedGroupName = (group: DataGroup): string => {
    if (!searchTerm || !group._searchMatches) return group.label;

    const classMatch = group._searchMatches.find(m => m.type === 'class' && m.field === 'type');
    return classMatch?.value || group.label;
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
              <div className="relationships-section">
                <h4>Relationships:</h4>
                <div className="relationships-list">
                  {group.relationships.map((rel, relIndex) => (
                    <div key={relIndex} className="method-list-item method-list-item-isChild">
                      <div className="method-list-item-label">
                        <div className="method-list-item-label-name">
                          {rel.relationship_type || `has_${rel.to}`}
                        </div>
                        <div className="method-list-item-label-description">
                          <div className="relationship-targets-container">
                            <span className="relationship-targets-label">Links To</span>
                            <span className="relationship-from">
                              From:
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
                              To:
                              <button
                                className="relationship-target-link"
                                onClick={() => handleClassClick(rel.to)}
                                title={`Navigate to ${rel.to} class`}
                              >
                                {rel.to}
                              </button>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
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
