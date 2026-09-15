import React from 'react';
import HTMLViewer from './HTMLViewer';
import { Routes, Route } from 'react-router-dom';
import LanguageHTMLViewer from './LanguageHTMLViewer';
import CustomerAPIHTMLViewer from './CustomerAPIHTMLViewer';
import AllClassesViewer from './AllClassesViewer';
import SingleClassViewer from './SingleClassViewer';
import PublishedCatalogViewer from './PublishedCatalogViewer';
import PublishedSchemaViewer from './PublishedSchemaViewer';
import SourceTabs from './components/SourceTabs';

const LegacyNotice: React.FC = () => (
  <div className="legacy-notice" role="status">
    <strong>Legacy working copy</strong>
    <span>
      This view is generated from the repository and will be phased out. Published IPFS schemas are
      the default source.
    </span>
  </div>
);

const App: React.FC = () => {
  return (
    <div>
      <SourceTabs />
      <Routes>
        <Route path="/" element={<PublishedCatalogViewer />} />
        <Route path="/schema/:schemaName" element={<PublishedSchemaViewer />} />
        <Route
          path="/legacy"
          element={
            <>
              <LegacyNotice />
              <AllClassesViewer />
            </>
          }
        />
        <Route
          path="/legacy/class/:className"
          element={
            <>
              <LegacyNotice />
              <SingleClassViewer />
            </>
          }
        />
        <Route
          path="/legacy/:language_name/:product_api_identifier/:schema_type/:output_language"
          element={<CustomerAPIHTMLViewer />}
        />
        <Route
          path="/legacy/:language_name/:product_api_identifier/:schema_type"
          element={<HTMLViewer />}
        />
        <Route path="/legacy/:language_name" element={<LanguageHTMLViewer />} />
      </Routes>
    </div>
  );
};

export default App;
