import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import dataService from './services/dataService';
import LexiconClassViewer from './components/LexiconClassViewer';
import NavigationHeader from './components/NavigationHeader';
import { LexiconClass } from './types/lexicon';
import './styles.css';

const SingleClassViewer = () => {
  const { className } = useParams<{ className: string }>();
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredClass, setFilteredClass] = useState<LexiconClass | null>(null);

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

  const lexiconClass = className ? dataService.getClassByName(className) : undefined;

  // Scroll to top when component mounts or className changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [className]);

  // Filter the class based on search term
  useEffect(() => {
    if (!lexiconClass) {
      setFilteredClass(null);
      return;
    }

    if (!searchTerm || searchTerm.length < 2) {
      setFilteredClass(lexiconClass);
      return;
    }

    // Apply search filtering to the single class
    const filtered = dataService.filterClassesForSearch([lexiconClass], searchTerm);
    setFilteredClass(filtered.length > 0 ? filtered[0] : null);
  }, [lexiconClass, searchTerm]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!lexiconClass) {
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
          <div className="error-message">
            <h2>Class Not Found</h2>
            <p>The class &ldquo;{className}&rdquo; could not be found in the lexicon.</p>
          </div>

          <NavigationHeader showHome={true} />
        </div>

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
  }

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
          <div className="class-info">
            <label htmlFor="current-class-name">Viewing Class</label>
            <div id="current-class-name" className="class-name">
              {lexiconClass.type}
            </div>
          </div>
          <div className="search-bar">
            <label htmlFor="single-search-input">Search</label>
            <div className="search-input-container">
              <input
                id="single-search-input"
                type="text"
                placeholder="Search within this class..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="search-input"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="clear-search-button"
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        <NavigationHeader showHome={true} />
      </div>

      <div className="results-info">
        <span className="results-count">1 class</span>
        <span>Individual View{searchTerm && ` • Searching for &ldquo;${searchTerm}&rdquo;`}</span>
      </div>

      {filteredClass ? (
        <LexiconClassViewer
          classes={[filteredClass]}
          searchTerm={searchTerm}
          expandByDefault={true}
        />
      ) : searchTerm && searchTerm.length >= 2 ? (
        <div className="no-results">
          <p>No matches found for &ldquo;{searchTerm}&rdquo; in this class.</p>
          <button onClick={() => setSearchTerm('')} className="clear-search-button-inline">
            Clear search
          </button>
        </div>
      ) : (
        <LexiconClassViewer classes={[lexiconClass]} expandByDefault={true} />
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

export default SingleClassViewer;