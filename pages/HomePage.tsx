import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { WatchlistItem } from '../types';
import { Plus } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { formatErrorMessage } from '../utils/errorHandler';


const HomePage: React.FC = () => {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchWatchlist();
  }, []);
  
  const fetchWatchlist = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('watchlist')
        .select('*')
        .order('symbol', { ascending: true });
      
      if (fetchError) throw fetchError;
      setWatchlist(data || []);
    } catch (err) {
      setError(formatErrorMessage('Error fetching watchlist', err));
    } finally {
      setLoading(false);
    }
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol) return;
    setError(null);

    try {
      const { data: newStock, error: insertError } = await supabase
        .from('watchlist')
        .insert({ 
          symbol: newSymbol.toUpperCase(), 
          company: newCompany
        })
        .select()
        .single();

      if (insertError) throw insertError;
      
      setNewSymbol('');
      setNewCompany('');
      setShowModal(false);

      if (newStock) {
        navigate(`/stock/${newStock.id}`);
      } else {
        await fetchWatchlist();
      }

    } catch (err) {
      setError(formatErrorMessage('Error adding stock', err));
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Stock Watchlist</h1>
        <Button onClick={() => { setShowModal(true); setError(null); }}>
          <Plus className="w-4 h-4 mr-2" /> Add Stock
        </Button>
      </header>
      
      {loading ? (
        <p className="text-text-secondary">Loading your watchlist...</p>
      ) : error ? (
        <div className="bg-danger/20 text-danger p-4 rounded-md">{error}</div>
      ) : (
        <>
          {watchlist.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {watchlist.map(stock => (
                <Link to={`/stock/${stock.id}`} key={stock.id} className="block transition-transform duration-200 hover:scale-105">
                  <Card className="h-full">
                    <h2 className="text-2xl font-bold text-primary">{stock.symbol}</h2>
                    <p className="text-text-secondary truncate">{stock.company || 'No company name'}</p>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
             <div className="text-center py-16">
                  <h2 className="text-xl font-semibold">Your watchlist is empty.</h2>
                  <p className="text-text-secondary mt-2">Click "+ Add Stock" to start your research.</p>
              </div>
          )}
        </>
      )}
      
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-content p-8 rounded-lg shadow-xl w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6">Add New Stock</h2>
            {error && <p className="bg-danger/20 text-danger p-2 rounded-md mb-4 text-sm">{error}</p>}
            <form onSubmit={handleAddStock} className="space-y-4">
              <div>
                <label htmlFor="symbol" className="block text-sm font-medium text-text-secondary">Stock Symbol</label>
                <input
                  id="symbol"
                  type="text"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  className="w-full mt-1 bg-accent px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                  placeholder="e.g., AAPL"
                />
              </div>
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-text-secondary">Company Name</label>
                <input
                  id="company"
                  type="text"
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  className="w-full mt-1 bg-accent px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., Apple Inc."
                />
              </div>
              <div className="flex justify-end gap-4 pt-4">
                <Button variant="secondary" onClick={() => {setShowModal(false); setError(null);}} type="button">Cancel</Button>
                <Button type="submit">Add</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;
