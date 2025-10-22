
import React from 'react';
import { Briefcase, BarChart2, DollarSign, Eye, Zap, ShieldCheck } from 'lucide-react';
import Card from '../ui/Card';

const featureList = [
  {
    icon: Briefcase,
    title: 'All-in-One Portfolio',
    description: 'Connect all your brokerage accounts to see your entire portfolio in one place.'
  },
  {
    icon: BarChart2,
    title: 'Deep Fundamental Analysis',
    description: 'Access decades of financial statements and key metrics, beautifully visualized.'
  },
  {
    icon: DollarSign,
    title: 'Dividend Tracking',
    description: 'Never miss a payout with our comprehensive dividend calendar and income tracker.'
  },
  {
    icon: Eye,
    title: 'Advanced Stock Screener',
    description: 'Find your next investment with powerful filters based on hundreds of metrics.'
  },
  {
    icon: Zap,
    title: 'Real-Time Data',
    description: 'Stay ahead of the market with lightning-fast, real-time stock quotes and news.'
  },
  {
    icon: ShieldCheck,
    title: 'Bank-Level Security',
    description: 'Your data is encrypted and secure, so you can analyze with peace of mind.'
  },
];

const Features: React.FC = () => {
  return (
    <section id="features" className="py-20 bg-content">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">Everything You Need to Invest with Confidence</h2>
          <p className="mt-4 max-w-2xl mx-auto text-text-secondary">
            Powerful tools that are easy to use. No compromises.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featureList.map((feature, index) => (
            <Card key={index} className="text-center bg-accent p-8">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-primary mb-4">
                <feature.icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold">{feature.title}</h3>
              <p className="mt-2 text-text-secondary">{feature.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
