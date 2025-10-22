
import React from 'react';
import Navbar from '../components/landing/Navbar';
import Hero from '../components/landing/Hero';
import Features from '../components/landing/Features';
import Pricing from '../components/landing/Pricing';
import Contact from '../components/landing/Contact';
import Footer from '../components/landing/Footer';

const LandingPage: React.FC = () => {
  return (
    <div className="bg-background text-text-primary scroll-smooth">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Pricing />
        <Contact />
      </main>
      <Footer />
    </div>
  );
};
export default LandingPage;
