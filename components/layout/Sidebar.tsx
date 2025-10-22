
import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Briefcase, BarChart2, Star, Calendar, Settings } from 'lucide-react';

const iconMap = {
  Dashboard: Home,
  Portfolio: Briefcase,
  Compare: BarChart2,
  Watchlist: Star, // Placeholder, not implemented in this scaffold
  Dividends: Calendar,
  Settings: Settings,
};

const navItems = [
  { name: 'Dashboard', path: '/' },
  { name: 'Portfolio', path: '/portfolio' },
  { name: 'Compare', path: '/compare' },
  { name: 'Dividends', path: '/dividends' },
  { name: 'Settings', path: '/settings' },
];

const Sidebar: React.FC = () => {
  return (
    <aside className="w-16 md:w-64 bg-content flex flex-col">
      <div className="h-20 flex items-center justify-center md:justify-start md:px-6">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <BarChart2 className="text-white w-5 h-5" />
        </div>
        <span className="hidden md:inline text-xl font-bold ml-3">EquiLens</span>
      </div>
      <nav className="flex-1 px-2 md:px-4 py-4 space-y-2">
        {navItems.map((item) => {
          const Icon = iconMap[item.name as keyof typeof iconMap] || Home;
          return (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center p-3 rounded-lg transition-colors duration-200 ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:bg-accent hover:text-text-primary'
                }`
              }
            >
              <Icon className="w-6 h-6" />
              <span className="hidden md:inline ml-4 font-medium">{item.name}</span>
            </NavLink>
          );
        })}
      </nav>
      {/* Optional: User Profile section at the bottom */}
    </aside>
  );
};

export default Sidebar;
