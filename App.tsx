import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';

import HomePage from './pages/HomePage';
import DetailPage from './pages/DetailPage';
import FinancialsPage from './pages/FinancialsPage';
import EarningCallStoryPage from './pages/EarningCallStoryPage';
import ValuationPage from './pages/ValuationPage';

const App: React.FC = () => {
  return (
    <HashRouter>
      <div className="bg-background text-text-primary min-h-screen">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/stock/:stockId" element={<DetailPage />} />
          <Route path="/stock/:stockId/financials" element={<FinancialsPage />} />
          <Route path="/stock/:stockId/earning-call-story" element={<EarningCallStoryPage />} />
          <Route path="/stock/:stockId/valuation" element={<ValuationPage />} />
        </Routes>
      </div>
    </HashRouter>
  );
};

export default App;