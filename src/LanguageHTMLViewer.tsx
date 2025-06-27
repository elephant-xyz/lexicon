import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import dataService from './services/dataService';
import LexiconClassViewer from './components/LexiconClassViewer';
import { LexiconClass } from './types/lexicon';

import './styles.css';

const LanguageHTMLViewer = () => {
  const { language_name } = useParams<{ language_name: string }>();

  const [searchTerm, setSearchTerm] = useState('');
  const [classes, setClasses] = useState<LexiconClass[]>([]);
  const [filteredClasses, setFilteredClasses] = useState<LexiconClass[]>([]);

  useEffect(() => {
    if (language_name) {
      const lexiconClasses = dataService.getClassesForLanguage(language_name);
      setClasses(lexiconClasses);
      setFilteredClasses(lexiconClasses);
    }
  }, [language_name]);

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

export default LanguageHTMLViewer;
