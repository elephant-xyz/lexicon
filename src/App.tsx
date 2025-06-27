import React from 'react';
import HTMLViewer from './HTMLViewer';
import { Routes, Route, Navigate } from 'react-router-dom'
import LanguageHTMLViewer from "./LanguageHTMLViewer";
import CustomerAPIHTMLViewer from "./CustomerAPIHTMLViewer";

const App: React.FC = () => {
  return (
    <div>
        <Routes>
          <Route path="/" element={<Navigate to="/school" replace />} />
          <Route path="/:language_name/:product_api_identifier/:schema_type/:output_language" element={<CustomerAPIHTMLViewer/>} />
          <Route path="/:language_name/:product_api_identifier/:schema_type" element={<HTMLViewer/>} />
          <Route path="/:language_name" element={<LanguageHTMLViewer/>} />
        </Routes>
    </div>
  );
};

export default App;
