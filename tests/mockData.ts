import { LexiconClass } from '../src/types/lexicon';

export const mockLexiconClass: LexiconClass = {
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
};

export const mockDeprecatedClass: LexiconClass = {
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
};

export const mockSearchResultClass: LexiconClass = {
  type: 'SearchResultClass',
  container_name: 'search.container',
  is_deprecated: false,
  deprecated_properties: [],
  properties: {
    matchedProperty: {
      type: 'string',
      comment: 'This property matches search terms',
    },
    unmatchedProperty: {
      type: 'number',
      comment: 'This property does not match',
    },
  },
  relationships: {
    matchedRelationship: {
      comment: 'This relationship matches search terms',
      targets: ['MatchedTarget'],
    },
  },
  _searchMatches: [
    {
      type: 'property',
      field: 'name',
      value: 'matchedProperty',
      score: 1.0,
    },
    {
      type: 'relationship',
      field: 'name',
      value: 'matchedRelationship',
      score: 1.0,
      highlightedRelationshipName: '<mark>matched</mark>Relationship',
    },
  ],
  _hasPropertyMatches: true,
  _hasRelationshipMatches: true,
};

export const mockLexiconClasses: LexiconClass[] = [
  mockLexiconClass,
  mockDeprecatedClass,
  mockSearchResultClass,
  {
    type: 'AnotherClass',
    container_name: 'another.container',
    is_deprecated: false,
    deprecated_properties: [],
    properties: {
      anotherProperty: {
        type: 'boolean',
        comment: 'Another property',
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
];

export const mockFilteredClasses = mockLexiconClasses.filter(cls => !cls.is_deprecated);

// Mock data for specific language and product filters
export const mockLanguageClasses = mockLexiconClasses.filter(cls =>
  cls.container_name.includes('realestate')
);

export const mockProductAPIClasses = mockLexiconClasses.filter(cls =>
  cls.container_name.includes('test')
);