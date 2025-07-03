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

  // Scroll detection for scroll-to-top button - SIMPLIFIED AND BULLETPROOF
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
      const shouldShow = scrollY > 300;
      
      console.log('=== SCROLL DEBUG (SingleClass) ===');
      console.log('scrollY:', scrollY);
      console.log('shouldShow:', shouldShow);
      console.log('showScrollToTop state:', showScrollToTop);
      console.log('================================');
      
      setShowScrollToTop(shouldShow);
    };

    // Add scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Check initial scroll position
    handleScroll();
    
    // Cleanup
    return () => window.removeEventListener('scroll', handleScroll);
  }, [showScrollToTop]);

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
    console.log('Scroll to top clicked! (SingleClass)');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Debug: Log when showScrollToTop changes
  useEffect(() => {
    console.log('showScrollToTop changed to (SingleClass):', showScrollToTop);
  }, [showScrollToTop]);

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

        {/* SCROLL TO TOP BUTTON - ALWAYS VISIBLE FOR TESTING */}
        <button
          onClick={scrollToTop}
          className="scroll-to-top-button-test"
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: '#2be786',
            color: '#222',
            border: 'none',
            fontSize: '24px',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          }}
          title="Scroll to top (TEST BUTTON)"
          aria-label="Scroll to top (TEST BUTTON)"
        >
          ↑
        </button>

        {/* CONDITIONAL SCROLL TO TOP BUTTON */}
        {showScrollToTop && (
          <button
            onClick={scrollToTop}
            className="scroll-to-top-button-conditional"
            style={{
              position: 'fixed',
              bottom: '90px',
              right: '20px',
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              color: '#222',
              border: 'none',
              fontSize: '24px',
              fontWeight: 'bold',
              cursor: 'pointer',
              zIndex: 99999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
            title="Scroll to top (CONDITIONAL)"
            aria-label="Scroll to top (CONDITIONAL)"
          >
            ↑
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

      {/* SCROLL TO TOP BUTTON - ALWAYS VISIBLE FOR TESTING */}
      <button
        onClick={scrollToTop}
        className="scroll-to-top-button-test"
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: '#2be786',
          color: '#222',
          border: 'none',
          fontSize: '24px',
          fontWeight: 'bold',
          cursor: 'pointer',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        }}
        title="Scroll to top (TEST BUTTON)"
        aria-label="Scroll to top (TEST BUTTON)"
      >
        ↑
      </button>

      {/* CONDITIONAL SCROLL TO TOP BUTTON */}
      {showScrollToTop && (
        <button
          onClick={scrollToTop}
          className="scroll-to-top-button-conditional"
          style={{
            position: 'fixed',
            bottom: '90px',
            right: '20px',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            color: '#222',
            border: 'none',
            fontSize: '24px',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          }}
          title="Scroll to top (CONDITIONAL)"
          aria-label="Scroll to top (CONDITIONAL)"
        >
          ↑
        </button>
      )}
    </div>
  );
};

export default SingleClassViewer;