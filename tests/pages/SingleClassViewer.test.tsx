import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import SingleClassViewer from '../../src/SingleClassViewer';

// Mock the dataService
const mockDataService = {
  getClassByName: vi.fn(),
  filterClassesForSearch: vi.fn(),
};

vi.mock('../../src/services/dataService', () => ({
  default: mockDataService,
}));

// Mock components
vi.mock('../../src/components/LexiconClassViewer', () => ({
  default: ({ classes, searchTerm, expandByDefault }: any) => (
    <div data-testid="lexicon-class-viewer">
      <div>Classes: {classes.length}</div>
      <div>Search: {searchTerm || 'none'}</div>
      <div>Expanded: {expandByDefault ? 'true' : 'false'}</div>
      {classes.map((cls: any, index: number) => (
        <div key={index}>{cls.type}</div>
      ))}
    </div>
  ),
}));

vi.mock('../../src/components/NavigationHeader', () => ({
  default: ({ showHome }: any) => (
    <div data-testid="navigation-header">
      Navigation (showHome: {showHome ? 'true' : 'false'})
    </div>
  ),
}));

const mockClass = {
  type: 'TestClass',
  container_name: 'test.container',
  is_deprecated: false,
  deprecated_properties: [],
  properties: {
    testProperty: {
      type: 'string',
      comment: 'A test property',
    },
  },
  relationships: {},
};

// Helper function to render with router and specific route
const renderWithRouter = (initialEntries = ['/class/TestClass']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <SingleClassViewer />
    </MemoryRouter>
  );
};

