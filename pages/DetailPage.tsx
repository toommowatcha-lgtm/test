import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { StockDetails, WatchlistItem, RevenueSegment, MoatPower } from '../types';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Toast, { SaveStatus } from '../components/ui/Toast';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { debounce } from 'lodash';

// Helper to ensure revenue segments have numbers for the chart
const processRevenueForChart = (segments: RevenueSegment[] = []) => {
    return segments.map(s => ({
        ...s,
        percent: Number(s.percent) || 0,
    })).filter(s => s.segment && s.percent > 0);
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF8A19'];

const DetailPage: React.FC = () => {
    const { stockId } = useParams<{ stockId: string }>();
    const [stock, setStock] = useState<WatchlistItem | null>(null);
    const [details, setDetails] = useState<StockDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [error, setError] = useState<string | null>(null);

    // Debounced upsert function for auto-saving.
    const debouncedUpdate = useCallback(
        debounce(async (newDetails: StockDetails) => {
            if (!newDetails?.id) return;
            setSaveStatus('saving');
            
            const { error: upsertError } = await supabase
                .from('stock_details')
                .upsert(newDetails);

            if (upsertError) {
                console.error('Error auto-saving:', upsertError);
                setError(`Save failed: ${upsertError.message}`);
                setSaveStatus('error');
                setTimeout(() => setSaveStatus('idle'), 4000);
            } else {
                setSaveStatus('saved');
                setError(null);
                setTimeout(() => setSaveStatus('idle'), 2000);
            }
        }, 1500),
        []
    );

    useEffect(() => {
        const fetchStockData = async () => {
            if (!stockId) return;
            setLoading(true);
            setError(null);

            const { data: stockData, error: stockError } = await supabase
                .from('watchlist')
                .select('*')
                .eq('id', stockId)
                .single();
            
            if (stockError) {
                console.error('Error fetching stock:', stockError.message);
                setError(`Could not load stock data: ${stockError.message}`);
            } else {
                setStock(stockData);
                const { data: detailsData, error: detailsError } = await supabase
                    .from('stock_details')
                    .select('*')
                    .eq('stock_id', stockId)
                    .single();

                if (detailsError) {
                    console.error('Error fetching details:', detailsError.message);
                    setError(`Could not load stock analysis details: ${detailsError.message}`);
                } else {
                    setDetails(detailsData);
                }
            }
            setLoading(false);
        };

        fetchStockData();
    }, [stockId]);
    
    const handleDetailChange = (newDetails: StockDetails) => {
        setDetails(newDetails);
        setSaveStatus('saving');
        setError(null);
        debouncedUpdate(newDetails);
    };
    
    const updateField = <K extends keyof StockDetails>(field: K, value: StockDetails[K]) => {
        if (!details) return;
        handleDetailChange({ ...details, [field]: value });
    };

    const updateDynamicList = (field: 'revenue_segments' | 'moat', updatedList: any[]) => {
        if (!details) return;
        handleDetailChange({ ...details, [field]: updatedList });
    }

    const handleRevenueChange = (index: number, field: keyof RevenueSegment, value: string | number) => {
        const updatedSegments = [...(details?.revenue_segments || [])];
        updatedSegments[index] = { ...updatedSegments[index], [field]: value };
        updateDynamicList('revenue_segments', updatedSegments);
    };

    const addRevenueSegment = () => {
        const newSegments = [...(details?.revenue_segments || []), { segment: '', percent: '' }];
        updateDynamicList('revenue_segments', newSegments);
    };
    
    const removeRevenueSegment = (index: number) => {
        const updatedSegments = (details?.revenue_segments || []).filter((_, i) => i !== index);
        updateDynamicList('revenue_segments', updatedSegments);
    };

    const handleMoatChange = (index: number, field: keyof MoatPower, value: string) => {
        const updatedMoats = [...(details?.moat || [])];
        updatedMoats[index] = { ...updatedMoats[index], [field]: value };
        updateDynamicList('moat', updatedMoats);
    };

    if (loading) return <div className="p-8 text-center text-text-secondary">Loading analysis...</div>;
    if (error && !details) return <div className="p-8 text-center text-danger">{error || 'Stock details not found.'}</div>;
    if (!stock || !details) return <div className="p-8 text-center text-text-secondary">Stock details not found.</div>;

    const chartData = processRevenueForChart(details.revenue_segments);

    return (
        <div className="container mx-auto p-4 md:p-8">
            <Link to="/" className="inline-flex items-center text-primary mb-6 hover:underline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Watchlist
            </Link>
            
            <header className="mb-8">
                <h1 className="text-5xl font-bold">{stock.symbol}</h1>
                <p className="text-xl text-text-secondary">{stock.company_name}</p>
            </header>
            
            <div className="border-b border-accent mb-8">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <span className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-primary text-primary">
                        Analysis
                    </span>
                    <Link 
                        to={`/stock/${stockId}/financials`}
                        className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300"
                    >
                        Financials
                    </Link>
                </nav>
            </div>


            <div className="space-y-8">
                <Card>
                    <h2 className="text-2xl font-semibold mb-4 border-b border-accent pb-2">Business Overview</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="font-semibold text-text-primary">What does this company do?</label>
                            <textarea
                                value={details.what_do || ''}
                                onChange={(e) => updateField('what_do', e.target.value)}
                                rows={4}
                                className="w-full mt-1 bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary"
                                placeholder="Describe the core business, products, and services..."
                            />
                        </div>
                        <div>
                            <label className="font-semibold text-text-primary">Who are their customers?</label>
                            <textarea
                                value={details.customers || ''}
                                onChange={(e) => updateField('customers', e.target.value)}
                                rows={3}
                                className="w-full mt-1 bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary"
                                placeholder="Describe the target customer base (e.g., consumers, enterprises)..."
                            />
                        </div>
                    </div>
                </Card>
                
                <Card>
                    <h2 className="text-2xl font-semibold mb-4 border-b border-accent pb-2">Revenue Breakdown</h2>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            {details.revenue_segments?.map((seg, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        placeholder="Segment Name"
                                        value={seg.segment}
                                        onChange={(e) => handleRevenueChange(index, 'segment', e.target.value)}
                                        className="w-full bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary"
                                    />
                                    <input
                                        type="number"
                                        placeholder="%"
                                        value={seg.percent}
                                        onChange={(e) => handleRevenueChange(index, 'percent', e.target.value)}
                                        className="w-24 bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary"
                                    />
                                    <Button variant="danger" onClick={() => removeRevenueSegment(index)} className="p-2"><Trash2 className="w-4 h-4"/></Button>
                                </div>
                            ))}
                             <Button onClick={addRevenueSegment} variant="secondary"><Plus className="w-4 h-4 mr-2"/>Add Segment</Button>
                        </div>
                        <div style={{ width: '100%', height: 250 }}>
                            {chartData.length > 0 ? (
                                <ResponsiveContainer>
                                    <PieChart>
                                        <Pie data={chartData} dataKey="percent" nameKey="segment" cx="50%" cy="50%" outerRadius={80} fill="#8884d8" label={({ name, percent }) => `${name} ${percent}%`}>
                                            {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip formatter={(value) => `${value}%`}/>
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-full text-text-secondary">Add revenue data to see chart</div>
                            )}
                        </div>
                    </div>
                </Card>

                <Card>
                    <h2 className="text-2xl font-semibold mb-4 border-b border-accent pb-2">Moat (7 Powers)</h2>
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {details.moat?.map((power, index) => (
                            <div key={power.power_name}>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="font-semibold">{power.power_name}</label>
                                    <select
                                        value={power.level || ''}
                                        onChange={(e) => handleMoatChange(index, 'level', e.target.value)}
                                        className="bg-accent p-1 rounded border border-gray-600 text-sm"
                                    >
                                        <option value="">N/A</option>
                                        <option value="Weak">Weak</option>
                                        <option value="Normal">Normal</option>
                                        <option value="High">High</option>
                                    </select>
                                </div>
                                <textarea
                                    value={power.description}
                                    onChange={(e) => handleMoatChange(index, 'description', e.target.value)}
                                    rows={3}
                                    className="w-full bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary"
                                    placeholder="Describe why this power is weak, normal, or high..."
                                />
                            </div>
                        ))}
                    </div>
                </Card>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <Card>
                         <h3 className="text-xl font-semibold mb-2">Growth Engine</h3>
                         <textarea
                             value={details.growth_engine || ''}
                             onChange={(e) => updateField('growth_engine', e.target.value)}
                             rows={8}
                             className="w-full bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary"
                             placeholder="What are the key drivers for future growth?"
                         />
                     </Card>
                     <Card className="space-y-4">
                         <h3 className="text-xl font-semibold">Market Analysis</h3>
                         <div>
                             <label className="font-semibold text-sm">Total Addressable Market (TAM)</label>
                             <input type="text" value={details.tam || ''} onChange={(e) => updateField('tam', e.target.value)} className="w-full mt-1 bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary"/>
                         </div>
                         <div>
                             <label className="font-semibold text-sm">Market Share</label>
                             <input type="text" value={details.market_share || ''} onChange={(e) => updateField('market_share', e.target.value)} className="w-full mt-1 bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary"/>
                         </div>
                         <div>
                             <label className="font-semibold text-sm">Unit Economics</label>
                             <input type="text" value={details.unit_economics || ''} onChange={(e) => updateField('unit_economics', e.target.value)} className="w-full mt-1 bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary"/>
                         </div>
                     </Card>
                 </div>

                 <Card>
                     <h2 className="text-2xl font-semibold mb-2">Tipping Point Bar</h2>
                     <textarea
                         value={details.tipping_point || ''}
                         onChange={(e) => updateField('tipping_point', e.target.value)}
                         rows={4}
                         className="w-full bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary"
                         placeholder="What needs to go right for this investment to be a home run?"
                     />
                 </Card>
            </div>
            <Toast status={saveStatus} message={error ?? undefined}/>
        </div>
    );
};

export default DetailPage;