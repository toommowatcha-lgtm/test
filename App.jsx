import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';

import HomePage from './pages/HomePage';
import DetailPage from './pages/DetailPage'; // Business Overview
import FinancialsPage from './pages/FinancialsPage';
import EarningCallStoryPage from './pages/EarningCallStoryPage';
import ValuationPage from './pages/ValuationPage';

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        
        {/* The DetailPage serves as the "Business Overview" tab */}
        <Route path="/stock/:stockId" element={<DetailPage />} />
        <Route path="/stock/:stockId/financials" element={<FinancialsPage />} />
        <Route path="/stock/:stockId/earning-call-story" element={<EarningCallStoryPage />} />
        <Route path="/stock/:stockId/valuation" element={<ValuationPage />} />
        
        {/* Redirect any other stock-related paths to the overview */}
        <Route path="/stock/:stockId/*" element={<Navigate to="/stock/:stockId" replace />} />
        
        {/* Redirect any unknown paths back to the main watchlist */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
