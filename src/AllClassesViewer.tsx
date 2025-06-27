import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dataService from './services/dataService';
import LexiconClassViewer from './components/LexiconClassViewer';
import { LexiconClass, LexiconTag } from './types/lexicon';

import './styles.css';

const AllClassesViewer = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [classes, setClasses] = useState<LexiconClass[]>([]);
  const [filteredClasses, setFilteredClasses] = useState<LexiconClass[]>([]);
  const [selectedTag, setSelectedTag] = useState('blockchain');
  const [tags, setTags] = useState<LexiconTag[]>([]);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    // Check if we can go back/forward
    setCanGoBack(window.history.length > 1);
    setCanGoForward(false); // Forward is only available after going back
  }, []);

  useEffect(() => {
    const availableTags = dataService.getTags();
    setTags(availableTags);
  }, []);

  useEffect(() => {
    const tagClasses = selectedTag === 'all' 
      ? dataService.getAllClasses() 
      : dataService.getClassesForTag(selectedTag);
    setClasses(tagClasses);
    setFilteredClasses(tagClasses);
  }, [selectedTag]);

  useEffect(() => {
    if (searchTerm.length === 0) {
      setFilteredClasses(classes);
    } else if (searchTerm.length >= 3) {
      const filtered = dataService.filterClassesForSearch(classes, searchTerm);
      setFilteredClasses(filtered);
    } else {
      setFilteredClasses([]);
    }
  }, [searchTerm, classes]);

  return (
    <div className="search-container">
      <div className="header-section">
        <h1 className="header-title">Elephant Lexicon</h1>
        <p className="header-subtitle">
          Explore and search through the comprehensive data schema definitions
        </p>
      </div>

      <div className="controls-section">
        <div className="controls-grid">
          <div className="tag-selector">
            <label htmlFor="tag-select">Category</label>
            <select
              id="tag-select"
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="tag-select"
            >
              <option value="all">All Classes</option>
              {tags.map(tag => (
                <option key={tag.name} value={tag.name}>
                  {tag.name.charAt(0).toUpperCase() + tag.name.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="search-bar">
            <label htmlFor="search-input">Search</label>
            <input
              id="search-input"
              type="text"
              placeholder="Type at least 3 characters to search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`search-input ${searchTerm.length > 0 && searchTerm.length < 3 ? 'search-input-warning' : ''}`}
            />
            {searchTerm.length > 0 && searchTerm.length < 3 && (
              <div className="search-hint">
                Type {3 - searchTerm.length} more character{3 - searchTerm.length !== 1 ? 's' : ''} to start searching
              </div>
            )}
          </div>
        </div>
        
        {canGoBack && (
          <div className="navigation-controls" style={{ marginTop: 'var(--spacing-4)' }}>
            <button 
              onClick={() => navigate(-1)}
              className="nav-button back-button"
            >
              ← Back
            </button>
            {canGoForward && (
              <button 
                onClick={() => navigate(1)}
                className="nav-button forward-button"
              >
                Forward →
              </button>
            )}
          </div>
        )}
      </div>

      <div className="results-info">
        <span className="results-count">
          {filteredClasses.length} {filteredClasses.length === 1 ? 'class' : 'classes'}
        </span>
        <span>
          {selectedTag === 'all' ? 'All Categories' : `Category: ${selectedTag.charAt(0).toUpperCase() + selectedTag.slice(1)}`}
        </span>
      </div>

      {filteredClasses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">
            {searchTerm.length > 0 && searchTerm.length < 3 
              ? 'Type more characters to search' 
              : 'No classes found'
            }
          </div>
          <div className="empty-state-description">
            {searchTerm.length > 0 && searchTerm.length < 3
              ? 'Search requires at least 3 characters for better results and typo tolerance.'
              : searchTerm 
                ? `No classes match "${searchTerm}". Try adjusting your search or selecting a different category.`
                : 'No classes available in the selected category.'
            }
          </div>
        </div>
      ) : (
        <LexiconClassViewer classes={filteredClasses} searchTerm={searchTerm.length >= 3 ? searchTerm : ''} />
      )}
    </div>
  );  
};

export default AllClassesViewer;