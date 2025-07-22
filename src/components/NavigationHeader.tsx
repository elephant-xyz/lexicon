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
                    d="M0 6L6.86328 0.120117L7.51367 0.879883L2.12109 5.5H24.7686V6.5H2.12109L7.51367 11.1201L6.86328 11.8799L0 6Z"
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
                    d="M0 6L6.86328 0.120117L7.51367 0.879883L2.12109 5.5H24.7686V6.5H2.12109L7.51367 11.1201L6.86328 11.8799L0 6Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
            </div>
            <span>Back</span>
          </button>
          <button
            onClick={handleForward}
            className="nav-button forward-button"
            disabled={!canGoForward}
          >
            <span>Forward</span>
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
          </button>
        </>
      )}
      {showHome && (
        <button onClick={handleHome} className="nav-button home-button">
          <span>🏠 Home</span>
        </button>
      )}
    </div>
  );
};

export default NavigationHeader;
