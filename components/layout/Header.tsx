
import React, { useState } from 'react';
import { Search, Bell, User as UserIcon } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import stockService from '../../services/stockService';
import { useNavigate } from 'react-router-dom';

const Header: React.FC = () => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ symbol: string; companyName: string }[]>([]);
  const navigate = useNavigate();

  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.length > 1) {
      const results = await stockService.search(query);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const handleResultClick = (symbol: string) => {
    navigate(`/stock/${symbol}`);
    setSearchQuery('');
    setSearchResults([]);
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <header className="h-20 bg-content flex-shrink-0 flex items-center justify-between px-4 md:px-6">
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search for a stock..."
          value={searchQuery}
          onChange={handleSearchChange}
          className="w-full bg-accent pl-10 pr-4 py-2 rounded-lg border border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {searchResults.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-content-dark border border-accent rounded-lg shadow-lg">
                <ul>
                    {searchResults.map(result => (
                        <li key={result.symbol} 
                            onClick={() => handleResultClick(result.symbol)}
                            className="px-4 py-2 hover:bg-accent cursor-pointer">
                            <span className="font-bold">{result.symbol}</span>
                            <span className="text-sm text-text-secondary ml-2">{result.companyName}</span>
                        </li>
                    ))}
                </ul>
            </div>
        )}
      </div>
      <div className="flex items-center space-x-4">
        <button className="p-2 rounded-full hover:bg-accent transition-colors">
          <Bell className="w-6 h-6 text-text-secondary" />
        </button>
        <div className="relative group">
          <button className="flex items-center space-x-2">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <UserIcon className="w-6 h-6 text-white"/>
            </div>
            <span className="hidden md:inline text-sm">{user?.email}</span>
          </button>
          <div className="absolute right-0 mt-2 w-48 bg-content-dark rounded-md shadow-lg py-1 hidden group-hover:block">
            <a href="#/settings" className="block px-4 py-2 text-sm text-text-primary hover:bg-accent">
              Settings
            </a>
            <button
              onClick={handleLogout}
              className="w-full text-left block px-4 py-2 text-sm text-danger hover:bg-accent"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
