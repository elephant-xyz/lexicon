import { LexiconData, LexiconClass, LexiconTag, SearchMatch } from '../types/lexicon';
import lexiconData from '../data/lexicon.json';

class DataService {
  private lexicon: LexiconData;

  constructor() {
    this.lexicon = lexiconData as unknown as LexiconData;
  }

  getAllClasses(): LexiconClass[] {
    return this.lexicon.classes
      .filter(cls => !cls.is_deprecated)
      .sort((a, b) => a.type.localeCompare(b.type));
  }

  getTags(): LexiconTag[] {
    return this.lexicon.tags || [];
  }

  getClassesForTag(tagName: string): LexiconClass[] {
    const tag = this.lexicon.tags?.find(t => t.name === tagName);
    if (!tag) return [];
    
    return this.lexicon.classes
      .filter(cls => !cls.is_deprecated && tag.classes.includes(cls.type))
      .sort((a, b) => a.type.localeCompare(b.type));
  }

  getClassesForLanguage(languageName: string): LexiconClass[] {
    return this.lexicon.classes.filter(cls => 
      !cls.is_deprecated && (
        cls.type.toLowerCase().includes(languageName.toLowerCase()) ||
        cls.container_name.toLowerCase().includes(languageName.toLowerCase())
      )
    );
  }

  getClassesForSchema(languageName: string, productApiIdentifier: string, schemaType: string): LexiconClass[] {
    return this.lexicon.classes.filter(cls => {
      if (cls.is_deprecated) return false;
      
      const matchesLanguage = cls.type.toLowerCase().includes(languageName.toLowerCase());
      const matchesProduct = cls.container_name.toLowerCase().includes(productApiIdentifier.toLowerCase());
      const matchesSchema = cls.type.toLowerCase().includes(schemaType.toLowerCase());
      
      return matchesLanguage || matchesProduct || matchesSchema;
    });
  }

  getClassesForCustomerApi(
    languageName: string, 
    productApiIdentifier: string, 
    schemaType: string, 
    outputLanguage: string
  ): LexiconClass[] {
    return this.lexicon.classes.filter(cls => {
      if (cls.is_deprecated) return false;
      
      const matchesLanguage = cls.type.toLowerCase().includes(languageName.toLowerCase());
      const matchesProduct = cls.container_name.toLowerCase().includes(productApiIdentifier.toLowerCase());
      const matchesSchema = cls.type.toLowerCase().includes(schemaType.toLowerCase());
      const matchesOutput = cls.type.toLowerCase().includes(outputLanguage.toLowerCase());
      
      return matchesLanguage || matchesProduct || matchesSchema || matchesOutput;
    });
  }

  private calculateLevenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private fuzzyMatch(searchTerm: string, target: string): { matches: boolean; score: number; highlight?: string } {
    const lowerSearch = searchTerm.toLowerCase();
    const lowerTarget = target.toLowerCase();
    
    // Exact match gets highest score
    if (lowerTarget.includes(lowerSearch)) {
      const startIndex = lowerTarget.indexOf(lowerSearch);
      const endIndex = startIndex + lowerSearch.length;
      const highlight = target.substring(0, startIndex) + 
        '<mark>' + target.substring(startIndex, endIndex) + '</mark>' + 
        target.substring(endIndex);
      return { matches: true, score: 1.0, highlight };
    }
    
    // Fuzzy matching with Levenshtein distance
    const distance = this.calculateLevenshteinDistance(lowerSearch, lowerTarget);
    const maxLength = Math.max(lowerSearch.length, lowerTarget.length);
    const similarity = 1 - (distance / maxLength);
    
    // Accept matches with >70% similarity
    if (similarity > 0.7) {
      return { matches: true, score: similarity };
    }
    
    return { matches: false, score: 0 };
  }

  private findMatchesInClass(cls: LexiconClass, searchTerm: string): SearchMatch[] {
    const matches: SearchMatch[] = [];
    
    // Check class name match
    const classMatch = this.fuzzyMatch(searchTerm, cls.type);
    if (classMatch.matches) {
      matches.push({
        type: 'class',
        field: 'type',
        value: classMatch.highlight || cls.type,
        score: classMatch.score
      });
    }
    
    // Check properties
    Object.entries(cls.properties).forEach(([propName, propData]) => {
      // Skip deprecated properties
      if (cls.deprecated_properties?.includes(propName)) return;
      
      // Property name match
      const propNameMatch = this.fuzzyMatch(searchTerm, propName);
      if (propNameMatch.matches) {
        matches.push({
          type: 'property',
          field: 'name',
          value: propNameMatch.highlight || propName,
          score: propNameMatch.score
        });
      }
      
      // Property type match
      const typeMatch = this.fuzzyMatch(searchTerm, propData.type);
      if (typeMatch.matches) {
        matches.push({
          type: 'property',
          field: 'type',
          value: propName, // Property name for identification
          score: typeMatch.score,
          highlightedType: typeMatch.highlight || propData.type
        });
      }
      
      // Property description match
      if (propData.comment) {
        const descMatch = this.fuzzyMatch(searchTerm, propData.comment);
        if (descMatch.matches) {
          matches.push({
            type: 'property',
            field: 'description',
            value: propName, // Property name for identification
            score: descMatch.score,
            highlightedDescription: descMatch.highlight || propData.comment
          });
        }
      }
      
      // Enum values match
      if (propData.enum) {
        propData.enum.forEach(enumValue => {
          const enumMatch = this.fuzzyMatch(searchTerm, enumValue);
          if (enumMatch.matches) {
            matches.push({
              type: 'property',
              field: 'enum',
              value: propName, // Property name for identification
              score: enumMatch.score,
              highlightedEnum: enumMatch.highlight || enumValue
            });
          }
        });
      }
    });
    
    return matches;
  }

  filterClassesForSearch(classes: LexiconClass[], searchTerm: string): LexiconClass[] {
    if (!searchTerm || searchTerm.length < 3) return [];
    
    const classMatches: Array<{ class: LexiconClass; matches: SearchMatch[]; score: number }> = [];
    
    classes.forEach(cls => {
      const matches = this.findMatchesInClass(cls, searchTerm);
      if (matches.length > 0) {
        const maxScore = Math.max(...matches.map(m => m.score));
        classMatches.push({ class: cls, matches, score: maxScore });
      }
    });
    
    // Sort by score (highest first)
    return classMatches
      .sort((a, b) => b.score - a.score)
      .map(item => ({
        ...item.class,
        _searchMatches: item.matches, // Store matches for UI use
        _hasPropertyMatches: item.matches.some(m => m.type === 'property')
      }));
  }
}

export default new DataService();