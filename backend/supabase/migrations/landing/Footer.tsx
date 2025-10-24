
import React from 'react';
import { Twitter, Linkedin, Github } from 'lucide-react';

const Footer: React.FC = () => {
    return (
        <footer className="bg-background">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="flex flex-col md:flex-row justify-between items-center space-y-6 md:space-y-0">
                    <p className="text-sm text-text-secondary">&copy; {new Date().getFullYear()} EquiLens. All rights reserved.</p>
                    <div className="flex space-x-6">
                        <a href="#" className="text-text-secondary hover:text-primary transition-colors"><Twitter /></a>
                        <a href="#" className="text-text-secondary hover:text-primary transition-colors"><Github /></a>
                        <a href="#" className="text-text-secondary hover:text-primary transition-colors"><Linkedin /></a>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
