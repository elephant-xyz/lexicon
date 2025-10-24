import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LexiconClassViewer from '../../src/components/LexiconClassViewer';
import { mockLexiconClass, mockDeprecatedClass, mockSearchResultClass } from '../mockData';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Helper function to render with router
const renderWithRouter = (component: React.ReactElement) => {
  return render(<MemoryRouter>{component}</MemoryRouter>);
};

describe('LexiconClassViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset clipboard mock
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
    });
  });

  describe('Basic Rendering', () => {
    it('should render class names correctly', () => {
      renderWithRouter(<LexiconClassViewer classes={[mockLexiconClass]} />);

      expect(screen.getByText('TestClass')).toBeInTheDocument();
    });

    it('should render multiple classes', () => {
      renderWithRouter(<LexiconClassViewer classes={[mockLexiconClass, mockDeprecatedClass]} />);

      expect(screen.getByText('TestClass')).toBeInTheDocument();
      // DeprecatedClass is now in a collapsible section, so we check for the section header
      expect(screen.getByText('Deprecated Classes:')).toBeInTheDocument();
    });

    it('should show deprecated classes section for deprecated classes', () => {
      renderWithRouter(<LexiconClassViewer classes={[mockDeprecatedClass]} />);

      // Deprecated classes are now shown in a collapsible section
      expect(screen.getByText('Deprecated Classes:')).toBeInTheDocument();
    });
  });

  describe('Expand/Collapse Functionality', () => {
    it('should expand class when expand button is clicked', async () => {
      renderWithRouter(<LexiconClassViewer classes={[mockLexiconClass]} />);

      const expandButton = screen.getByRole('button', { name: /expand/i });
      fireEvent.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText('Properties:')).toBeInTheDocument();
      });
    });

    it('should collapse class when collapse button is clicked', async () => {
      renderWithRouter(<LexiconClassViewer classes={[mockLexiconClass]} expandByDefault={true} />);

      // Should be expanded by default
      expect(screen.getByText('Properties:')).toBeInTheDocument();

      const collapseButton = screen.getByRole('button', { name: /collapse/i });
      fireEvent.click(collapseButton);

      await waitFor(() => {
        expect(screen.queryByText('Properties:')).not.toBeInTheDocument();
      });
    });

    it('should expand by default when expandByDefault is true', () => {
      renderWithRouter(<LexiconClassViewer classes={[mockLexiconClass]} expandByDefault={true} />);

      expect(screen.getByText('Properties:')).toBeInTheDocument();
      expect(screen.getByText('testProperty')).toBeInTheDocument();
    });

    it('should expand deprecated classes section when clicked', async () => {
      renderWithRouter(<LexiconClassViewer classes={[mockDeprecatedClass]} />);

      const deprecatedClassesButton = screen.getByRole('button', {
        name: /expand deprecated classes/i,
      });
      fireEvent.click(deprecatedClassesButton);

      await waitFor(() => {
        expect(screen.getByText('DeprecatedClass')).toBeInTheDocument();
      });
    });

    it('should expand deprecated properties section when clicked', async () => {
      // Create a class with deprecated properties
      const classWithDeprecatedProps = {
        ...mockLexiconClass,
        type: 'ClassWithDeprecatedProps',
        deprecated_properties: {
          deprecatedProp: true,
        },
        properties: {
          ...mockLexiconClass.properties,
          deprecatedProp: {
            type: 'string',
            comment: 'A deprecated property',
          },
        },
      };

      renderWithRouter(
        <LexiconClassViewer classes={[classWithDeprecatedProps]} expandByDefault={true} />
      );

      // First expand the class to see the deprecated properties section
      const deprecatedPropertiesButton = screen.getByRole('button', {
        name: /expand deprecated properties/i,
      });
      fireEvent.click(deprecatedPropertiesButton);

      await waitFor(() => {
        expect(screen.getByText('deprecatedProp')).toBeInTheDocument();
      });
    });
  });

  describe('Properties Display', () => {
    beforeEach(() => {
      renderWithRouter(<LexiconClassViewer classes={[mockLexiconClass]} expandByDefault={true} />);
    });

    it('should display property names and types', () => {
      expect(screen.getByText('testProperty')).toBeInTheDocument();
      expect(screen.getAllByText('string')).toHaveLength(2); // testProperty and enumProperty are both string type
      expect(screen.getByText('number')).toBeInTheDocument();
    });

    it('should display property descriptions', () => {
      expect(screen.getByText('A test property for testing purposes')).toBeInTheDocument();
      expect(screen.getByText('A number property')).toBeInTheDocument();
    });

    it('should display enum values for properties with enums', () => {
      expect(screen.getByText('Possible Values:')).toBeInTheDocument();
      expect(screen.getByText('value1')).toBeInTheDocument();
      expect(screen.getByText('value2')).toBeInTheDocument();
      expect(screen.getByText('value3')).toBeInTheDocument();
    });

    it('should display deprecated properties in collapsible section', () => {
      // Create a class with both active and deprecated properties
      const classWithDeprecatedProps = {
        ...mockLexiconClass,
        type: 'ClassWithDeprecatedProps',
        deprecated_properties: {
          deprecatedProp: true,
        },
        properties: {
          ...mockLexiconClass.properties,
          deprecatedProp: {
            type: 'string',
            comment: 'A deprecated property',
          },
        },
      };

      renderWithRouter(
        <LexiconClassViewer classes={[classWithDeprecatedProps]} expandByDefault={true} />
      );

      // Active properties are shown in the main properties section
      expect(screen.getAllByText('testProperty')).toHaveLength(2); // One from each class

      // Deprecated properties are now in a collapsible section
      expect(screen.getByText('Deprecated Properties:')).toBeInTheDocument();
    });
  });

  describe('Clipboard Functionality', () => {
    beforeEach(() => {
      renderWithRouter(<LexiconClassViewer classes={[mockLexiconClass]} expandByDefault={true} />);
    });

    it('should copy enum value to clipboard when clicked', async () => {
      const enumButton = screen.getByRole('button', { name: 'value1' });
      fireEvent.click(enumButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('value1');

      await waitFor(() => {
        expect(screen.getByText('✓ Copied!')).toBeInTheDocument();
      });
    });

    it('should handle clipboard API failure gracefully', async () => {
      // Mock clipboard.writeText to reject
      navigator.clipboard.writeText = vi.fn().mockRejectedValue(new Error('Clipboard error'));

      // Mock document.execCommand for fallback
      document.execCommand = vi.fn().mockReturnValue(true);

      const enumButton = screen.getByRole('button', { name: 'value1' });
      fireEvent.click(enumButton);

      // Should still show copied feedback
      await waitFor(() => {
        expect(screen.getByText('✓ Copied!')).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should display search match indicators', () => {
      renderWithRouter(
        <LexiconClassViewer
          classes={[mockSearchResultClass]}
          searchTerm="matched"
          expandByDefault={true}
        />
      );

      expect(
        screen.getByText(/Found in \d+ propert(y|ies) and \d+ relationship/)
      ).toBeInTheDocument();
    });

    it('should highlight search matches in class names', () => {
      const classWithHighlight = {
        ...mockLexiconClass,
        _searchMatches: [
          {
            type: 'class' as const,
            field: 'type' as const,
            value: '<mark>Test</mark>Class',
            score: 1.0,
          },
        ],
      };

      renderWithRouter(
        <LexiconClassViewer
          classes={[classWithHighlight]}
          searchTerm="test"
          expandByDefault={true}
        />
      );

      // Should render highlighted text (mark tags will be rendered as HTML)
      const elements = screen.getAllByText((content, element) => {
        return element?.innerHTML.includes('<mark>Test</mark>Class') || false;
      });
      expect(elements.length).toBeGreaterThan(0);
    });

    it('should auto-expand classes with search matches', () => {
      renderWithRouter(
        <LexiconClassViewer classes={[mockSearchResultClass]} searchTerm="matched" />
      );

      // Should be auto-expanded because it has matches and show search indicators
      expect(
        screen.getByText(/Found in \d+ propert(y|ies) and \d+ relationship/)
      ).toBeInTheDocument();
    });

    it('should only show matched properties when searching', () => {
      const searchClass = {
        ...mockLexiconClass,
        _searchMatches: [
          {
            type: 'property' as const,
            field: 'name' as const,
            value: 'testProperty',
            score: 1.0,
          },
        ],
        _hasPropertyMatches: true,
        _hasRelationshipMatches: false,
      };

      renderWithRouter(
        <LexiconClassViewer classes={[searchClass]} searchTerm="test" expandByDefault={true} />
      );

      expect(screen.getByText('testProperty')).toBeInTheDocument();
      expect(screen.queryByText('enumProperty')).not.toBeInTheDocument();
      expect(screen.queryByText('numberProperty')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty classes array', () => {
      renderWithRouter(<LexiconClassViewer classes={[]} />);

      expect(screen.queryByText('TestClass')).not.toBeInTheDocument();
    });

    it('should handle classes without properties', () => {
      const classWithoutProps = {
        ...mockLexiconClass,
        properties: {},
      };

      renderWithRouter(<LexiconClassViewer classes={[classWithoutProps]} expandByDefault={true} />);

      expect(screen.queryByText('Properties:')).not.toBeInTheDocument();
    });

    it('should handle classes without relationships', () => {
      const classWithoutRels = {
        ...mockLexiconClass,
        relationships: {},
      };

      renderWithRouter(<LexiconClassViewer classes={[classWithoutRels]} expandByDefault={true} />);

      expect(screen.queryByText('Relationships:')).not.toBeInTheDocument();
    });

    it('should handle classes with empty enum arrays', () => {
      const classWithEmptyEnum = {
        ...mockLexiconClass,
        properties: {
          testProperty: {
            type: 'string',
            comment: 'Test property',
            // Omit enum property entirely for empty enum
          },
        },
      };

      renderWithRouter(
        <LexiconClassViewer classes={[classWithEmptyEnum]} expandByDefault={true} />
      );

      expect(screen.queryByText('Possible Values:')).not.toBeInTheDocument();
    });
  });
});
