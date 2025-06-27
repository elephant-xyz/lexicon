import React, { useEffect, useState } from 'react';
import dataService from './services/dataService';
import LexiconClassViewer from './components/LexiconClassViewer';
import { DataGroupViewer } from './components/DataGroupViewer';
import NavigationHeader from './components/NavigationHeader';
import { LexiconClass, LexiconTag, DataGroup } from './types/lexicon';

import './styles.css';

const AllClassesViewer = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [classes, setClasses] = useState<LexiconClass[]>([]);
  const [filteredClasses, setFilteredClasses] = useState<LexiconClass[]>([]);
  const [dataGroups, setDataGroups] = useState<DataGroup[]>([]);
  const [filteredDataGroups, setFilteredDataGroups] = useState<DataGroup[]>([]);
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

    const tagDataGroups = selectedTag === 'all' 
      ? [] 
      : dataService.getDataGroupsForTag(selectedTag);
    setDataGroups(tagDataGroups);
    setFilteredDataGroups(tagDataGroups);
  }, [selectedTag]);

  useEffect(() => {
    if (searchTerm.length === 0) {
      setFilteredClasses(classes);
      setFilteredDataGroups(dataGroups);
    } else if (searchTerm.length >= 3) {
      const filteredClassResults = dataService.filterClassesForSearch(classes, searchTerm);
      setFilteredClasses(filteredClassResults);
      const filteredDataGroupResults = dataService.filterDataGroupsForSearch(dataGroups, searchTerm);
      setFilteredDataGroups(filteredDataGroupResults);
    } else {
      setFilteredClasses([]);
      setFilteredDataGroups([]);
    }
  }, [searchTerm, classes, dataGroups]);

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

        <NavigationHeader />
      </div>

      <div className="results-info">
        <span className="results-count">
          {filteredDataGroups.length > 0 && `${filteredDataGroups.length} data ${filteredDataGroups.length === 1 ? 'group' : 'groups'}, `}
          {filteredClasses.length} {filteredClasses.length === 1 ? 'class' : 'classes'}
        </span>
        <span>
          {selectedTag === 'all' ? 'All Categories' : `Category: ${selectedTag.charAt(0).toUpperCase() + selectedTag.slice(1)}`}
        </span>
      </div>

      {filteredDataGroups.length === 0 && filteredClasses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">
            {searchTerm.length > 0 && searchTerm.length < 3 
              ? 'Type more characters to search' 
              : 'No data groups or classes found'
            }
          </div>
          <div className="empty-state-description">
            {searchTerm.length > 0 && searchTerm.length < 3
              ? 'Search requires at least 3 characters for better results and typo tolerance.'
              : searchTerm 
                ? `No data groups or classes match "${searchTerm}". Try adjusting your search or selecting a different category.`
                : 'No data groups or classes available in the selected category.'
            }
          </div>
        </div>
      ) : (
        <div>
          {filteredDataGroups.length > 0 && (
            <div className="data-groups-section">
              <div className="section-separator">
                <div className="separator-line"></div>
                <span className="separator-text">Data Groups</span>
                <div className="separator-line"></div>
              </div>
              <DataGroupViewer dataGroups={filteredDataGroups} searchTerm={searchTerm.length >= 3 ? searchTerm : ''} />
            </div>
          )}
          {filteredDataGroups.length > 0 && filteredClasses.length > 0 && (
            <div className="section-separator">
              <div className="separator-line"></div>
              <span className="separator-text">Classes</span>
              <div className="separator-line"></div>
            </div>
          )}
          {filteredClasses.length > 0 && (
            <div className="classes-section">
              <LexiconClassViewer classes={filteredClasses} searchTerm={searchTerm.length >= 3 ? searchTerm : ''} />
            </div>
          )}
        </div>
      )}
    </div>
  );  
};

export default AllClassesViewer;