export interface LexiconProperty {
  type: string;
  enum?: string[];
  comment?: string;
  pattern?: string;
  format?: string;
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
  example?: Record<string, unknown>;
  _searchMatches?: SearchMatch[];
}

export interface CommonPattern {
  type: string;
  properties: {
    type: string;
    pattern?: string;
    format?: string;
    description: string;
  };
}

export interface LexiconData {
  classes: LexiconClass[];
  tags: LexiconTag[];
  data_groups: DataGroup[];
  common_patterns: CommonPattern[];
}
