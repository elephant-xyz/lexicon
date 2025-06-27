import React, { useEffect, useState } from 'react';
import dataService from './services/dataService';
import LexiconClassViewer from './components/LexiconClassViewer';
import { LexiconClass } from './types/lexicon';

import './styles.css';

const AllClassesViewer = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [classes, setClasses] = useState<LexiconClass[]>([]);
  const [filteredClasses, setFilteredClasses] = useState<LexiconClass[]>([]);

  useEffect(() => {
    const allClasses = dataService.getAllClasses();
    setClasses(allClasses);
    setFilteredClasses(allClasses);
  }, []);

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
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>
      <LexiconClassViewer classes={filteredClasses} />
    </div>
  );  
};

export default AllClassesViewer;