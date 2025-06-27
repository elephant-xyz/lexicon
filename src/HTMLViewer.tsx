import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import dataService from './services/dataService';
import LexiconClassViewer from './components/LexiconClassViewer';
import { LexiconClass } from './types/lexicon';

import './styles.css';

const HTMLViewer = () => {
  const { language_name, product_api_identifier, schema_type } = useParams<{
    language_name: string;
    product_api_identifier: string;
    schema_type: string;
  }>();

  const [searchTerm, setSearchTerm] = useState('');
  const [classes, setClasses] = useState<LexiconClass[]>([]);
  const [filteredClasses, setFilteredClasses] = useState<LexiconClass[]>([]);

  useEffect(() => {
    if (language_name && product_api_identifier && schema_type) {
      const lexiconClasses = dataService.getClassesForSchema(
        language_name,
        product_api_identifier,
        schema_type
      );
      setClasses(lexiconClasses);
      setFilteredClasses(lexiconClasses);
    }
  }, [language_name, product_api_identifier, schema_type]);

  useEffect(() => {
    const filtered = dataService.filterClassesForSearch(classes, searchTerm);
    setFilteredClasses(filtered);
  }, [searchTerm, classes]);

  return (
    <div className="search-container">
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>
      <LexiconClassViewer classes={filteredClasses} />
    </div>
  );
};

export default HTMLViewer;
