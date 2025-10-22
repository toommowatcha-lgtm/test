
import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';

const Hero: React.FC = () => {
  return (
    <section id="hero" className="py-20 md:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
          Clarity in a Complex Market.
        </h1>
        <p className="mt-4 max-w-2xl mx-auto text-lg md:text-xl text-text-secondary">
          EquiLens provides institutional-grade tools in a simple, intuitive interface, helping you make smarter investment decisions.
        </p>
        <div className="mt-8">
          <Link to="/signup">
            <Button variant="primary" className="px-8 py-3 text-lg">
              Get Started for Free
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Hero;
