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
    const tagClasses = dataService.getClassesForTag(selectedTag);
    setClasses(tagClasses);
    setFilteredClasses(tagClasses);
  }, [selectedTag]);

  useEffect(() => {
    const filtered = dataService.filterClassesForSearch(classes, searchTerm);
    setFilteredClasses(filtered);
  }, [searchTerm, classes]);

  return (
    <div className="search-container">
      <div className="controls-section">
        <div className="tag-selector">
          <label htmlFor="tag-select">Tag:</label>
          <select
            id="tag-select"
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            className="tag-select"
          >
            {tags.map(tag => (
              <option key={tag.name} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </select>
        </div>
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>
      <LexiconClassViewer classes={filteredClasses} />
    </div>
  );  
};

export default AllClassesViewer;