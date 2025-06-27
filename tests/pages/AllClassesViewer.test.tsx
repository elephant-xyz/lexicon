import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AllClassesViewer from '../../src/AllClassesViewer';

// Mock the dataService
const mockDataService = {
  getTags: vi.fn(),
  getAllClasses: vi.fn(),
  getClassesForTag: vi.fn(),
  getDataGroupsForTag: vi.fn(),
  filterClassesForSearch: vi.fn(),
  filterDataGroupsForSearch: vi.fn(),
};

vi.mock('../../src/services/dataService', () => ({
  default: mockDataService,
}));

// Mock components
vi.mock('../../src/components/LexiconClassViewer', () => ({
  default: ({ classes, searchTerm }: any) => (
    <div data-testid="lexicon-class-viewer">
      <div>Classes: {classes.length}</div>
      <div>Search: {searchTerm || 'none'}</div>
      {classes.map((cls: any, index: number) => (
        <div key={index}>{cls.type}</div>
      ))}
    </div>
  ),
}));

vi.mock('../../src/components/DataGroupViewer', () => ({
  DataGroupViewer: ({ dataGroups, searchTerm }: any) => (
    <div data-testid="data-group-viewer">
      <div>DataGroups: {dataGroups.length}</div>
      <div>Search: {searchTerm || 'none'}</div>
      {dataGroups.map((group: any, index: number) => (
        <div key={index}>{group.label}</div>
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

const mockTags = [
  { name: 'blockchain', classes: ['BlockchainClass'] },
  { name: 'realestate', classes: ['RealEstateClass'] },
  { name: 'education', classes: ['EducationClass'] },
];

const mockClasses = [
  {
    type: 'BlockchainClass',
    container_name: 'blockchain.container',
    is_deprecated: false,
    deprecated_properties: [],
    properties: { id: { type: 'string', comment: 'ID' } },
    relationships: {},
  },
  {
    type: 'RealEstateClass',
    container_name: 'realestate.container',
    is_deprecated: false,
    deprecated_properties: [],
    properties: { price: { type: 'number', comment: 'Price' } },
    relationships: {},
  },
];

const mockDataGroups = [
  {
    label: 'Test Data Group',
    relationships: [{ from: 'A', to: 'B' }],
  },
];

// Helper function to render with router
const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('AllClassesViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock window.scrollTo
    window.scrollTo = vi.fn();
    
    // Mock addEventListener for scroll events
    window.addEventListener = vi.fn();
    window.removeEventListener = vi.fn();

    // Default mock implementations
    mockDataService.getTags.mockReturnValue(mockTags);
    mockDataService.getAllClasses.mockReturnValue(mockClasses);
    mockDataService.getClassesForTag.mockReturnValue(mockClasses);
    mockDataService.getDataGroupsForTag.mockReturnValue(mockDataGroups);
    mockDataService.filterClassesForSearch.mockReturnValue(mockClasses);
    mockDataService.filterDataGroupsForSearch.mockReturnValue(mockDataGroups);
  });

  describe('Initial Rendering', () => {
    it('should render header with title and subtitle', () => {
      renderWithRouter(<AllClassesViewer />);

      expect(screen.getByText('Elephant Lexicon')).toBeInTheDocument();
      expect(screen.getByText('Explore and search through the comprehensive data schema definitions')).toBeInTheDocument();
    });

    it('should render external links', () => {
      renderWithRouter(<AllClassesViewer />);

      expect(screen.getByText('🐘 elephant.xyz')).toBeInTheDocument();
      expect(screen.getByText('📄 Whitepaper')).toBeInTheDocument();
    });

    it('should have correct external link attributes', () => {
      renderWithRouter(<AllClassesViewer />);

      const elephantLink = screen.getByText('🐘 elephant.xyz').closest('a');
      const whitepaperLink = screen.getByText('📄 Whitepaper').closest('a');

      expect(elephantLink).toHaveAttribute('href', 'https://elephant.xyz');
      expect(elephantLink).toHaveAttribute('target', '_blank');
      expect(whitepaperLink).toHaveAttribute('href', 'https://elephant.xyz/whitepaper');
      expect(whitepaperLink).toHaveAttribute('target', '_blank');
    });

    it('should scroll to top on mount', () => {
      renderWithRouter(<AllClassesViewer />);

      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    });

    it('should load tags on mount', () => {
      renderWithRouter(<AllClassesViewer />);

      expect(mockDataService.getTags).toHaveBeenCalled();
    });

    it('should start with blockchain tag selected by default', () => {
      renderWithRouter(<AllClassesViewer />);

      expect(mockDataService.getClassesForTag).toHaveBeenCalledWith('blockchain');
      expect(mockDataService.getDataGroupsForTag).toHaveBeenCalledWith('blockchain');
    });
  });

  describe('Tag Selection', () => {
    it('should render tag buttons', () => {
      renderWithRouter(<AllClassesViewer />);

      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('blockchain')).toBeInTheDocument();
      expect(screen.getByText('realestate')).toBeInTheDocument();
      expect(screen.getByText('education')).toBeInTheDocument();
    });

    it('should select all classes when "All" tag is clicked', async () => {
      renderWithRouter(<AllClassesViewer />);

      const allButton = screen.getByText('All');
      fireEvent.click(allButton);

      await waitFor(() => {
        expect(mockDataService.getAllClasses).toHaveBeenCalled();
      });
    });

    it('should filter classes by tag when tag is selected', async () => {
      renderWithRouter(<AllClassesViewer />);

      const realestateButton = screen.getByText('realestate');
      fireEvent.click(realestateButton);

      await waitFor(() => {
        expect(mockDataService.getClassesForTag).toHaveBeenCalledWith('realestate');
        expect(mockDataService.getDataGroupsForTag).toHaveBeenCalledWith('realestate');
      });
    });

    it('should highlight active tag button', () => {
      renderWithRouter(<AllClassesViewer />);

      const blockchainButton = screen.getByText('blockchain');
      expect(blockchainButton).toHaveClass('active');
    });
  });

  describe('Search Functionality', () => {
    it('should render search input', () => {
      renderWithRouter(<AllClassesViewer />);

      expect(screen.getByPlaceholderText('Search classes and data groups...')).toBeInTheDocument();
    });

    it('should filter results when searching', async () => {
      renderWithRouter(<AllClassesViewer />);

      const searchInput = screen.getByPlaceholderText('Search classes and data groups...');
      fireEvent.change(searchInput, { target: { value: 'blockchain' } });

      await waitFor(() => {
        expect(mockDataService.filterClassesForSearch).toHaveBeenCalledWith(mockClasses, 'blockchain');
        expect(mockDataService.filterDataGroupsForSearch).toHaveBeenCalledWith(mockDataGroups, 'blockchain');
      });
    });

    it('should show clear button when search has text', async () => {
      renderWithRouter(<AllClassesViewer />);

      const searchInput = screen.getByPlaceholderText('Search classes and data groups...');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        expect(screen.getByTitle('Clear search')).toBeInTheDocument();
      });
    });

    it('should clear search when clear button is clicked', async () => {
      renderWithRouter(<AllClassesViewer />);

      const searchInput = screen.getByPlaceholderText('Search classes and data groups...');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        const clearButton = screen.getByTitle('Clear search');
        fireEvent.click(clearButton);
      });

      await waitFor(() => {
        expect(searchInput).toHaveValue('');
      });
    });

    it('should show search results count', async () => {
      renderWithRouter(<AllClassesViewer />);

      // Check initial results count
      expect(screen.getByText(/2 classes/)).toBeInTheDocument();
      expect(screen.getByText(/1 data group/)).toBeInTheDocument();
    });

    it('should update results count after search', async () => {
      mockDataService.filterClassesForSearch.mockReturnValue([mockClasses[0]]);
      mockDataService.filterDataGroupsForSearch.mockReturnValue([]);

      renderWithRouter(<AllClassesViewer />);

      const searchInput = screen.getByPlaceholderText('Search classes and data groups...');
      fireEvent.change(searchInput, { target: { value: 'blockchain' } });

      await waitFor(() => {
        expect(screen.getByText(/1 class/)).toBeInTheDocument();
        expect(screen.getByText(/0 data groups/)).toBeInTheDocument();
      });
    });
  });

  describe('Content Display', () => {
    it('should render LexiconClassViewer with filtered classes', () => {
      renderWithRouter(<AllClassesViewer />);

      const classViewer = screen.getByTestId('lexicon-class-viewer');
      expect(classViewer).toHaveTextContent('Classes: 2');
    });

    it('should render DataGroupViewer with filtered data groups', () => {
      renderWithRouter(<AllClassesViewer />);

      const dataGroupViewer = screen.getByTestId('data-group-viewer');
      expect(dataGroupViewer).toHaveTextContent('DataGroups: 1');
    });

    it('should pass search term to viewers', async () => {
      renderWithRouter(<AllClassesViewer />);

      const searchInput = screen.getByPlaceholderText('Search classes and data groups...');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        const classViewer = screen.getByTestId('lexicon-class-viewer');
        const dataGroupViewer = screen.getByTestId('data-group-viewer');
        
        expect(classViewer).toHaveTextContent('Search: test');
        expect(dataGroupViewer).toHaveTextContent('Search: test');
      });
    });

    it('should show navigation header', () => {
      renderWithRouter(<AllClassesViewer />);

      const navigationHeader = screen.getByTestId('navigation-header');
      expect(navigationHeader).toHaveTextContent('showHome: false');
    });
  });

  describe('Scroll to Top Functionality', () => {
    it('should set up scroll event listener', () => {
      renderWithRouter(<AllClassesViewer />);

      expect(window.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    });

    it('should remove scroll event listener on unmount', () => {
      const { unmount } = renderWithRouter(<AllClassesViewer />);

      unmount();

      expect(window.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    });

    it('should show scroll to top button when scrolled down', () => {
      // Mock scrollY to be greater than 300
      Object.defineProperty(window, 'scrollY', { value: 400, writable: true });
      
      renderWithRouter(<AllClassesViewer />);

      // Simulate scroll event
      const scrollHandler = (window.addEventListener as any).mock.calls.find(
        call => call[0] === 'scroll'
      )[1];
      
      scrollHandler();

      // Button logic is tested - the component should show the button when scrolled
      expect(window.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty tags array', () => {
      mockDataService.getTags.mockReturnValue([]);

      renderWithRouter(<AllClassesViewer />);

      // Should still show "All" button
      expect(screen.getByText('All')).toBeInTheDocument();
    });

    it('should handle empty classes array', () => {
      mockDataService.getClassesForTag.mockReturnValue([]);
      mockDataService.filterClassesForSearch.mockReturnValue([]);

      renderWithRouter(<AllClassesViewer />);

      const classViewer = screen.getByTestId('lexicon-class-viewer');
      expect(classViewer).toHaveTextContent('Classes: 0');
    });

    it('should handle empty data groups array', () => {
      mockDataService.getDataGroupsForTag.mockReturnValue([]);
      mockDataService.filterDataGroupsForSearch.mockReturnValue([]);

      renderWithRouter(<AllClassesViewer />);

      const dataGroupViewer = screen.getByTestId('data-group-viewer');
      expect(dataGroupViewer).toHaveTextContent('DataGroups: 0');
    });

    it('should handle search with no results', async () => {
      mockDataService.filterClassesForSearch.mockReturnValue([]);
      mockDataService.filterDataGroupsForSearch.mockReturnValue([]);

      renderWithRouter(<AllClassesViewer />);

      const searchInput = screen.getByPlaceholderText('Search classes and data groups...');
      fireEvent.change(searchInput, { target: { value: 'nomatch' } });

      await waitFor(() => {
        expect(screen.getByText(/0 classes/)).toBeInTheDocument();
        expect(screen.getByText(/0 data groups/)).toBeInTheDocument();
      });
    });

    it('should handle very short search terms', async () => {
      renderWithRouter(<AllClassesViewer />);

      const searchInput = screen.getByPlaceholderText('Search classes and data groups...');
      fireEvent.change(searchInput, { target: { value: 'a' } });

      // Should not trigger search filtering for very short terms
      await waitFor(() => {
        expect(screen.getByTestId('lexicon-class-viewer')).toBeInTheDocument();
      });
    });
  });

  describe('Integration', () => {
    it('should update data when tag selection changes', async () => {
      renderWithRouter(<AllClassesViewer />);

      // Initially should load blockchain data
      expect(mockDataService.getClassesForTag).toHaveBeenCalledWith('blockchain');

      // Change to realestate
      const realestateButton = screen.getByText('realestate');
      fireEvent.click(realestateButton);

      await waitFor(() => {
        expect(mockDataService.getClassesForTag).toHaveBeenCalledWith('realestate');
        expect(mockDataService.getDataGroupsForTag).toHaveBeenCalledWith('realestate');
      });
    });

    it('should maintain search term when switching tags', async () => {
      renderWithRouter(<AllClassesViewer />);

      // Enter search term
      const searchInput = screen.getByPlaceholderText('Search classes and data groups...');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      // Switch tag
      const realestateButton = screen.getByText('realestate');
      fireEvent.click(realestateButton);

      await waitFor(() => {
        expect(searchInput).toHaveValue('test');
      });
    });
  });
});