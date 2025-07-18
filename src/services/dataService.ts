import {
  LexiconData,
  LexiconClass,
  LexiconTag,
  SearchMatch,
  DataGroup,
  CommonPattern,
} from '../types/lexicon';
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

  getAllData(): LexiconData {
    return this.lexicon;
  }

  getClassesForTag(tagName: string): LexiconClass[] {
    const tag = this.lexicon.tags?.find(t => t.name === tagName);
    if (!tag) return [];

    return this.lexicon.classes
      .filter(cls => !cls.is_deprecated && tag.classes.includes(cls.type))
      .sort((a, b) => a.type.localeCompare(b.type));
  }

  getClassesForLanguage(languageName: string): LexiconClass[] {
    return this.lexicon.classes.filter(
      cls =>
        !cls.is_deprecated &&
        (cls.type.toLowerCase().includes(languageName.toLowerCase()) ||
          cls.container_name.toLowerCase().includes(languageName.toLowerCase()))
    );
  }

  getClassesForSchema(
    languageName: string,
    productApiIdentifier: string,
    schemaType: string
  ): LexiconClass[] {
    return this.lexicon.classes.filter(cls => {
      if (cls.is_deprecated) return false;

      const matchesLanguage = cls.type.toLowerCase().includes(languageName.toLowerCase());
      const matchesProduct = cls.container_name
        .toLowerCase()
        .includes(productApiIdentifier.toLowerCase());
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
      const matchesProduct = cls.container_name
        .toLowerCase()
        .includes(productApiIdentifier.toLowerCase());
      const matchesSchema = cls.type.toLowerCase().includes(schemaType.toLowerCase());
      const matchesOutput = cls.type.toLowerCase().includes(outputLanguage.toLowerCase());

      return matchesLanguage || matchesProduct || matchesSchema || matchesOutput;
    });
  }

  private calculateLevenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

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
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private fuzzyMatch(
    searchTerm: string,
    target: string
  ): { matches: boolean; score: number; highlight?: string } {
    if (typeof target !== 'string') {
      return { matches: false, score: 0, highlight: '' };
    }
    const lowerSearch = searchTerm.toLowerCase();
    const lowerTarget = target.toLowerCase();

    // Exact match gets highest score
    if (lowerTarget.includes(lowerSearch)) {
      const startIndex = lowerTarget.indexOf(lowerSearch);
      const endIndex = startIndex + lowerSearch.length;
      const highlight =
        target.substring(0, startIndex) +
        '<mark>' +
        target.substring(startIndex, endIndex) +
        '</mark>' +
        target.substring(endIndex);
      return { matches: true, score: 1.0, highlight };
    }

    // Fuzzy matching with Levenshtein distance
    const distance = this.calculateLevenshteinDistance(lowerSearch, lowerTarget);
    const maxLength = Math.max(lowerSearch.length, lowerTarget.length);
    const similarity = 1 - distance / maxLength;

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
        score: classMatch.score,
      });
    }

    // Check class description match
    if (cls.description) {
      const descMatch = this.fuzzyMatch(searchTerm, cls.description);
      if (descMatch.matches) {
        matches.push({
          type: 'class',
          field: 'description',
          value: cls.type, // Class name for identification
          score: descMatch.score,
          highlightedDescription: descMatch.highlight || cls.description,
        });
      }
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
          score: propNameMatch.score,
        });
      }

      // Property type match
      const typeString = Array.isArray(propData.type) ? propData.type.join(' | ') : propData.type;
      const typeMatch = this.fuzzyMatch(searchTerm, typeString);
      if (typeMatch.matches) {
        matches.push({
          type: 'property',
          field: 'type',
          value: propName, // Property name for identification
          score: typeMatch.score,
          highlightedType: typeMatch.highlight || typeString,
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
            highlightedDescription: descMatch.highlight || propData.comment,
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
              highlightedEnum: enumMatch.highlight || enumValue,
            });
          }
        });
      }

      // Pattern match
      if (propData.pattern) {
        const patternMatch = this.fuzzyMatch(searchTerm, propData.pattern);
        if (patternMatch.matches) {
          matches.push({
            type: 'property',
            field: 'pattern',
            value: propName, // Property name for identification
            score: patternMatch.score,
            highlightedPattern: patternMatch.highlight || propData.pattern,
          });
        }
      }

      // Format match
      if (propData.format) {
        const formatMatch = this.fuzzyMatch(searchTerm, propData.format);
        if (formatMatch.matches) {
          matches.push({
            type: 'property',
            field: 'format',
            value: propName, // Property name for identification
            score: formatMatch.score,
            highlightedFormat: formatMatch.highlight || propData.format,
          });
        }
      }
    });

    // Check relationships
    if (cls.relationships) {
      Object.entries(cls.relationships).forEach(([relName, relData]) => {
        // Relationship name match
        const relNameMatch = this.fuzzyMatch(searchTerm, relName);
        if (relNameMatch.matches) {
          matches.push({
            type: 'relationship',
            field: 'name',
            value: relName,
            score: relNameMatch.score,
            highlightedRelationshipName: relNameMatch.highlight || relName,
          });
        }

        // Relationship target match
        if (relData.targets && relData.targets.length > 0) {
          relData.targets.forEach(target => {
            const targetMatch = this.fuzzyMatch(searchTerm, target);
            if (targetMatch.matches) {
              matches.push({
                type: 'relationship',
                field: 'target',
                value: relName, // Relationship name for identification
                score: targetMatch.score,
                highlightedRelationshipTarget: targetMatch.highlight || target,
              });
            }
          });
        }

        // Relationship description match
        if (relData.comment) {
          const relDescMatch = this.fuzzyMatch(searchTerm, relData.comment);
          if (relDescMatch.matches) {
            matches.push({
              type: 'relationship',
              field: 'description',
              value: relName, // Relationship name for identification
              score: relDescMatch.score,
              highlightedRelationshipDescription: relDescMatch.highlight || relData.comment,
            });
          }
        }
      });
    }

    return matches;
  }

  getClassByName(className: string): LexiconClass | undefined {
    return this.lexicon.classes.find(cls => cls.type === className && !cls.is_deprecated);
  }

  getAllDataGroups(): DataGroup[] {
    return this.lexicon.data_groups || [];
  }

  getDataGroupsForTag(tagName: string): DataGroup[] {
    // Only show data groups for blockchain tag
    if (tagName.toLowerCase() !== 'blockchain') return [];
    return this.getAllDataGroups();
  }

  getAllCommonPatterns(): CommonPattern[] {
    return this.lexicon.common_patterns || [];
  }

  getCommonPatternsForSearch(searchTerm: string): CommonPattern[] {
    if (!searchTerm.trim()) return this.getAllCommonPatterns();

    const lowerSearchTerm = searchTerm.toLowerCase();
    return this.getAllCommonPatterns().filter(pattern => {
      return (
        pattern.type.toLowerCase().includes(lowerSearchTerm) ||
        pattern.properties.type.toLowerCase().includes(lowerSearchTerm) ||
        pattern.properties.description.toLowerCase().includes(lowerSearchTerm) ||
        (pattern.properties.format &&
          pattern.properties.format.toLowerCase().includes(lowerSearchTerm)) ||
        (pattern.properties.pattern &&
          pattern.properties.pattern.toLowerCase().includes(lowerSearchTerm))
      );
    });
  }

  private findMatchesInDataGroup(dataGroup: DataGroup, searchTerm: string): SearchMatch[] {
    const matches: SearchMatch[] = [];

    // Check data group label match
    const labelMatch = this.fuzzyMatch(searchTerm, dataGroup.label);
    if (labelMatch.matches) {
      matches.push({
        type: 'class',
        field: 'type',
        value: labelMatch.highlight || dataGroup.label,
        score: labelMatch.score,
      });
    }

    // Check relationship from/to values
    dataGroup.relationships.forEach(rel => {
      const fromMatch = this.fuzzyMatch(searchTerm, rel.from);
      if (fromMatch.matches) {
        matches.push({
          type: 'relationship',
          field: 'target',
          value: `${rel.from} → ${rel.to}`,
          score: fromMatch.score,
          highlightedRelationshipTarget: fromMatch.highlight || rel.from,
        });
      }

      const toMatch = this.fuzzyMatch(searchTerm, rel.to);
      if (toMatch.matches) {
        matches.push({
          type: 'relationship',
          field: 'target',
          value: `${rel.from} → ${rel.to}`,
          score: toMatch.score,
          highlightedRelationshipTarget: toMatch.highlight || rel.to,
        });
      }
    });

    return matches;
  }

  filterDataGroupsForSearch(dataGroups: DataGroup[], searchTerm: string): DataGroup[] {
    if (!searchTerm || searchTerm.length < 3) return [];

    const groupMatches: Array<{ group: DataGroup; matches: SearchMatch[]; score: number }> = [];

    dataGroups.forEach(group => {
      const matches = this.findMatchesInDataGroup(group, searchTerm);
      if (matches.length > 0) {
        const maxScore = Math.max(...matches.map(m => m.score));
        groupMatches.push({ group, matches, score: maxScore });
      }
    });

    // Sort by score (highest first)
    return groupMatches
      .sort((a, b) => b.score - a.score)
      .map(item => ({
        ...item.group,
        _searchMatches: item.matches,
      }));
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
        _hasPropertyMatches: item.matches.some(m => m.type === 'property'),
        _hasRelationshipMatches: item.matches.some(m => m.type === 'relationship'),
      }));
  }
}

export default new DataService();
