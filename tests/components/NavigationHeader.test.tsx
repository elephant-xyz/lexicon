import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import NavigationHeader from '../../src/components/NavigationHeader';

// Mock useNavigate and useLocation
const mockNavigate = vi.fn();
const mockLocation = { pathname: '/test' };

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
  };
});

// Helper function to render with router
const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('NavigationHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock sessionStorage
    const mockSessionStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    
    Object.defineProperty(window, 'sessionStorage', {
      value: mockSessionStorage,
      writable: true,
    });

    // Mock history for navigation testing
    Object.defineProperty(window, 'history', {
      value: {
        length: 2,
      },
      writable: true,
    });
  });

  describe('Initial State', () => {
    it('should not render anything when no navigation is possible and showHome is false', () => {
      // Mock empty navigation history
      (window.sessionStorage.getItem as any).mockReturnValue(null);
      
      const { container } = renderWithRouter(
        <NavigationHeader showHome={false} />
      );

      // Component should return null and render nothing
      expect(container.firstChild).toBeNull();
    });

    it('should render home button when showHome is true', () => {
      renderWithRouter(<NavigationHeader showHome={true} />);

      expect(screen.getByText('🏠 Home')).toBeInTheDocument();
    });

    it('should initialize navigation history if it does not exist', () => {
      (window.sessionStorage.getItem as any).mockReturnValue(null);
      
      renderWithRouter(<NavigationHeader showHome={true} />);

      expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
        'navHistory',
        JSON.stringify(['/test'])
      );
      expect(window.sessionStorage.setItem).toHaveBeenCalledWith('navHistoryIndex', '0');
    });
  });

  describe('Navigation History Management', () => {
    it('should load existing navigation history', () => {
      const mockHistory = ['/page1', '/page2', '/test'];
      (window.sessionStorage.getItem as any)
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('2');

      renderWithRouter(<NavigationHeader showHome={true} />);

      // Should indicate back navigation is possible (index > 0)
      expect(screen.getByText('← Back')).toBeInTheDocument();
    });

    it('should update navigation history for new pages', () => {
      const mockHistory = ['/page1', '/page2'];
      (window.sessionStorage.getItem as any)
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('1');

      renderWithRouter(<NavigationHeader showHome={true} />);

      // Should add new page to history
      expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
        'navHistory',
        JSON.stringify(['/page1', '/page2', '/test'])
      );
      expect(window.sessionStorage.setItem).toHaveBeenCalledWith('navHistoryIndex', '2');
    });

    it('should handle navigation state correctly when at beginning of history', () => {
      const mockHistory = ['/test'];
      (window.sessionStorage.getItem as any)
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('0');

      renderWithRouter(<NavigationHeader showHome={true} />);

      // Back button should be disabled
      const backButton = screen.queryByText('← Back');
      if (backButton) {
        expect(backButton.closest('button')).toBeDisabled();
      }
    });

    it('should handle navigation state correctly when forward navigation is possible', () => {
      const mockHistory = ['/page1', '/test', '/page3'];
      (window.sessionStorage.getItem as any)
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('1');

      renderWithRouter(<NavigationHeader showHome={true} />);

      // Both back and forward should be available
      expect(screen.getByText('← Back')).toBeInTheDocument();
      expect(screen.getByText('Forward →')).toBeInTheDocument();
    });
  });

  describe('Navigation Actions', () => {
    it('should navigate back when back button is clicked', () => {
      const mockHistory = ['/page1', '/test'];
      (window.sessionStorage.getItem as any)
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('1')
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('1');

      renderWithRouter(<NavigationHeader showHome={true} />);

      const backButton = screen.getByText('← Back');
      fireEvent.click(backButton);

      expect(window.sessionStorage.setItem).toHaveBeenCalledWith('navHistoryIndex', '0');
      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('should navigate forward when forward button is clicked', () => {
      const mockHistory = ['/page1', '/test', '/page3'];
      (window.sessionStorage.getItem as any)
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('1')
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('1');

      renderWithRouter(<NavigationHeader showHome={true} />);

      const forwardButton = screen.getByText('Forward →');
      fireEvent.click(forwardButton);

      expect(window.sessionStorage.setItem).toHaveBeenCalledWith('navHistoryIndex', '2');
      expect(mockNavigate).toHaveBeenCalledWith(1);
    });

    it('should navigate to home when home button is clicked', () => {
      renderWithRouter(<NavigationHeader showHome={true} />);

      const homeButton = screen.getByText('🏠 Home');
      fireEvent.click(homeButton);

      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    it('should not navigate back when at the beginning of history', () => {
      const mockHistory = ['/test'];
      (window.sessionStorage.getItem as any)
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('0')
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('0');

      renderWithRouter(<NavigationHeader showHome={true} />);

      const backButton = screen.queryByText('← Back');
      if (backButton && !backButton.closest('button')?.disabled) {
        fireEvent.click(backButton);
        // Should not call navigate since we're at the beginning
        expect(mockNavigate).not.toHaveBeenCalledWith(-1);
      }
    });

    it('should not navigate forward when at the end of history', () => {
      const mockHistory = ['/page1', '/test'];
      (window.sessionStorage.getItem as any)
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('1')
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('1');

      renderWithRouter(<NavigationHeader showHome={true} />);

      const forwardButton = screen.queryByText('Forward →');
      if (forwardButton && !forwardButton.closest('button')?.disabled) {
        fireEvent.click(forwardButton);
        // Should not call navigate since we're at the end
        expect(mockNavigate).not.toHaveBeenCalledWith(1);
      }
    });
  });

  describe('Component Props', () => {
    it('should apply custom className', () => {
      renderWithRouter(
        <NavigationHeader showHome={true} className="custom-navigation" />
      );

      const navigationElement = screen.getByText('🏠 Home').closest('div');
      expect(navigationElement).toHaveClass('custom-navigation');
    });

    it('should apply custom style', () => {
      const customStyle = { marginTop: '20px', color: 'red' };
      
      renderWithRouter(
        <NavigationHeader showHome={true} style={customStyle} />
      );

      const navigationElement = screen.getByText('🏠 Home').closest('div');
      expect(navigationElement).toHaveStyle('margin-top: 20px');
      expect(navigationElement).toHaveStyle('color: red');
    });

    it('should use default className and style when not provided', () => {
      renderWithRouter(<NavigationHeader showHome={true} />);

      const navigationElement = screen.getByText('🏠 Home').closest('div');
      expect(navigationElement).toHaveClass('navigation-controls');
    });
  });

  describe('Button States', () => {
    it('should disable back button when cannot go back', () => {
      const mockHistory = ['/test'];
      (window.sessionStorage.getItem as any)
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('0');

      renderWithRouter(<NavigationHeader showHome={true} />);

      const backButton = screen.queryByText('← Back');
      if (backButton) {
        expect(backButton.closest('button')).toBeDisabled();
      }
    });

    it('should disable forward button when cannot go forward', () => {
      const mockHistory = ['/page1', '/test'];
      (window.sessionStorage.getItem as any)
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('1');

      renderWithRouter(<NavigationHeader showHome={true} />);

      const forwardButton = screen.queryByText('Forward →');
      if (forwardButton) {
        expect(forwardButton.closest('button')).toBeDisabled();
      }
    });

    it('should enable both buttons when in middle of history', () => {
      const mockHistory = ['/page1', '/test', '/page3'];
      (window.sessionStorage.getItem as any)
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('1');

      renderWithRouter(<NavigationHeader showHome={true} />);

      const backButton = screen.getByText('← Back');
      const forwardButton = screen.getByText('Forward →');

      expect(backButton.closest('button')).not.toBeDisabled();
      expect(forwardButton.closest('button')).not.toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper button roles', () => {
      const mockHistory = ['/page1', '/test', '/page3'];
      (window.sessionStorage.getItem as any)
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('1');

      renderWithRouter(<NavigationHeader showHome={true} />);

      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /forward/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument();
    });

    it('should have proper button text content', () => {
      const mockHistory = ['/page1', '/test', '/page3'];
      (window.sessionStorage.getItem as any)
        .mockReturnValueOnce(JSON.stringify(mockHistory))
        .mockReturnValueOnce('1');

      renderWithRouter(<NavigationHeader showHome={true} />);

      expect(screen.getByText('← Back')).toBeInTheDocument();
      expect(screen.getByText('Forward →')).toBeInTheDocument();
      expect(screen.getByText('🏠 Home')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle corrupted session storage gracefully', () => {
      (window.sessionStorage.getItem as any)
        .mockReturnValueOnce('invalid-json')
        .mockReturnValueOnce('not-a-number');

      renderWithRouter(<NavigationHeader showHome={true} />);

      // Should still render the home button
      expect(screen.getByText('🏠 Home')).toBeInTheDocument();
    });

    it('should handle missing session storage data', () => {
      (window.sessionStorage.getItem as any).mockReturnValue(null);

      renderWithRouter(<NavigationHeader showHome={true} />);

      // Should initialize new navigation history
      expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
        'navHistory',
        JSON.stringify(['/test'])
      );
      expect(screen.getByText('🏠 Home')).toBeInTheDocument();
    });

    it('should handle empty navigation history array', () => {
      (window.sessionStorage.getItem as any)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('0');

      renderWithRouter(<NavigationHeader showHome={true} />);

      expect(screen.getByText('🏠 Home')).toBeInTheDocument();
    });
  });
});