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
    // Check if we can go back/forward
    // Note: These are browser navigation controls, not lexicon-specific
    setCanGoBack(window.history.length > 1);
    setCanGoForward(false); // Forward is only available after going back
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