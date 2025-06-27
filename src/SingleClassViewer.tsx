import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import dataService from './services/dataService';
import LexiconClassViewer from './components/LexiconClassViewer';
import './styles.css';

const SingleClassViewer = () => {
  const { className } = useParams<{ className: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredClass, setFilteredClass] = useState<any>(null);

  useEffect(() => {
    // Check if we can go back - simple check based on history length
    setCanGoBack(window.history.length > 1);
    
    // For forward navigation, we'll track this with session storage
    // This is a practical approach for SPA navigation
    const updateNavigationState = () => {
      // Store current location in session storage to track navigation
      const navHistory = JSON.parse(sessionStorage.getItem('navHistory') || '[]');
      const currentPath = location.pathname;
      
      // Find current position in navigation history
      const currentIndex = navHistory.indexOf(currentPath);
      
      if (currentIndex === -1) {
        // New page - add to history
        navHistory.push(currentPath);
        sessionStorage.setItem('navHistory', JSON.stringify(navHistory));
        setCanGoForward(false); // No forward when on newest page
      } else {
        // Existing page - check if we can go forward
        const canForward = currentIndex < navHistory.length - 1;
        setCanGoForward(canForward);
      }
    };

    updateNavigationState();
  }, [location]);

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

  const handleBack = () => {
    if (canGoBack) {
      navigate(-1);
    }
  };

  const handleForward = () => {
    if (canGoForward) {
      navigate(1);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!lexiconClass) {
    return (
      <div className="search-container">
        <div className="header-section">
          <h1 className="header-title">Elephant Lexicon</h1>
          <p className="header-subtitle">
            Explore and search through the comprehensive data schema definitions
          </p>
        </div>
        
        <div className="controls-section">
          <div className="error-message">
            <h2>Class Not Found</h2>
            <p>The class "{className}" could not be found in the lexicon.</p>
          </div>
          
          <div className="navigation-controls" style={{ marginTop: 'var(--spacing-4)' }}>
            <button 
              onClick={handleBack}
              disabled={!canGoBack}
              className="nav-button back-button"
            >
              ← Back
            </button>
            <button 
              onClick={() => navigate('/')}
              className="nav-button home-button"
            >
              🏠 Home
            </button>
          </div>
        </div>

        {/* Scroll to Top Button */}
        {showScrollToTop && (
          <button
            onClick={scrollToTop}
            className="scroll-to-top-button"
            title="Scroll to top"
            aria-label="Scroll to top"
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
        <h1 className="header-title">Elephant Lexicon</h1>
        <p className="header-subtitle">
          Explore and search through the comprehensive data schema definitions
        </p>
      </div>

      <div className="controls-section">
        <div className="controls-grid">
          <div className="class-info">
            <label>Viewing Class</label>
            <div className="class-name">{lexiconClass.type}</div>
          </div>
          <div className="search-bar">
            <label htmlFor="single-search-input">Search</label>
            <div className="search-input-container">
              <input
                id="single-search-input"
                type="text"
                placeholder="Search within this class..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
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
        
        <div className="navigation-controls" style={{ marginTop: 'var(--spacing-4)' }}>
          <button 
            onClick={handleBack}
            disabled={!canGoBack}
            className="nav-button back-button"
          >
            ← Back
          </button>
          <button 
            onClick={handleForward}
            disabled={!canGoForward}
            className="nav-button forward-button"
          >
            Forward →
          </button>
          <button 
            onClick={() => navigate('/')}
            className="nav-button home-button"
          >
            🏠 Home
          </button>
        </div>
      </div>

      <div className="results-info">
        <span className="results-count">1 class</span>
        <span>Individual View{searchTerm && ` • Searching for "${searchTerm}"`}</span>
      </div>

      {filteredClass ? (
        <LexiconClassViewer 
          classes={[filteredClass]} 
          searchTerm={searchTerm}
          expandByDefault={true}
        />
      ) : searchTerm && searchTerm.length >= 2 ? (
        <div className="no-results">
          <p>No matches found for "{searchTerm}" in this class.</p>
          <button onClick={() => setSearchTerm('')} className="clear-search-button-inline">
            Clear search
          </button>
        </div>
      ) : (
        <LexiconClassViewer 
          classes={[lexiconClass]} 
          expandByDefault={true}
        />
      )}

      {/* Scroll to Top Button */}
      {showScrollToTop && (
        <button
          onClick={scrollToTop}
          className="scroll-to-top-button"
          title="Scroll to top"
          aria-label="Scroll to top"
        >
          ↑
        </button>
      )}
    </div>
  );
};

export default SingleClassViewer;