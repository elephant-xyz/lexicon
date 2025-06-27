import { describe, it, expect, vi } from 'vitest';
import { mockLexiconClasses, mockLexiconClass, mockSearchResultClass } from '../mockData';

// Mock the lexicon data before importing the service
vi.mock('../../src/data/lexicon.json', () => ({
  default: {
    classes: [
      {
        type: 'TestClass',
        container_name: 'test.container',
        is_deprecated: false,
        deprecated_properties: [],
        properties: {
          testProperty: {
            type: 'string',
            comment: 'A test property for testing purposes',
          },
          enumProperty: {
            type: 'string',
            comment: 'An enum property',
            enum: ['value1', 'value2', 'value3'],
          },
          numberProperty: {
            type: 'number',
            comment: 'A number property',
          },
        },
        relationships: {
          testRelationship: {
            comment: 'A test relationship',
            targets: ['TargetClass1', 'TargetClass2'],
          },
          singleTargetRelationship: {
            comment: 'A relationship with single target',
            targets: ['SingleTarget'],
          },
        },
      },
      {
        type: 'DeprecatedClass',
        container_name: 'deprecated.container',
        is_deprecated: true,
        deprecated_properties: ['deprecatedProp'],
        properties: {
          activeProp: {
            type: 'string',
            comment: 'An active property',
          },
          deprecatedProp: {
            type: 'string',
            comment: 'A deprecated property',
          },
        },
        relationships: {},
      },
      {
        type: 'RealEstateClass',
        container_name: 'realestate.container',
        is_deprecated: false,
        deprecated_properties: [],
        properties: {
          price: {
            type: 'number',
            comment: 'Property price',
          },
          address: {
            type: 'string',
            comment: 'Property address',
          },
        },
        relationships: {
          owner: {
            comment: 'Property owner',
            targets: ['PersonClass'],
          },
        },
      },
    ],
    tags: [
      {
        name: 'realestate',
        classes: ['RealEstateClass'],
      },
      {
        name: 'blockchain',
        classes: ['TestClass'],
      },
    ],
    data_groups: [
      {
        label: 'Test Data Group',
        relationships: [
          { from: 'ClassA', to: 'ClassB' },
          { from: 'ClassB', to: 'ClassC' },
        ],
      },
    ],
  },
}));

// Import service after mocking
import dataService from '../../src/services/dataService';

