import React, { useEffect, useState } from 'react';
import dataService from './services/dataService';
import LexiconClassViewer from './components/LexiconClassViewer';
import { LexiconClass, LexiconTag } from './types/lexicon';

import './styles.css';

const AllClassesViewer = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [classes, setClasses] = useState<LexiconClass[]>([]);
  const [filteredClasses, setFilteredClasses] = useState<LexiconClass[]>([]);
  const [selectedTag, setSelectedTag] = useState('blockchain');
  const [tags, setTags] = useState<LexiconTag[]>([]);

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
    const filtered = dataService.filterClassesForSearch(classes, searchTerm);
    setFilteredClasses(filtered);
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
              placeholder="Search classes, properties, or relationships..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
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
          <div className="empty-state-title">No classes found</div>
          <div className="empty-state-description">
            {searchTerm 
              ? `No classes match "${searchTerm}". Try adjusting your search or selecting a different category.`
              : 'No classes available in the selected category.'
            }
          </div>
        </div>
      ) : (
        <LexiconClassViewer classes={filteredClasses} />
      )}
    </div>
  );  
};

export default AllClassesViewer;