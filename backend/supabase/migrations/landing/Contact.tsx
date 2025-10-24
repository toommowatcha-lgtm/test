
import React, { useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { supabase } from '../../services/supabaseClient';

const Contact: React.FC = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState<{type: 'success' | 'error', text: string} | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setFeedback(null);

        const { error } = await supabase
            .from('contacts')
            .insert({ name, email, message });
        
        if (error) {
            setFeedback({ type: 'error', text: 'Something went wrong. Please try again.' });
            console.error('Contact form error:', error);
        } else {
            setFeedback({ type: 'success', text: 'Thank you! Your message has been sent.' });
            setName('');
            setEmail('');
            setMessage('');
        }
        setLoading(false);
    };

    return (
        <section id="contact" className="py-20 bg-content">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                    <h2 className="text-3xl md:text-4xl font-bold">Get in Touch</h2>
                    <p className="mt-4 max-w-2xl mx-auto text-text-secondary">
                        Have questions or feedback? We'd love to hear from you.
                    </p>
                </div>
                <Card className="max-w-2xl mx-auto bg-accent">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-text-secondary">Full Name</label>
                            <input
                                type="text"
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full mt-1 bg-content px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-text-secondary">Email</label>
                            <input
                                type="email"
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full mt-1 bg-content px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="message" className="block text-sm font-medium text-text-secondary">Message</label>
                            <textarea
                                id="message"
                                rows={4}
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="w-full mt-1 bg-content px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary"
                                required
                            ></textarea>
                        </div>
                        <Button type="submit" className="w-full py-3" disabled={loading}>
                            {loading ? 'Sending...' : 'Send Message'}
                        </Button>
                        {feedback && (
                            <div className={`mt-4 text-center p-3 rounded-md text-sm ${
                                feedback.type === 'success' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                            }`}>
                                {feedback.text}
                            </div>
                        )}
                    </form>
                </Card>
            </div>
        </section>
    );
};

export default Contact;