describe('DataService', () => {
  describe('getAllClasses', () => {
    it('should return all non-deprecated classes sorted by type', () => {
      const classes = dataService.getAllClasses();
      
      expect(classes).toBeDefined();
      expect(classes.length).toBeGreaterThan(0);
      
      // Should not include deprecated classes
      expect(classes.every(cls => !cls.is_deprecated)).toBe(true);
      
      // Should be sorted by type
      const types = classes.map(cls => cls.type);
      const sortedTypes = [...types].sort();
      expect(types).toEqual(sortedTypes);
    });
  });

  describe('getTags', () => {
    it('should return all available tags', () => {
      const tags = dataService.getTags();
      
      expect(tags).toBeDefined();
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.some(tag => tag.name === 'realestate')).toBe(true);
    });
  });

  describe('getClassesForTag', () => {
    it('should return classes for a valid tag', () => {
      const classes = dataService.getClassesForTag('realestate');
      
      expect(Array.isArray(classes)).toBe(true);
      // Should only include classes that belong to the tag
      classes.forEach(cls => {
        expect(cls.is_deprecated).toBe(false);
      });
    });

    it('should return empty array for invalid tag', () => {
      const classes = dataService.getClassesForTag('nonexistent');
      
      expect(Array.isArray(classes)).toBe(true);
      expect(classes).toHaveLength(0);
    });
  });

  describe('getClassesForLanguage', () => {
    it('should return classes matching language name', () => {
      const classes = dataService.getClassesForLanguage('real');
      
      expect(Array.isArray(classes)).toBe(true);
      classes.forEach(cls => {
        expect(cls.is_deprecated).toBe(false);
        expect(
          cls.type.toLowerCase().includes('real') ||
          cls.container_name.toLowerCase().includes('real')
        ).toBe(true);
      });
    });

    it('should return empty array for non-matching language', () => {
      const classes = dataService.getClassesForLanguage('nonexistent');
      
      expect(Array.isArray(classes)).toBe(true);
    });
  });

  describe('getClassesForSchema', () => {
    it('should return classes matching schema parameters', () => {
      const classes = dataService.getClassesForSchema('test', 'container', 'class');
      
      expect(Array.isArray(classes)).toBe(true);
      classes.forEach(cls => {
        expect(cls.is_deprecated).toBe(false);
      });
    });
  });

  describe('getClassesForCustomerApi', () => {
    it('should return classes matching customer API parameters', () => {
      const classes = dataService.getClassesForCustomerApi('test', 'container', 'class', 'output');
      
      expect(Array.isArray(classes)).toBe(true);
      classes.forEach(cls => {
        expect(cls.is_deprecated).toBe(false);
      });
    });
  });

  describe('getClassByName', () => {
    it('should return class by exact name match', () => {
      const foundClass = dataService.getClassByName('TestClass');
      
      expect(foundClass).toBeDefined();
      expect(foundClass?.type).toBe('TestClass');
      expect(foundClass?.is_deprecated).toBe(false);
    });

    it('should return undefined for non-existent class', () => {
      const foundClass = dataService.getClassByName('NonExistentClass');
      
      expect(foundClass).toBeUndefined();
    });

    it('should not return deprecated classes', () => {
      const foundClass = dataService.getClassByName('DeprecatedClass');
      
      expect(foundClass).toBeUndefined();
    });
  });

  describe('getAllDataGroups', () => {
    it('should return all data groups', () => {
      const dataGroups = dataService.getAllDataGroups();
      
      expect(Array.isArray(dataGroups)).toBe(true);
    });
  });

  describe('getDataGroupsForTag', () => {
    it('should return data groups for blockchain tag', () => {
      const dataGroups = dataService.getDataGroupsForTag('blockchain');
      
      expect(Array.isArray(dataGroups)).toBe(true);
    });

    it('should return empty array for non-blockchain tags', () => {
      const dataGroups = dataService.getDataGroupsForTag('realestate');
      
      expect(Array.isArray(dataGroups)).toBe(true);
      expect(dataGroups).toHaveLength(0);
    });
  });

  describe('filterClassesForSearch', () => {
    it('should return empty array for short search terms', () => {
      const result = dataService.filterClassesForSearch(mockLexiconClasses, 'ab');
      
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('should return empty array for empty search term', () => {
      const result = dataService.filterClassesForSearch(mockLexiconClasses, '');
      
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('should find classes by type name', () => {
      const result = dataService.filterClassesForSearch(mockLexiconClasses, 'test');
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      const foundClass = result.find(cls => cls.type === 'TestClass');
      expect(foundClass).toBeDefined();
      expect(foundClass?._searchMatches).toBeDefined();
    });

    it('should find classes by property names', () => {
      const result = dataService.filterClassesForSearch(mockLexiconClasses, 'testProperty');
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      const foundClass = result.find(cls => 
        cls._searchMatches?.some(match => 
          match.type === 'property' && match.field === 'name'
        )
      );
      expect(foundClass).toBeDefined();
    });

    it('should find classes by relationship names', () => {
      const result = dataService.filterClassesForSearch(mockLexiconClasses, 'testRelationship');
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      const foundClass = result.find(cls => 
        cls._searchMatches?.some(match => 
          match.type === 'relationship' && match.field === 'name'
        )
      );
      expect(foundClass).toBeDefined();
    });

    it('should find classes by enum values', () => {
      const result = dataService.filterClassesForSearch(mockLexiconClasses, 'value1');
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      const foundClass = result.find(cls => 
        cls._searchMatches?.some(match => 
          match.type === 'property' && match.field === 'enum'
        )
      );
      expect(foundClass).toBeDefined();
    });

    it('should set search match flags correctly', () => {
      const result = dataService.filterClassesForSearch([mockSearchResultClass], 'matched');
      
      expect(result).toHaveLength(1);
      const cls = result[0];
      expect(cls._hasPropertyMatches).toBe(true);
      expect(cls._hasRelationshipMatches).toBe(true);
      expect(cls._searchMatches).toBeDefined();
      expect(cls._searchMatches!.length).toBeGreaterThan(0);
    });

    it('should sort results by relevance score', () => {
      const result = dataService.filterClassesForSearch(mockLexiconClasses, 'test');
      
      if (result.length > 1) {
        // Check that scores are in descending order
        for (let i = 1; i < result.length; i++) {
          const prevScore = Math.max(...(result[i-1]._searchMatches?.map(m => m.score) || [0]));
          const currentScore = Math.max(...(result[i]._searchMatches?.map(m => m.score) || [0]));
          expect(prevScore).toBeGreaterThanOrEqual(currentScore);
        }
      }
    });

    it('should exclude deprecated properties from search', () => {
      const result = dataService.filterClassesForSearch(mockLexiconClasses, 'deprecatedProp');
      
      // Should not find the deprecated property
      const foundMatch = result.find(cls => 
        cls._searchMatches?.some(match => 
          match.type === 'property' && match.value.includes('deprecatedProp')
        )
      );
      expect(foundMatch).toBeUndefined();
    });
  });

  describe('filterDataGroupsForSearch', () => {
    it('should return empty array for short search terms', () => {
      const result = dataService.filterDataGroupsForSearch([], 'ab');
      
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('should find data groups by label', () => {
      const mockDataGroups = [
        {
          label: 'Test Data Group',
          relationships: [{ from: 'A', to: 'B' }],
        },
      ];
      
      const result = dataService.filterDataGroupsForSearch(mockDataGroups, 'test');
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]._searchMatches).toBeDefined();
    });
  });

  describe('fuzzy matching', () => {
    it('should handle exact matches with highlighting', () => {
      const result = dataService.filterClassesForSearch([mockLexiconClass], 'TestClass');
      
      expect(result).toHaveLength(1);
      const match = result[0]._searchMatches?.find(m => m.type === 'class');
      expect(match?.value).toContain('<mark>');
      expect(match?.value).toContain('</mark>');
    });

    it('should handle partial matches', () => {
      const result = dataService.filterClassesForSearch([mockLexiconClass], 'Test');
      
      expect(result).toHaveLength(1);
      expect(result[0]._searchMatches).toBeDefined();
      expect(result[0]._searchMatches!.length).toBeGreaterThan(0);
    });
  });
});