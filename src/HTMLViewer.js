import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom'

import './styles.css'; // Import the CSS file

const HTMLViewer = () => {
  const { language_name, product_api_identifier, schema_type } = useParams()

  let current_url = window.location.href;
  let suffix ="/" + language_name+ "/" + product_api_identifier + "/" + schema_type;
  let result = current_url.replace(suffix, "");
  let query_url = "https://bushnell.staircaseapi.com"

  if(result.includes("staircaseapi.com")) {
    let prefix = "https://entity."
    result = result.replace(prefix, "");
    query_url = "https://" + result
  }

  const cacheKey = `htmlContent_${language_name}_${product_api_identifier}_${schema_type}`;
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredHtml, setFilteredHtml] = useState('');

  const [htmlContent, setHtmlContent] = useState('');

  // Load data from local storage on mount
  useEffect(() => {
    const cachedHtml = localStorage.getItem(cacheKey);
    if (cachedHtml) {
      setHtmlContent(cachedHtml);
    }
  }, [cacheKey]);

  // Fetch HTML from the API
  useEffect(() => {
    let api_url = query_url + "/entity-viewer-api/query"
    fetch(api_url, {
        method: "POST",
        body: JSON.stringify({
            product_api_identifier: product_api_identifier,
            schema_type: schema_type,
            language_name: language_name
        }),
        headers: {
            "Content-type": "application/json"
        }
    })
      .then(response => response.json())
      .then(data => {
        const embeddedHtml = data.message;
        setHtmlContent(embeddedHtml);
        localStorage.setItem(cacheKey, embeddedHtml);  // Save to local storage
      })
      .catch(error => console.error('Error fetching HTML:', error));
  }, [language_name, product_api_identifier, schema_type, cacheKey, query_url]);

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

export default HTMLViewer;
