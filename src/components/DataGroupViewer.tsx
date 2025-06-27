import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DataGroup } from '../types/lexicon';

interface DataGroupViewerProps {
  dataGroups: DataGroup[];
}

export const DataGroupViewer: React.FC<DataGroupViewerProps> = ({ dataGroups }) => {
  const navigate = useNavigate();

  const handleClassClick = (className: string) => {
    navigate(`/class/${className}`);
  };

  return (
    <div className="data-groups-section">
      <h2>Data Groups</h2>
      {dataGroups.map((group, index) => (
        <div key={index} className="lexicon-class data-group">
          <div className="class-header">
            <h3 className="class-name">{group.label}</h3>
            <span className="class-type">Data Group</span>
          </div>
          
          <div className="class-body">
            <div className="relationships-section">
              <h4>Relationships</h4>
              <div className="relationships-list">
                {group.relationships.map((rel, relIndex) => (
                  <div key={relIndex} className="relationship-item">
                    <div className="relationship-header">
                      <span className="relationship-name">
                        Relationship {relIndex + 1}
                      </span>
                    </div>
                    <div className="relationship-targets">
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
                ))}
              </div>
            </div>
          </div>

          {group._searchMatches && group._searchMatches.length > 0 && (
            <div className="search-matches">
              <h4>Search Matches</h4>
              <ul>
                {group._searchMatches.map((match, matchIndex) => (
                  <li key={matchIndex} className="search-match">
                    <strong>{match.field}:</strong>
                    <span dangerouslySetInnerHTML={{ 
                      __html: match.highlightedRelationshipTarget || match.value 
                    }} />
                    <span className="match-score">({(match.score * 100).toFixed(0)}% match)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};