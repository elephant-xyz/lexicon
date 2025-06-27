import React from 'react';
import HTMLViewer from './HTMLViewer';
import { Routes, Route } from 'react-router-dom'
import LanguageHTMLViewer from "./LanguageHTMLViewer";
import CustomerAPIHTMLViewer from "./CustomerAPIHTMLViewer";
import AllClassesViewer from "./AllClassesViewer";

const App: React.FC = () => {
  return (
    <div>
        <Routes>
          <Route path="/" element={<AllClassesViewer />} />
          <Route path="/:language_name/:product_api_identifier/:schema_type/:output_language" element={<CustomerAPIHTMLViewer/>} />
          <Route path="/:language_name/:product_api_identifier/:schema_type" element={<HTMLViewer/>} />
          <Route path="/:language_name" element={<LanguageHTMLViewer/>} />
        </Routes>
    </div>
  );
};

export default App;
