
import React from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { Check } from 'lucide-react';

const Pricing: React.FC = () => {
  return (
    <section id="pricing" className="py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">Choose Your Plan</h2>
          <p className="mt-4 max-w-2xl mx-auto text-text-secondary">
            Start for free, and upgrade when you're ready for more power.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <Card className="flex flex-col">
            <div className="p-8">
              <h3 className="text-2xl font-semibold">Basic</h3>
              <p className="mt-2 text-text-secondary">For the casual investor getting started.</p>
              <p className="mt-6 text-5xl font-extrabold">$0<span className="text-lg font-medium text-text-secondary">/month</span></p>
              <ul className="mt-6 space-y-4">
                <li className="flex items-center"><Check className="text-success w-5 h-5 mr-2" /> 1 Connected Account</li>
                <li className="flex items-center"><Check className="text-success w-5 h-5 mr-2" /> Basic Portfolio Tracking</li>
                <li className="flex items-center"><Check className="text-success w-5 h-5 mr-2" /> Standard Data</li>
              </ul>
            </div>
            <div className="mt-auto p-8">
                <Button variant="secondary" className="w-full text-lg py-3">Get Started</Button>
            </div>
          </Card>
           <Card className="flex flex-col border-2 border-primary">
            <div className="p-8">
              <div className="flex justify-between">
                <h3 className="text-2xl font-semibold">Pro</h3>
                <span className="bg-primary/20 text-primary text-xs font-semibold px-2.5 py-0.5 rounded-full">POPULAR</span>
              </div>
              <p className="mt-2 text-text-secondary">For the serious investor who needs an edge.</p>
              <p className="mt-6 text-5xl font-extrabold">$9<span className="text-lg font-medium text-text-secondary">.99/month</span></p>
              <ul className="mt-6 space-y-4">
                <li className="flex items-center"><Check className="text-primary w-5 h-5 mr-2" /> Unlimited Accounts</li>
                <li className="flex items-center"><Check className="text-primary w-5 h-5 mr-2" /> Advanced Analytics & Charts</li>
                <li className="flex items-center"><Check className="text-primary w-5 h-5 mr-2" /> Real-Time Market Data</li>
                <li className="flex items-center"><Check className="text-primary w-5 h-5 mr-2" /> Dividend Notifications</li>
              </ul>
            </div>
            <div className="mt-auto p-8">
                <Button variant="primary" className="w-full text-lg py-3">Start 14-Day Free Trial</Button>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default Pricing;
