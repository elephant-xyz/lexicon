import React, { useState } from 'react';
import { CommonPattern } from '../types/lexicon';

interface CommonPatternsViewerProps {
  patterns: CommonPattern[];
  searchTerm?: string;
}

const CommonPatternsViewer: React.FC<CommonPatternsViewerProps> = ({ patterns, searchTerm }) => {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [expandedPatterns, setExpandedPatterns] = useState<Set<number>>(new Set());

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

  const navigateToPattern = (patternType: string) => {
    // Find the pattern element by its type
    const patternElement = document.querySelector(`[data-pattern-type="${patternType}"]`);
    if (patternElement) {
      // Scroll to the pattern
      patternElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Add highlight effect
      patternElement.classList.add('pattern-highlighted');
      setTimeout(() => {
        patternElement.classList.remove('pattern-highlighted');
      }, 2000);
    }
  };

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedPatterns);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedPatterns(newExpanded);
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
    <div className="lexicon-viewer">
      <div className="section-separator">
        <div className="separator-line"></div>
        <span className="separator-text">Common Patterns & Formats</span>
        <div className="separator-line"></div>
      </div>
      {patterns.map((pattern, index) => (
        <div
          key={index}
          className="method-list-item data-group"
          data-type={pattern.type}
          data-pattern-type={pattern.properties.format || pattern.format}
        >
          <div className="method-list-item-label">
            <div className="method-list-item-header">
              <div className="method-list-item-label-name">
                {renderHighlightedText(pattern.type)}
              </div>
              <button
                className="expand-button"
                onClick={() => toggleExpanded(index)}
                aria-label={expandedPatterns.has(index) ? 'Collapse' : 'Expand'}
              >
                {expandedPatterns.has(index) ? '−' : '+'}
              </button>
            </div>
          </div>
          {expandedPatterns.has(index) && (
            <div className="method-list-item-content">
              <div className="pattern-description" style={{ marginBottom: 16 }}>
                {renderHighlightedText(pattern.properties.description)}
              </div>
              {(pattern.properties.format || pattern.format) && (
                <div className="pattern-format" style={{ marginBottom: 16 }}>
                  <span className="format-label">Format:</span>
                  <button
                    className={`format-value ${copiedValue === (pattern.properties.format || pattern.format) ? 'format-value-copied' : ''}`}
                    onClick={() => {
                      copyToClipboard(pattern.properties.format || pattern.format!);
                      navigateToPattern(pattern.properties.format || pattern.format!);
                    }}
                    title="Click to copy format and navigate to pattern"
                    style={{ marginLeft: 8 }}
                  >
                    {copiedValue === (pattern.properties.format || pattern.format)
                      ? '✓ Copied!'
                      : renderHighlightedText(pattern.properties.format || pattern.format!)}
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
                    style={{ marginLeft: 8 }}
                  >
                    {copiedValue === pattern.properties.pattern
                      ? '✓ Copied!'
                      : renderHighlightedText(pattern.properties.pattern)}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default CommonPatternsViewer;
