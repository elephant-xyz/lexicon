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

  const lexiconClass = className ? dataService.getClassByName(className) : undefined;

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

  if (!lexiconClass) {
    return (
      <div className="search-container">
        <div className="header-section">
          <h1 className="header-title">Class Not Found</h1>
          <p className="header-subtitle">
            The class "{className}" could not be found in the lexicon.
          </p>
        </div>
        
        <div className="controls-section">
          <div className="navigation-controls">
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
      </div>
    );
  }

  return (
    <div className="search-container">
      <div className="header-section">
        <h1 className="header-title">{lexiconClass.type}</h1>
        <p className="header-subtitle">
          Class details and relationships
        </p>
      </div>

      <div className="controls-section">
        <div className="navigation-controls">
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
        <span>Individual View</span>
      </div>

      <LexiconClassViewer classes={[lexiconClass]} />
    </div>
  );
};

export default SingleClassViewer;