import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { WatchlistItem, EarningCallStory } from '../types';
import { debounce } from 'lodash';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Toast, { SaveStatus } from '../components/ui/Toast';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { formatErrorMessage } from '../utils/errorHandler';

const EarningCallStoryPage: React.FC = () => {
    const { stockId = '' } = useParams<{ stockId: string }>();
    const [stock, setStock] = useState<WatchlistItem | null>(null);
    const [stories, setStories] = useState<EarningCallStory[]>([]);
    const [financialPeriods, setFinancialPeriods] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [error, setError] = useState<string | null>(null);

    const debouncedSave = useCallback(debounce(async (story: EarningCallStory) => {
        if (!stockId) return;
        setSaveStatus('saving');
        try {
            const { id, created_at, ...upsertData } = story;
            const { error: upsertError } = await supabase
                .from('earning_call_story')
                .upsert({ ...upsertData, stock_id: stockId });
            
            if (upsertError) throw upsertError;
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (err) {
            setError(formatErrorMessage('Error auto-saving note', err));
            setSaveStatus('error');
        }
    }, 1500), [stockId]);

    const fetchData = useCallback(async () => {
        if (!stockId) return;
        setLoading(true);
        setError(null);
        try {
            const { data: stockData, error: stockError } = await supabase.from('watchlist').select('*').eq('id', stockId).single();
            if (stockError) throw stockError;
            setStock(stockData);

            const { data: storiesData, error: storiesError } = await supabase.from('earning_call_story').select('*').eq('stock_id', stockId).order('created_at', { ascending: false });
            if (storiesError) throw storiesError;
            setStories(storiesData || []);

            const { data: periodsData, error: periodsError } = await supabase.from('financial_period').select('period_label, display_order').eq('stock_id', stockId).order('display_order', { ascending: false });
            if (periodsError) throw periodsError;
            
            setFinancialPeriods((periodsData || []).map(p => p.period_label));

        } catch (err) {
            setError(formatErrorMessage('Could not load data', err));
        } finally {
            setLoading(false);
        }
    }, [stockId]);

    useEffect(() => {
        fetchData();
    }, [stockId, fetchData]);

    const handleStoryChange = (id: number, field: keyof EarningCallStory, value: string) => {
        const newStories = stories.map(s => {
            if (s.id === id) {
                const updatedStory = { ...s, [field]: value };
                debouncedSave(updatedStory);
                return updatedStory;
            }
            return s;
        });
        setStories(newStories);
    };

    const addNote = async () => {
        if (!stockId) return;
        const newNote: Omit<EarningCallStory, 'id' | 'created_at'> = {
            stock_id: stockId,
            period_label: financialPeriods[0] || 'Q1 2025',
            headline: 'New Note',
            text: ''
        };

        setSaveStatus('saving');
        const { data, error: insertError } = await supabase
            .from('earning_call_story')
            .insert(newNote)
            .select()
            .single();

        if (insertError) {
            setError(formatErrorMessage('Failed to add note', insertError));
            setSaveStatus('error');
        } else if(data) {
            setStories([data, ...stories]);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 1000);
        }
    };
    
    const deleteNote = async (id: number) => {
        if (!confirm('Are you sure you want to delete this note?')) return;

        setSaveStatus('saving');
        const { error: deleteError } = await supabase
            .from('earning_call_story')
            .delete()
            .match({ id });

        if (deleteError) {
            setError(formatErrorMessage('Failed to delete note', deleteError));
            setSaveStatus('error');
        } else {
            setStories(stories.filter(s => s.id !== id));
            setSaveStatus('saved');
             setTimeout(() => setSaveStatus('idle'), 1000);
        }
    };


    if (loading) return <div className="p-8 text-center text-text-secondary">Loading Earning Call Story...</div>;
    if (error && !stock) return <div className="p-8 text-center text-danger bg-danger/10 rounded-lg">{error}</div>;

    return (
        <div className="container mx-auto p-4 md:p-8">
            <Link to="/" className="inline-flex items-center text-primary mb-6 hover:underline"><ArrowLeft className="w-4 h-4 mr-2" />Back to Watchlist</Link>
            
            <div className="border-b border-accent mb-8">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <Link to={`/stock/${stockId}`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Business Overview</Link>
                    <Link to={`/stock/${stockId}/financials`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Financials</Link>
                    <Link to={`/stock/${stockId}/earning-call-story`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-primary text-primary">Earning Call Story</Link>
                    <Link to={`/stock/${stockId}/valuation`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Valuation</Link>
                </nav>
            </div>

            <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-5xl font-bold">{stock?.symbol} - Earning Call Story</h1>
                    <p className="text-xl text-text-secondary">{stock?.company}</p>
                </div>
                <Button onClick={addNote}>
                    <Plus className="w-4 h-4 mr-2" /> Add Note
                </Button>
            </header>
            
             <div className="space-y-6">
                {stories.length > 0 ? (
                    stories.map(story => (
                        <Card key={story.id}>
                             <div className="flex justify-between items-start gap-4 mb-4">
                                <input
                                    type="text"
                                    value={story.headline}
                                    onChange={(e) => handleStoryChange(story.id, 'headline', e.target.value)}
                                    className="w-full bg-transparent text-2xl font-semibold p-1 -m-1 rounded focus:outline-none focus:bg-accent"
                                    placeholder="Enter headline..."
                                />
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <select
                                        value={story.period_label}
                                        onChange={(e) => handleStoryChange(story.id, 'period_label', e.target.value)}
                                        className="bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary text-sm"
                                    >
                                        {financialPeriods.map(p => <option key={p} value={p}>{p}</option>)}
                                        {!financialPeriods.includes(story.period_label) && <option key={story.period_label} value={story.period_label}>{story.period_label}</option> }
                                    </select>
                                    <Button variant="danger" onClick={() => deleteNote(story.id)} className="p-2 h-10 w-10">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                            <textarea
                                value={story.text}
                                onChange={(e) => handleStoryChange(story.id, 'text', e.target.value)}
                                rows={6}
                                className="w-full bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary"
                                placeholder="Type your notes here..."
                            />
                        </Card>
                    ))
                ) : (
                     <div className="text-center py-16">
                        <h2 className="text-xl font-semibold">No earning call stories yet.</h2>
                        <p className="text-text-secondary mt-2">Click "+ Add Note" to create your first one.</p>
                    </div>
                )}
            </div>
            <Toast status={saveStatus} message={error ?? undefined}/>
        </div>
    );
};

export default EarningCallStoryPage;
