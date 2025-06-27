import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import LZString from 'lz-string'; // Don't forget to install this package

import './styles.css'; // Import the CSS file

const LanguageHTMLViewer = () => {
  const { language_name } = useParams();

  const [searchTerm, setSearchTerm] = useState('');
  const [filteredHtml, setFilteredHtml] = useState('');

  let current_url = window.location.href;
  let suffix = "/" + language_name;
  let result = current_url.replace(suffix, "");
  let query_url = "https://bushnell.staircaseapi.com";

  if (result.includes("staircaseapi.com")) {
    let prefix = "https://entity.";
    result = result.replace(prefix, "");
    query_url = "https://" + result;
  }
  let url = new URL(query_url);
  url.hash = "";
  query_url = url.toString();

  const [htmlUrl, setHtmlUrl] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const cacheKey = `htmlContent_${language_name}`;
  
  
  
  
  
  

  // Load data from local storage on mount
  useEffect(() => {
    const cachedHtml = localStorage.getItem(cacheKey);
    if (cachedHtml) {
      setHtmlContent(LZString.decompressFromUTF16(cachedHtml)); // Decompress data
    }

    let api_url = query_url + "entity-viewer-api/query";
    fetch(api_url, {
      method: "POST",
      body: JSON.stringify({
        language_name: language_name,
      }),
      headers: {
        "Content-type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        const embeddedHtmlUrl = data.message;
        setHtmlUrl(embeddedHtmlUrl);
      })
      .catch((error) => console.error('Error fetching HTML URL:', error));
  }, [cacheKey, language_name, query_url]);

  useEffect(() => {
    if (htmlUrl) {
      fetch(htmlUrl)
        .then((response) => response.text())
        .then((newHtmlContent) => {
          setHtmlContent(newHtmlContent);
          try {
            localStorage.setItem(cacheKey, LZString.compressToUTF16(newHtmlContent));  // Compress and save to local storage
          } catch(e) {
            if (e.name === 'QuotaExceededError') {
              localStorage.clear(); // Clear all local storage
              localStorage.setItem(cacheKey, LZString.compressToUTF16(newHtmlContent)); // Try again
            }
          }
        })
        .catch((error) => console.error('Error fetching HTML content:', error));
    }
  }, [htmlUrl, cacheKey]);

  useEffect(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const items = Array.from(doc.querySelectorAll('.method-list-item'));
    
    const filteredItems = items.filter((item) => {
      const children = item.querySelectorAll('.method-list-item-isChild .method-list-item-label-name');
      const matchingChildren = Array.from(children).some(child => 
        child.textContent.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (matchingChildren) return true;
      
      const labelName = item.querySelector('.method-list-item-label-name');
      return labelName && labelName.textContent.toLowerCase().includes(searchTerm.toLowerCase());
    });
  
    setFilteredHtml(filteredItems.map((item) => item.outerHTML).join(''));
  }, [searchTerm, htmlContent]);

  
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
      <div dangerouslySetInnerHTML={{ __html: searchTerm ? filteredHtml : htmlContent }} />
    </div>
  );  
};

export default LanguageHTMLViewer;
