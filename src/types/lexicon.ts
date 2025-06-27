export interface LexiconProperty {
  type: string;
  enum?: string[];
  comment?: string;
}

export interface LexiconRelationship {
  targets?: string[];
  comment?: string;
}

export interface LexiconClass {
  type: string;
  container_name: string;
  is_deprecated: boolean;
  deprecated_properties: string[];
  properties: Record<string, LexiconProperty>;
  relationships?: Record<string, LexiconRelationship>;
}

export interface LexiconData {
  classes: LexiconClass[];
}