import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { WatchlistItem } from '../types';
import { Plus } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

const HomePage: React.FC = () => {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWatchlist();
  }, []);

  const fetchWatchlist = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('watchlist')
      .select('*')
      .order('symbol', { ascending: true });
    
    if (error) {
      console.error('Error fetching watchlist:', error.message);
      setError(`Failed to fetch watchlist: ${error.message}. Please check your Supabase connection and RLS policies.`);
    } else {
      setWatchlist(data);
    }
    setLoading(false);
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol) return;
    setError(null);

    // The following database operations will now succeed because we have
    // created Row Level Security (RLS) policies in Supabase.
    // The policy "Allow anonymous access to watchlist" grants the `anon` key
    // permission to insert new rows, resolving the original RLS violation error.
    const { data: newStock, error: insertError } = await supabase
      .from('watchlist')
      .insert({ 
        symbol: newSymbol.toUpperCase(), 
        company_name: newName
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error adding stock:', insertError);
      setError(`Error: ${insertError.message}. Is the symbol unique?`);
    } else if (newStock) {
       // This insert will also succeed due to the "Allow anonymous access to stock_details" RLS policy.
      const { error: detailsError } = await supabase
        .from('stock_details')
        .insert({
          stock_id: newStock.id,
          revenue_segments: [],
          moat: [
              { power_name: 'Brand', description: '', level: '' },
              { power_name: 'Switching Costs', description: '', level: '' },
              { power_name: 'Network Effects', description: '', level: '' },
              { power_name: 'Counter-Positioning', description: '', level: '' },
              { power_name: 'Scale Economies', description: '', level: '' },
              { power_name: 'Process Power', description: '', level: '' },
              { power_name: 'Cornered Resource', description: '', level: '' }
          ]
        });

      if (detailsError) {
        console.error('Error creating stock details:', detailsError);
        setError(`Stock added, but failed to create details: ${detailsError.message}`);
      } else {
        fetchWatchlist(); // Refresh the list
        setNewSymbol('');
        setNewName('');
        setShowModal(false);
      }
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Stock Watchlist</h1>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Stock
        </Button>
      </header>
      
      {loading ? (
        <p className="text-text-secondary">Loading your watchlist...</p>
      ) : error ? (
        <div className="bg-danger/20 text-danger p-4 rounded-md">{error}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {watchlist.map(stock => (
            <Link to={`/stock/${stock.id}`} key={stock.id} className="block transition-transform duration-200 hover:scale-105">
              <Card className="h-full">
                <h2 className="text-2xl font-bold text-primary">{stock.symbol}</h2>
                <p className="text-text-secondary truncate">{stock.company_name}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
      
      {!loading && watchlist.length === 0 && !error && (
          <div className="text-center py-16">
              <h2 className="text-xl font-semibold">Your watchlist is empty.</h2>
              <p className="text-text-secondary mt-2">Click "+ Add Stock" to start your research.</p>
          </div>
      )}

      {/* Add Stock Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in">
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
                <label htmlFor="name" className="block text-sm font-medium text-text-secondary">Company Name</label>
                <input
                  id="name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
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