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
  properties: Record<string, LexiconProperty>;
  relationships?: Record<string, LexiconRelationship>;
  _searchMatches?: SearchMatch[];
  _hasPropertyMatches?: boolean;
  _hasRelationshipMatches?: boolean;
}

export interface LexiconTag {
  name: string;
  classes: string[];
}

export interface DataGroupRelationship {
  from: string;
  to: string;
}

export interface DataGroup {
  label: string;
  relationships: DataGroupRelationship[];
  _searchMatches?: SearchMatch[];
}

export interface LexiconData {
  classes: LexiconClass[];
  tags: LexiconTag[];
  data_groups: DataGroup[];
}
