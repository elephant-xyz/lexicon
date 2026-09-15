import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import '../styles.css';

const SourceTabs: React.FC = () => {
  const location = useLocation();
  const isLegacy = location.pathname.startsWith('/legacy');

  return (
    <nav className="source-tabs" aria-label="Lexicon source">
      <div className="source-tabs__inner">
        <span className="source-tabs__label">Source</span>
        <NavLink
          to="/"
          className={`source-tab ${isLegacy ? '' : 'source-tab--active'}`}
          aria-current={isLegacy ? undefined : 'page'}
        >
          <span className="source-tab__signal" aria-hidden="true" />
          Published
          <small>IPFS</small>
        </NavLink>
        <NavLink
          to="/legacy"
          className={`source-tab ${isLegacy ? 'source-tab--active' : ''}`}
          aria-current={isLegacy ? 'page' : undefined}
        >
          Legacy
          <small>Git working copy</small>
        </NavLink>
      </div>
    </nav>
  );
};

export default SourceTabs;
