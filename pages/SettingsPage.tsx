
import React from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

const SettingsPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold">Settings</h1>
      
      <Card>
        <h2 className="text-xl font-semibold mb-4 border-b border-accent pb-2">Preferences</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="currency" className="block text-sm font-medium text-text-secondary">Default Currency</label>
            <select id="currency" name="currency" className="mt-1 block w-full pl-3 pr-10 py-2 text-base bg-accent border-gray-600 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm rounded-md">
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
            </select>
          </div>
          <div>
            <label htmlFor="locale" className="block text-sm font-medium text-text-secondary">Locale</label>
            <select id="locale" name="locale" className="mt-1 block w-full pl-3 pr-10 py-2 text-base bg-accent border-gray-600 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm rounded-md">
              <option>en-US</option>
              <option>en-GB</option>
              <option>de-DE</option>
            </select>
          </div>
        </div>
      </Card>
      
      <Card>
        <h2 className="text-xl font-semibold mb-4 border-b border-accent pb-2">Subscription</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <div className="border-2 border-primary rounded-lg p-6 text-center">
                <h3 className="text-lg font-semibold">Free Plan</h3>
                <p className="text-4xl font-bold my-4">$0<span className="text-base font-normal text-text-secondary">/month</span></p>
                <ul className="space-y-2 text-text-secondary">
                    <li>Basic Portfolio Tracking</li>
                    <li>Limited Watchlists</li>
                    <li>Standard Data Updates</li>
                </ul>
                <Button variant="secondary" className="mt-6 w-full" disabled>Your Current Plan</Button>
            </div>
            <div className="border border-accent rounded-lg p-6 text-center">
                <h3 className="text-lg font-semibold">Pro Plan</h3>
                <p className="text-4xl font-bold my-4">$9.99<span className="text-base font-normal text-text-secondary">/month</span></p>
                <ul className="space-y-2 text-text-secondary">
                    <li>Advanced Analytics</li>
                    <li>Unlimited Watchlists</li>
                    <li>Real-time Data</li>
                    <li>Dividend Notifications</li>
                </ul>
                <Button variant="primary" className="mt-6 w-full">Upgrade to Pro</Button>
            </div>
        </div>
      </Card>
    </div>
  );
};

export default SettingsPage;
