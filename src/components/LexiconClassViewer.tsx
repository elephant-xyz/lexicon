import React from 'react';
import { LexiconClass } from '../types/lexicon';

interface LexiconClassViewerProps {
  classes: LexiconClass[];
}

const LexiconClassViewer: React.FC<LexiconClassViewerProps> = ({ classes }) => {
  return (
    <div className="lexicon-viewer">
      {classes.map((cls, index) => (
        <div key={index} className="method-list-item" data-type={cls.type}>
          <div className="method-list-item-label">
            <div className="method-list-item-label-name">{cls.type}</div>
            <div className="method-list-item-label-description">Container: {cls.container_name}</div>
            {cls.is_deprecated && <div className="deprecated-badge">DEPRECATED</div>}
          </div>
          <div className="method-list-item-content">
            <div className="properties-section">
              <h4>Properties:</h4>
              <div className="properties-list">
                {Object.entries(cls.properties || {}).map(([propName, propData]) => {
                  const isDeprecated = cls.deprecated_properties?.includes(propName);
                  if (isDeprecated) return null;
                  
                  return (
                    <div key={propName} className="method-list-item method-list-item-isChild">
                      <div className="method-list-item-label">
                        <div className="method-list-item-label-name">{propName}</div>
                        <div className="method-list-item-label-type">Type: {propData.type}</div>
                        {propData.enum && (
                          <div className="method-list-item-label-enum">
                            Enum: [{propData.enum.join(', ')}]
                          </div>
                        )}
                        <div className="method-list-item-label-description">{propData.comment || ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {cls.relationships && Object.keys(cls.relationships).length > 0 && (
              <div className="relationships-section">
                <h4>Relationships:</h4>
                <div className="relationships-list">
                  {Object.entries(cls.relationships).map(([relName, relData]) => (
                    <div key={relName} className="method-list-item method-list-item-isChild">
                      <div className="method-list-item-label">
                        <div className="method-list-item-label-name">{relName}</div>
                        <div className="method-list-item-label-type">
                          Targets: [{relData.targets?.join(', ') || ''}]
                        </div>
                        <div className="method-list-item-label-description">{relData.comment || ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default LexiconClassViewer;