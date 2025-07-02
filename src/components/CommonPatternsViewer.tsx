import React, { useState } from 'react';
import { CommonPattern } from '../types/lexicon';

interface CommonPatternsViewerProps {
  patterns: CommonPattern[];
  searchTerm?: string;
}

const CommonPatternsViewer: React.FC<CommonPatternsViewerProps> = ({ patterns, searchTerm }) => {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      setTimeout(() => setCopiedValue(null), 2000);
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
    if (!searchTerm) return <span>{text}</span>;

    const lowerText = text.toLowerCase();
    const lowerSearch = searchTerm.toLowerCase();
    const index = lowerText.indexOf(lowerSearch);

    if (index === -1) return <span>{text}</span>;

    const before = text.substring(0, index);
    const match = text.substring(index, index + searchTerm.length);
    const after = text.substring(index + searchTerm.length);

    return (
      <span>
        {before}
        <mark>{match}</mark>
        {after}
      </span>
    );
  };

  if (patterns.length === 0) {
    return (
      <div className="no-results">
        <p>No common patterns found.</p>
      </div>
    );
  }

  return (
    <div className="common-patterns-viewer">
      <div className="patterns-header">
        <h3>Common Patterns & Formats</h3>
        <p>Standard patterns and formats</p>
      </div>

      <div className="patterns-content">
        <div className="patterns-grid">
          {patterns.map((pattern, index) => (
            <div key={index} className="pattern-card">
              <div className="pattern-header">
                <h4 className="pattern-name">{renderHighlightedText(pattern.type)}</h4>
              </div>

              <div className="pattern-description">
                {renderHighlightedText(pattern.properties.description)}
              </div>

              {pattern.properties.format && (
                <div className="pattern-format">
                  <span className="format-label">Format:</span>
                  <button
                    className={`format-value ${copiedValue === pattern.properties.format ? 'format-value-copied' : ''}`}
                    onClick={() => copyToClipboard(pattern.properties.format!)}
                    title="Click to copy format to clipboard"
                  >
                    {copiedValue === pattern.properties.format
                      ? '✓ Copied!'
                      : renderHighlightedText(pattern.properties.format)}
                  </button>
                </div>
              )}

              {pattern.properties.pattern && (
                <div className="pattern-regex">
                  <span className="pattern-label">Pattern:</span>
                  <button
                    className={`pattern-value ${copiedValue === pattern.properties.pattern ? 'pattern-value-copied' : ''}`}
                    onClick={() => copyToClipboard(pattern.properties.pattern!)}
                    title="Click to copy pattern to clipboard"
                  >
                    {copiedValue === pattern.properties.pattern
                      ? '✓ Copied!'
                      : renderHighlightedText(pattern.properties.pattern)}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CommonPatternsViewer;
