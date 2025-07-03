import React, { useEffect, useState } from 'react';
import dataService from './services/dataService';
import LexiconClassViewer from './components/LexiconClassViewer';
import { DataGroupViewer } from './components/DataGroupViewer';
import NavigationHeader from './components/NavigationHeader';
import CommonPatternsViewer from './components/CommonPatternsViewer';
import { LexiconClass, LexiconTag, DataGroup, CommonPattern } from './types/lexicon';

import './styles.css';

const AllClassesViewer = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [classes, setClasses] = useState<LexiconClass[]>([]);
  const [filteredClasses, setFilteredClasses] = useState<LexiconClass[]>([]);
  const [dataGroups, setDataGroups] = useState<DataGroup[]>([]);
  const [filteredDataGroups, setFilteredDataGroups] = useState<DataGroup[]>([]);
  const [commonPatterns, setCommonPatterns] = useState<CommonPattern[]>([]);
  const [filteredCommonPatterns, setFilteredCommonPatterns] = useState<CommonPattern[]>([]);
  const [selectedTag, setSelectedTag] = useState('blockchain');
  const [tags, setTags] = useState<LexiconTag[]>([]);
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  // Scroll to top when component mounts (e.g., navigating back from a class view)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const availableTags = dataService.getTags();
    setTags(availableTags);

    // Load common patterns
    const patterns = dataService.getAllCommonPatterns();
    setCommonPatterns(patterns);
    setFilteredCommonPatterns(patterns);
  }, []);

  // Scroll detection for scroll-to-top button
  useEffect(() => {
    const handleScroll = () => {
      // Show button when scrolled down enough that header is not visible
      // Header section is approximately 200px, so we'll use 300px threshold
      const scrollY = window.scrollY;
      const shouldShow = scrollY > 300;
      setShowScrollToTop(shouldShow);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const tagClasses =
      selectedTag === 'all'
        ? dataService.getAllClasses()
        : dataService.getClassesForTag(selectedTag);
    setClasses(tagClasses);
    setFilteredClasses(tagClasses);

    const tagDataGroups = selectedTag === 'all' ? [] : dataService.getDataGroupsForTag(selectedTag);
    setDataGroups(tagDataGroups);
    setFilteredDataGroups(tagDataGroups);
  }, [selectedTag]);

  useEffect(() => {
    if (searchTerm.length === 0) {
      setFilteredClasses(classes);
      setFilteredDataGroups(dataGroups);
      setFilteredCommonPatterns(commonPatterns);
    } else if (searchTerm.length >= 3) {
      const filteredClassResults = dataService.filterClassesForSearch(classes, searchTerm);
      setFilteredClasses(filteredClassResults);
      const filteredDataGroupResults = dataService.filterDataGroupsForSearch(
        dataGroups,
        searchTerm
      );
      setFilteredDataGroups(filteredDataGroupResults);
      const filteredPatternResults = dataService.getCommonPatternsForSearch(searchTerm);
      setFilteredCommonPatterns(filteredPatternResults);
    } else {
      setFilteredClasses([]);
      setFilteredDataGroups([]);
      setFilteredCommonPatterns([]);
    }
  }, [searchTerm, classes, dataGroups, commonPatterns]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="search-container">
      <div className="header-section">
        <div className="logo-container">
          <img src="/logoElephant-white.svg" alt="Elephant Logo" className="elephant-logo" />
        </div>
        <h1 className="header-title">Elephant Lexicon</h1>
        <p className="header-subtitle">
          Explore and search through the comprehensive data schema definitions
        </p>
        <div className="external-links">
          <a
            href="https://elephant.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="external-link"
          >
            <span>elephant.xyz</span>
            <div className="icon-container">
              <div className="icon-left">
                <svg
                  width="25"
                  height="12"
                  viewBox="0 0 25 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M25 6L18.1367 11.8799L17.4863 11.1201L22.8789 6.5H0.231445V5.5H22.8789L17.4863 0.879883L18.1367 0.120117L25 6Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <div className="icon-right">
                <svg
                  width="25"
                  height="12"
                  viewBox="0 0 25 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M25 6L18.1367 11.8799L17.4863 11.1201L22.8789 6.5H0.231445V5.5H22.8789L17.4863 0.879883L18.1367 0.120117L25 6Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
            </div>
          </a>
          <a
            href="https://elephant.xyz/whitepaper"
            target="_blank"
            rel="noopener noreferrer"
            className="external-link"
          >
            <span>Whitepaper</span>
            <div className="icon-container">
              <div className="icon-left">
                <svg
                  width="25"
                  height="12"
                  viewBox="0 0 25 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M25 6L18.1367 11.8799L17.4863 11.1201L22.8789 6.5H0.231445V5.5H22.8789L17.4863 0.879883L18.1367 0.120117L25 6Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <div className="icon-right">
                <svg
                  width="25"
                  height="12"
                  viewBox="0 0 25 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M25 6L18.1367 11.8799L17.4863 11.1201L22.8789 6.5H0.231445V5.5H22.8789L17.4863 0.879883L18.1367 0.120117L25 6Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
            </div>
          </a>
        </div>
      </div>

      <div className="controls-section">
        <div className="controls-grid">
          <div className="tag-selector">
            <label htmlFor="tag-select">Category</label>
            <select
              id="tag-select"
              value={selectedTag}
              onChange={e => setSelectedTag(e.target.value)}
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
              onChange={e => setSearchTerm(e.target.value)}
              className={`search-input ${searchTerm.length > 0 && searchTerm.length < 3 ? 'search-input-warning' : ''}`}
            />
            {searchTerm.length > 0 && searchTerm.length < 3 && (
              <div className="search-hint">
                Type {3 - searchTerm.length} more character{3 - searchTerm.length !== 1 ? 's' : ''}{' '}
                to start searching
              </div>
            )}
          </div>
        </div>

        <NavigationHeader />
      </div>

      <div className="results-info">
        <span className="results-count">
          {filteredDataGroups.length > 0 &&
            `${filteredDataGroups.length} data ${filteredDataGroups.length === 1 ? 'group' : 'groups'}, `}
          {filteredClasses.length} {filteredClasses.length === 1 ? 'class' : 'classes'}
          {filteredCommonPatterns.length > 0 &&
            `, ${filteredCommonPatterns.length} pattern${filteredCommonPatterns.length === 1 ? '' : 's'}`}
        </span>
        <span>
          {selectedTag === 'all'
            ? 'All Categories'
            : `Category: ${selectedTag.charAt(0).toUpperCase() + selectedTag.slice(1)}`}
        </span>
      </div>

      {filteredDataGroups.length === 0 &&
      filteredClasses.length === 0 &&
      filteredCommonPatterns.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">
            {searchTerm.length > 0 && searchTerm.length < 3
              ? 'Type more characters to search'
              : 'No data groups or classes found'}
          </div>
          <div className="empty-state-description">
            {searchTerm.length > 0 && searchTerm.length < 3
              ? 'Search requires at least 3 characters for better results and typo tolerance.'
              : searchTerm
                ? `No data groups or classes match "${searchTerm}". Try adjusting your search or selecting a different category.`
                : 'No data groups or classes available in the selected category.'}
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
              <DataGroupViewer
                dataGroups={filteredDataGroups}
                searchTerm={searchTerm.length >= 3 ? searchTerm : ''}
              />
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
              <LexiconClassViewer
                classes={filteredClasses}
                searchTerm={searchTerm.length >= 3 ? searchTerm : ''}
              />
            </div>
          )}
          {filteredCommonPatterns.length > 0 && (
            <div className="patterns-section">
              <CommonPatternsViewer
                patterns={filteredCommonPatterns}
                searchTerm={searchTerm.length >= 3 ? searchTerm : ''}
              />
            </div>
          )}
        </div>
      )}

      {/* Scroll to Top Button with SVG Icons */}
      {showScrollToTop && (
        <button
          onClick={scrollToTop}
          className="scroll-to-top-button"
          title="Scroll to top"
          aria-label="Scroll to top"
        >
          <div className="icon-container">
            <div className="icon-top">
              <svg
                width="25"
                height="12"
                viewBox="0 0 25 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M0 6L6.86328 11.8799L7.51367 11.1201L2.12109 6.5H24.7686V5.5H2.12109L7.51367 0.879883L6.86328 0.120117L0 6Z"
                  fill="currentColor"
                  transform="rotate(90 12.5 6)"
                />
              </svg>
            </div>
            <div className="icon-bottom">
              <svg
                width="25"
                height="12"
                viewBox="0 0 25 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M0 6L6.86328 11.8799L7.51367 11.1201L2.12109 6.5H24.7686V5.5H2.12109L7.51367 0.879883L6.86328 0.120117L0 6Z"
                  fill="currentColor"
                  transform="rotate(90 12.5 6)"
                />
              </svg>
            </div>
          </div>
        </button>
      )}
    </div>
  );
};

export default AllClassesViewer;