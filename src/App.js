import React from 'react';
import HTMLViewer from './HTMLViewer';
import { Route, Switch } from 'react-router-dom'
import LanguageHTMLViewer from "./LanguageHTMLViewer";
import CustomerAPIHTMLViewer from "./CustomerAPIHTMLViewer";

const App = () => {
  return (
    <div>
        <Switch>
          <Route exact path="/:language_name/:product_api_identifier/:schema_type">
            <HTMLViewer/>
          </Route>
          <Route exact path="/:language_name">
            <LanguageHTMLViewer/>
          </Route>
          <Route exact path="/:language_name/:product_api_identifier/:schema_type/:output_language">
            <CustomerAPIHTMLViewer/>
          </Route>
        </Switch>
    </div>
  );
};

export default App;
