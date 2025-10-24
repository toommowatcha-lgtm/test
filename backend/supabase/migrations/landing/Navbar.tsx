
import React from 'react';
import { Link } from 'react-router-dom';
import { BarChart2 } from 'lucide-react';
import Button from '../ui/Button';

const Navbar: React.FC = () => {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <BarChart2 className="text-white w-5 h-5" />
            </div>
            <span className="text-xl font-bold">EquiLens</span>
          </Link>
          <nav className="hidden md:flex items-center space-x-8">
            <button onClick={() => scrollTo('features')} className="text-text-secondary hover:text-primary transition-colors">Features</button>
            <button onClick={() => scrollTo('pricing')} className="text-text-secondary hover:text-primary transition-colors">Pricing</button>
            <button onClick={() => scrollTo('contact')} className="text-text-secondary hover:text-primary transition-colors">Contact</button>
          </nav>
          <div className="flex items-center space-x-2">
            <Link to="/login">
              <Button variant="secondary">Login</Button>
            </Link>
            <Link to="/signup">
              <Button variant="primary">Sign Up</Button>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
