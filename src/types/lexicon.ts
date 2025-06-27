export interface LexiconProperty {
  type: string;
  enum?: string[];
  comment?: string;
}

export interface LexiconRelationship {
  targets?: string[];
  comment?: string;
}

export interface SearchMatch {
  type: 'class' | 'property';
  field: string;
  value: string;
  score: number;
  highlightedDescription?: string;
  highlightedEnum?: string;
  highlightedType?: string;
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
}

export interface LexiconTag {
  name: string;
  classes: string[];
}

export interface LexiconData {
  classes: LexiconClass[];
  tags: LexiconTag[];
}