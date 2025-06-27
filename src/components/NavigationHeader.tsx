import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface NavigationHeaderProps {
  showHome?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const NavigationHeader: React.FC<NavigationHeaderProps> = ({
  showHome = false,
  className = 'navigation-controls',
  style = { marginTop: 'var(--spacing-4)' },
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    // Initialize session storage for navigation history if it doesn't exist
    if (!sessionStorage.getItem('navHistory')) {
      sessionStorage.setItem('navHistory', JSON.stringify([location.pathname]));
      sessionStorage.setItem('navHistoryIndex', '0');
      setCanGoForward(false);
      setCanGoBack(false);
    } else {
      // Check current navigation state
      const navHistory = JSON.parse(sessionStorage.getItem('navHistory') || '[]');
      const currentIndex = parseInt(sessionStorage.getItem('navHistoryIndex') || '0');

      // Update navigation history if we're on a new page (not from back/forward navigation)
      const currentPath = location.pathname;
      if (navHistory[currentIndex] !== currentPath) {
        // We navigated to a new page, add it to history
        const newHistory = navHistory.slice(0, currentIndex + 1);
        newHistory.push(currentPath);
        const newIndex = newHistory.length - 1;

        sessionStorage.setItem('navHistory', JSON.stringify(newHistory));
        sessionStorage.setItem('navHistoryIndex', newIndex.toString());

        setCanGoForward(false); // No forward navigation after new navigation
        setCanGoBack(newIndex > 0);
      } else {
        // We're on the same page, just update states
        setCanGoForward(currentIndex < navHistory.length - 1);
        setCanGoBack(currentIndex > 0);
      }
    }
  }, [location]);

  const handleBack = () => {
    if (canGoBack) {
      const _navHistory = JSON.parse(sessionStorage.getItem('navHistory') || '[]');
      const currentIndex = parseInt(sessionStorage.getItem('navHistoryIndex') || '0');

      if (currentIndex > 0) {
        const newIndex = currentIndex - 1;
        sessionStorage.setItem('navHistoryIndex', newIndex.toString());
        navigate(-1);
      }
    }
  };

  const handleForward = () => {
    if (canGoForward) {
      const navHistory = JSON.parse(sessionStorage.getItem('navHistory') || '[]');
      const currentIndex = parseInt(sessionStorage.getItem('navHistoryIndex') || '0');

      if (currentIndex < navHistory.length - 1) {
        const newIndex = currentIndex + 1;
        sessionStorage.setItem('navHistoryIndex', newIndex.toString());
        navigate(1);
      }
    }
  };

  const handleHome = () => {
    navigate('/');
  };

  // Only show navigation controls if we have navigation capabilities or if showHome is true
  if (!canGoBack && !canGoForward && !showHome) {
    return null;
  }

  return (
    <div className={className} style={style}>
      {(canGoBack || canGoForward) && (
        <>
          <button onClick={handleBack} className="nav-button back-button" disabled={!canGoBack}>
            ← Back
          </button>
          <button
            onClick={handleForward}
            className="nav-button forward-button"
            disabled={!canGoForward}
          >
            Forward →
          </button>
        </>
      )}
      {showHome && (
        <button onClick={handleHome} className="nav-button home-button">
          🏠 Home
        </button>
      )}
    </div>
  );
};

export default NavigationHeader;