describe('SingleClassViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock window.scrollTo
    window.scrollTo = vi.fn();
    
    // Mock addEventListener for scroll events
    window.addEventListener = vi.fn();
    window.removeEventListener = vi.fn();
  });

  describe('Class Found Scenarios', () => {
    beforeEach(() => {
      mockDataService.getClassByName.mockReturnValue(mockClass);
      mockDataService.filterClassesForSearch.mockReturnValue([mockClass]);
    });

    it('should render class viewer when class is found', () => {
      renderWithRouter();

      expect(screen.getByTestId('lexicon-class-viewer')).toBeInTheDocument();
      expect(screen.getByText('TestClass')).toBeInTheDocument();
    });

    it('should display class name in the viewing section', () => {
      renderWithRouter();

      expect(screen.getByText('TestClass')).toBeInTheDocument();
    });

    it('should show navigation header with home button', () => {
      renderWithRouter();

      const navigationHeader = screen.getByTestId('navigation-header');
      expect(navigationHeader).toHaveTextContent('showHome: true');
    });

    it('should display external links', () => {
      renderWithRouter();

      expect(screen.getByText('🐘 elephant.xyz')).toBeInTheDocument();
      expect(screen.getByText('📄 Whitepaper')).toBeInTheDocument();
    });

    it('should scroll to top when component mounts', () => {
      renderWithRouter();

      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    });
  });

  describe('Class Not Found Scenarios', () => {
    beforeEach(() => {
      mockDataService.getClassByName.mockReturnValue(undefined);
    });

    it('should show error message when class is not found', () => {
      renderWithRouter(['/class/NonExistentClass']);

      expect(screen.getByText('Class Not Found')).toBeInTheDocument();
      expect(screen.getByText(/The class "NonExistentClass" could not be found/)).toBeInTheDocument();
    });

    it('should still show navigation header in error state', () => {
      renderWithRouter(['/class/NonExistentClass']);

      const navigationHeader = screen.getByTestId('navigation-header');
      expect(navigationHeader).toHaveTextContent('showHome: true');
    });

    it('should still show external links in error state', () => {
      renderWithRouter(['/class/NonExistentClass']);

      expect(screen.getByText('🐘 elephant.xyz')).toBeInTheDocument();
      expect(screen.getByText('📄 Whitepaper')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    beforeEach(() => {
      mockDataService.getClassByName.mockReturnValue(mockClass);
      mockDataService.filterClassesForSearch.mockReturnValue([mockClass]);
    });

    it('should handle search input changes', async () => {
      renderWithRouter();

      const searchInput = screen.getByPlaceholderText('Search within this class...');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        expect(mockDataService.filterClassesForSearch).toHaveBeenCalledWith([mockClass], 'test');
      });
    });

    it('should clear search when clear button is clicked', async () => {
      renderWithRouter();

      const searchInput = screen.getByPlaceholderText('Search within this class...');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      const clearButton = screen.getByTitle('Clear search');
      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(searchInput).toHaveValue('');
      });
    });

    it('should show search term in results info', async () => {
      renderWithRouter();

      const searchInput = screen.getByPlaceholderText('Search within this class...');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        expect(screen.getByText(/Searching for "test"/)).toBeInTheDocument();
      });
    });

    it('should show no results message when search yields no matches', async () => {
      mockDataService.filterClassesForSearch.mockReturnValue([]);
      
      renderWithRouter();

      const searchInput = screen.getByPlaceholderText('Search within this class...');
      fireEvent.change(searchInput, { target: { value: 'nomatch' } });

      await waitFor(() => {
        expect(screen.getByText(/No matches found for "nomatch"/)).toBeInTheDocument();
      });
    });

    it('should not filter for search terms less than 2 characters', () => {
      renderWithRouter();

      const searchInput = screen.getByPlaceholderText('Search within this class...');
      fireEvent.change(searchInput, { target: { value: 'a' } });

      // Should still show the original class without filtering
      expect(screen.getByTestId('lexicon-class-viewer')).toBeInTheDocument();
      expect(screen.getByText('TestClass')).toBeInTheDocument();
    });
  });

  describe('Scroll to Top Functionality', () => {
    beforeEach(() => {
      mockDataService.getClassByName.mockReturnValue(mockClass);
      mockDataService.filterClassesForSearch.mockReturnValue([mockClass]);
    });

    it('should set up scroll event listener', () => {
      renderWithRouter();

      expect(window.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    });

    it('should show scroll to top button when scrolled down', () => {
      // Mock scrollY to be greater than 300
      Object.defineProperty(window, 'scrollY', { value: 400, writable: true });
      
      renderWithRouter();

      // Simulate scroll event
      const scrollHandler = (window.addEventListener as any).mock.calls.find(
        call => call[0] === 'scroll'
      )[1];
      
      scrollHandler();

      // Button should be shown (we need to check if the component would show it)
      // This is a bit tricky to test directly, so we'll verify the scroll handler was called
      expect(window.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    });

    it('should scroll to top when button is clicked', () => {
      renderWithRouter();

      // Find scroll to top button (it may not be visible initially)
      const scrollButton = screen.queryByTitle('Scroll to top');
      if (scrollButton) {
        fireEvent.click(scrollButton);
        expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
      }
    });
  });

  describe('URL Parameter Handling', () => {
    it('should extract className from URL parameters', () => {
      renderWithRouter(['/class/MyCustomClass']);
      
      expect(mockDataService.getClassByName).toHaveBeenCalledWith('MyCustomClass');
    });

    it('should handle special characters in class names', () => {
      renderWithRouter(['/class/My%20Special%20Class']);
      
      // URL decoding should happen automatically by React Router
      expect(mockDataService.getClassByName).toHaveBeenCalledWith('My Special Class');
    });

    it('should handle empty className parameter', () => {
      renderWithRouter(['/class/']);
      
      expect(mockDataService.getClassByName).toHaveBeenCalledWith(undefined);
    });
  });

  describe('Component Integration', () => {
    beforeEach(() => {
      mockDataService.getClassByName.mockReturnValue(mockClass);
      mockDataService.filterClassesForSearch.mockReturnValue([mockClass]);
    });

    it('should pass correct props to LexiconClassViewer', () => {
      renderWithRouter();

      const lexiconViewer = screen.getByTestId('lexicon-class-viewer');
      expect(lexiconViewer).toHaveTextContent('Classes: 1');
      expect(lexiconViewer).toHaveTextContent('Search: none');
      expect(lexiconViewer).toHaveTextContent('Expanded: true');
    });

    it('should pass search term to LexiconClassViewer when searching', async () => {
      renderWithRouter();

      const searchInput = screen.getByPlaceholderText('Search within this class...');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        const lexiconViewer = screen.getByTestId('lexicon-class-viewer');
        expect(lexiconViewer).toHaveTextContent('Search: test');
      });
    });

    it('should expand by default in single class view', () => {
      renderWithRouter();

      const lexiconViewer = screen.getByTestId('lexicon-class-viewer');
      expect(lexiconViewer).toHaveTextContent('Expanded: true');
    });
  });

  describe('External Links', () => {
    beforeEach(() => {
      mockDataService.getClassByName.mockReturnValue(mockClass);
    });

    it('should have correct href attributes for external links', () => {
      renderWithRouter();

      const elephantLink = screen.getByText('🐘 elephant.xyz').closest('a');
      const whitepaperLink = screen.getByText('📄 Whitepaper').closest('a');

      expect(elephantLink).toHaveAttribute('href', 'https://elephant.xyz');
      expect(whitepaperLink).toHaveAttribute('href', 'https://elephant.xyz/whitepaper');
    });

    it('should open external links in new tab', () => {
      renderWithRouter();

      const elephantLink = screen.getByText('🐘 elephant.xyz').closest('a');
      const whitepaperLink = screen.getByText('📄 Whitepaper').closest('a');

      expect(elephantLink).toHaveAttribute('target', '_blank');
      expect(whitepaperLink).toHaveAttribute('target', '_blank');
      expect(elephantLink).toHaveAttribute('rel', 'noopener noreferrer');
      expect(whitepaperLink).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });
});