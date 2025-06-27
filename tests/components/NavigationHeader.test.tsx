import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
  return render(<MemoryRouter>{component}</MemoryRouter>);
};

describe('NavigationHeader - Simplified', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock sessionStorage with simple implementation
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
      writable: true,
    });
  });

  describe('Basic Rendering', () => {
    it('should render home button when showHome is true', () => {
      renderWithRouter(<NavigationHeader showHome={true} />);

      expect(screen.getByText('🏠 Home')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      renderWithRouter(<NavigationHeader showHome={true} className="custom-navigation" />);

      const navigationElement = screen.getByText('🏠 Home').closest('div');
      expect(navigationElement).toHaveClass('custom-navigation');
    });

    it('should apply custom style', () => {
      const customStyle = { marginTop: '20px' };

      renderWithRouter(<NavigationHeader showHome={true} style={customStyle} />);

      const navigationElement = screen.getByText('🏠 Home').closest('div');
      expect(navigationElement).toHaveStyle('margin-top: 20px');
    });
  });

  describe('Navigation Actions', () => {
    it('should navigate to home when home button is clicked', () => {
      renderWithRouter(<NavigationHeader showHome={true} />);

      const homeButton = screen.getByText('🏠 Home');
      fireEvent.click(homeButton);

      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  describe('Session Storage Integration', () => {
    it('should handle missing session storage gracefully', () => {
      renderWithRouter(<NavigationHeader showHome={true} />);

      // Should render without errors and show home button
      expect(screen.getByText('🏠 Home')).toBeInTheDocument();
    });

    it('should initialize session storage when none exists', () => {
      renderWithRouter(<NavigationHeader showHome={true} />);

      // Should call setItem to initialize navigation history
      expect(window.sessionStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper button role for home button', () => {
      renderWithRouter(<NavigationHeader showHome={true} />);

      expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument();
    });
  });
});
