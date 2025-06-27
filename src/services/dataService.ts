import { LexiconData, LexiconClass, LexiconTag } from '../types/lexicon';
import lexiconData from '../data/lexicon.json';

class DataService {
  private lexicon: LexiconData;

  constructor() {
    this.lexicon = lexiconData as unknown as LexiconData;
  }

  getAllClasses(): LexiconClass[] {
    return this.lexicon.classes.sort((a, b) => a.type.localeCompare(b.type));
  }

  getTags(): LexiconTag[] {
    return this.lexicon.tags || [];
  }

  getClassesForTag(tagName: string): LexiconClass[] {
    const tag = this.lexicon.tags?.find(t => t.name === tagName);
    if (!tag) return [];
    
    return this.lexicon.classes
      .filter(cls => tag.classes.includes(cls.type))
      .sort((a, b) => a.type.localeCompare(b.type));
  }

  getClassesForLanguage(languageName: string): LexiconClass[] {
    return this.lexicon.classes.filter(cls => 
      cls.type.toLowerCase().includes(languageName.toLowerCase()) ||
      cls.container_name.toLowerCase().includes(languageName.toLowerCase())
    );
  }

  getClassesForSchema(languageName: string, productApiIdentifier: string, schemaType: string): LexiconClass[] {
    return this.lexicon.classes.filter(cls => {
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
      const matchesLanguage = cls.type.toLowerCase().includes(languageName.toLowerCase());
      const matchesProduct = cls.container_name.toLowerCase().includes(productApiIdentifier.toLowerCase());
      const matchesSchema = cls.type.toLowerCase().includes(schemaType.toLowerCase());
      const matchesOutput = cls.type.toLowerCase().includes(outputLanguage.toLowerCase());
      
      return matchesLanguage || matchesProduct || matchesSchema || matchesOutput;
    });
  }

  filterClassesForSearch(classes: LexiconClass[], searchTerm: string): LexiconClass[] {
    if (!searchTerm) return classes;
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    return classes.filter(cls => {
      const matchesType = cls.type.toLowerCase().includes(lowerSearchTerm);
      const matchesContainer = cls.container_name.toLowerCase().includes(lowerSearchTerm);
      
      const matchesProperty = Object.keys(cls.properties).some(propName =>
        propName.toLowerCase().includes(lowerSearchTerm)
      );
      
      const matchesRelationship = cls.relationships && 
        Object.keys(cls.relationships).some(relName =>
          relName.toLowerCase().includes(lowerSearchTerm)
        );
      
      return matchesType || matchesContainer || matchesProperty || matchesRelationship;
    });
  }
}

export default new DataService();