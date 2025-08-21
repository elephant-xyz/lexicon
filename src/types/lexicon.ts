export interface LexiconProperty {
  type: string | string[];
  enum?: string[];
  comment?: string;
  pattern?: string;
  format?: string;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, LexiconProperty>;
  patternProperties?: Record<string, LexiconProperty>;
  additionalProperties?: LexiconProperty | boolean;
  items?: LexiconProperty;
  minItems?: number;
  minProperties?: number;
  required?: boolean;
  optional?: boolean; // New field to mark properties as optional
  oneOf?: LexiconProperty[];
  allOf?: LexiconProperty[];
  const?: string;
  not?: LexiconProperty;
}

export interface LexiconRelationship {
  targets?: string[];
  comment?: string;
}

export interface SearchMatch {
  type: 'class' | 'property' | 'relationship';
  field: string;
  value: string;
  score: number;
  highlightedDescription?: string;
  highlightedEnum?: string;
  highlightedType?: string;
  highlightedPattern?: string;
  highlightedFormat?: string;
  highlightedRelationshipName?: string;
  highlightedRelationshipTarget?: string;
  highlightedRelationshipDescription?: string;
}

export interface LexiconClass {
  type: string;
  container_name: string;
  is_deprecated: boolean;
  deprecated_properties: string[];
  description?: string;
  source_url?: {
    type: string;
    format: string;
    comment?: string;
  };
  properties: Record<string, LexiconProperty>;
  relationships?: Record<string, LexiconRelationship>;
  required?: string[];
  example?: Record<string, unknown>;
  examples?: Array<Record<string, unknown>>;
  _searchMatches?: SearchMatch[];
  _hasPropertyMatches?: boolean;
  _hasRelationshipMatches?: boolean;
}

export interface LexiconTag {
  name: string;
  classes: string[];
}

export interface DataGroupRelationship {
  type: string;
  from: string;
  to: string;
  relationship_type: string;
}

export interface DataGroup {
  label: string;
  relationships: DataGroupRelationship[];
  required?: string[];
  one_to_many_relationships?: string[];
  example?: Record<string, unknown>;
  _searchMatches?: SearchMatch[];
}

export interface CommonPattern {
  type: string;
  format?: string; // Some patterns have format at top level
  properties: {
    type: string;
    pattern?: string;
    format?: string; // Some patterns have format nested in properties
    description: string;
  };
}

export interface LexiconData {
  classes: LexiconClass[];
  tags: LexiconTag[];
  data_groups: DataGroup[];
  common_patterns: CommonPattern[];
}
