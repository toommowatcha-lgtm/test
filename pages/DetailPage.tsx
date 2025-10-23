import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { BusinessOverview, WatchlistItem, RevenueBreakdownItem } from '../types';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Toast, { SaveStatus } from '../components/ui/Toast';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { debounce } from 'lodash';
import { formatErrorMessage } from '../utils/errorHandler';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF8A19'];

const createDefaultOverview = (stock_id: string): Omit<BusinessOverview, 'id' | 'updated_at'> => ({
    stock_id,
    what_do_they_do: '',
    customers: '',
    revenue_breakdown: [{ segment: "Segment 1", percent: 100 }],
    growth_engine: '',
    tipping_point: '',
    power_network_effect: "", power_switching_cost: "", power_branding: "",
    power_economics_of_scale: "", power_process_of_power: "",
    power_counter_position: "", power_corner_resource: "",
    think_tam: "", think_market_share: "", think_unit_economics: ""
});

const EditableTextarea = ({ label, value, onChange, placeholder, rows = 3 }: {
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder: string;
    rows?: number;
}) => (
    <div>
        <label className="font-semibold text-text-primary">{label}</label>
        <textarea
            value={value}
            onChange={onChange}
            rows={rows}
            className="w-full mt-1 bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary"
            placeholder={placeholder}
        />
    </div>
);

const DetailPage: React.FC = () => {
    const { stockId } = useParams<{ stockId: string }>();
    const [stock, setStock] = useState<WatchlistItem | null>(null);
    const [overview, setOverview] = useState<BusinessOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [error, setError] = useState<string | null>(null);

    const debouncedUpdate = useCallback(debounce(async (newOverview: BusinessOverview) => {
        if (!stockId) return;
        setSaveStatus('saving');
        try {
            const { error: upsertError } = await supabase
                .from('business_overview')
                .upsert({ ...newOverview, stock_id: stockId, updated_at: new Date().toISOString() }, { onConflict: 'stock_id' });
            
            if (upsertError) throw upsertError;
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (err) {
            setError(formatErrorMessage('Error auto-saving', err));
            setSaveStatus('error');
        }
    }, 1500), [stockId]);
    
    useEffect(() => {
        const fetchStockData = async () => {
            if (!stockId) return;
            setLoading(true);
            setError(null);
            try {
                const { data: stockData, error: stockError } = await supabase.from('watchlist').select('*').eq('id', stockId).single();
                if (stockError) throw stockError;
                setStock(stockData);

                const { data: overviewData, error: overviewError } = await supabase.from('business_overview').select('*').eq('stock_id', stockId).single();
                if (overviewError && overviewError.code !== 'PGRST116') throw overviewError; // Ignore "exact one row" error
                
                setOverview(overviewData || createDefaultOverview(stockId) as BusinessOverview);
            } catch (err) {
                setError(formatErrorMessage('Could not load stock data', err));
            } finally {
                setLoading(false);
            }
        };
        fetchStockData();
    }, [stockId]);
    
    const handleOverviewChange = (newOverview: BusinessOverview) => {
        setOverview(newOverview);
        debouncedUpdate(newOverview);
    };
    
    const updateField = <K extends keyof BusinessOverview>(field: K, value: BusinessOverview[K]) => {
        if (!overview) return;
        handleOverviewChange({ ...overview, [field]: value });
    };

    const handleRevenueChange = (index: number, field: keyof RevenueBreakdownItem, value: string | number) => {
        if (!overview) return;
        const updatedSegments = [...(overview.revenue_breakdown || [])];
        updatedSegments[index] = { ...updatedSegments[index], [field]: value };
        handleOverviewChange({ ...overview, revenue_breakdown: updatedSegments });
    };

    const addRevenueSegment = () => {
        if (!overview) return;
        const updatedList = [...(overview.revenue_breakdown || []), { segment: '', percent: '' }];
        handleOverviewChange({ ...overview, revenue_breakdown: updatedList });
    }
    const removeRevenueSegment = (index: number) => {
        if (!overview) return;
        const updatedList = (overview.revenue_breakdown || []).filter((_, i) => i !== index);
        handleOverviewChange({ ...overview, revenue_breakdown: updatedList });
    }

    if (loading) return <div className="p-8 text-center text-text-secondary">Loading analysis...</div>;
    if (error) return <div className="p-8 text-center text-danger bg-danger/10 rounded-lg">{error}</div>;
    if (!stock || !overview) return <div className="p-8 text-center text-text-secondary">Stock data not found.</div>;

    const chartData = (overview.revenue_breakdown || []).map(s => ({...s, percent: Number(s.percent) || 0})).filter(s => s.segment && s.percent > 0);

    return (
        <div className="container mx-auto p-4 md:p-8">
            <Link to="/" className="inline-flex items-center text-primary mb-6 hover:underline"><ArrowLeft className="w-4 h-4 mr-2" />Back to Watchlist</Link>
            <header className="mb-8"><h1 className="text-5xl font-bold">{stock.symbol}</h1><p className="text-xl text-text-secondary">{stock.company}</p></header>
            
            <div className="border-b border-accent mb-8">
                <nav className="-mb-px flex space-x-8">
                    <span className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-primary text-primary">Business Overview</span>
                    <Link to={`/stock/${stockId}/financials`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Financials</Link>
                    <Link to={`/stock/${stockId}/earning-call-story`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Earning Call Story</Link>
                    <Link to={`/stock/${stockId}/valuation`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Valuation</Link>
                </nav>
            </div>

            <div className="space-y-8">
                <Card><h2 className="text-2xl font-semibold mb-4 border-b border-accent pb-2">Business Description</h2><div className="space-y-4"><EditableTextarea label="What does this company do?" value={overview.what_do_they_do || ''} onChange={(e) => updateField('what_do_they_do', e.target.value)} placeholder="Describe the core business..." rows={4} /><EditableTextarea label="Who are their customers?" value={overview.customers || ''} onChange={(e) => updateField('customers', e.target.value)} placeholder="Describe the target customer base..." rows={3} /></div></Card>
                <Card><h2 className="text-2xl font-semibold mb-4 border-b border-accent pb-2">Revenue Breakdown</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-8"><div className="space-y-2">{(overview.revenue_breakdown || []).map((seg, index) => (<div key={index} className="flex items-center gap-2"><input type="text" placeholder="Segment Name" value={seg.segment} onChange={(e) => handleRevenueChange(index, 'segment', e.target.value)} className="w-full bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary"/><input type="number" placeholder="%" value={seg.percent} onChange={(e) => handleRevenueChange(index, 'percent', e.target.value)} className="w-24 bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary"/><Button variant="danger" onClick={() => removeRevenueSegment(index)} className="p-2"><Trash2 className="w-4 h-4"/></Button></div>))}<Button onClick={addRevenueSegment} variant="secondary"><Plus className="w-4 h-4 mr-2"/>Add Segment</Button></div><div style={{ width: '100%', height: 250 }}>{chartData.length > 0 ? (<ResponsiveContainer><PieChart><Pie data={chartData} dataKey="percent" nameKey="segment" cx="50%" cy="50%" outerRadius={80} fill="#8884d8" label={({ name, percent }) => `${name} ${percent}%`}>{chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => `${value}%`}/></PieChart></ResponsiveContainer>) : (<div className="flex items-center justify-center h-full text-text-secondary">Add revenue data to see chart</div>)}</div></div></Card>
                <Card><h2 className="text-2xl font-semibold mb-4 border-b border-accent pb-2">Moat (7 Powers)</h2><div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><EditableTextarea label="Network Effects" value={overview.power_network_effect || ''} onChange={(e) => updateField('power_network_effect', e.target.value)} placeholder="Value increases with users?" /><EditableTextarea label="Switching Costs" value={overview.power_switching_cost || ''} onChange={(e) => updateField('power_switching_cost', e.target.value)} placeholder="Hard for customers to leave?" /><EditableTextarea label="Branding" value={overview.power_branding || ''} onChange={(e) => updateField('power_branding', e.target.value)} placeholder="Commands pricing power?" /><EditableTextarea label="Economics of Scale" value={overview.power_economics_of_scale || ''} onChange={(e) => updateField('power_economics_of_scale', e.target.value)} placeholder="Significant cost advantage?" /><EditableTextarea label="Process Power" value={overview.power_process_of_power || ''} onChange={(e) => updateField('power_process_of_power', e.target.value)} placeholder="Unique, hard-to-copy process?" /><EditableTextarea label="Counter Position" value={overview.power_counter_position || ''} onChange={(e) => updateField('power_counter_position', e.target.value)} placeholder="Difficult business model to copy?" /><EditableTextarea label="Cornered Resource" value={overview.power_corner_resource || ''} onChange={(e) => updateField('power_corner_resource', e.target.value)} placeholder="Controls a unique asset?" /></div></Card>
                <Card><h2 className="text-2xl font-semibold mb-2">Growth Engine</h2><EditableTextarea label="" value={overview.growth_engine || ''} onChange={(e) => updateField('growth_engine', e.target.value)} rows={5} placeholder="Key drivers for future growth?" /></Card>
                <Card><h2 className="text-2xl font-semibold mb-4 border-b border-accent pb-2">Market Analysis</h2><div className="space-y-4"><EditableTextarea label="TAM (Total Addressable Market)" value={overview.think_tam || ''} onChange={(e) => updateField('think_tam', e.target.value)} placeholder="Size of the market?" /><EditableTextarea label="Market Share" value={overview.think_market_share || ''} onChange={(e) => updateField('think_market_share', e.target.value)} placeholder="Current and potential market share?" /><EditableTextarea label="Unit Economics" value={overview.think_unit_economics || ''} onChange={(e) => updateField('think_unit_economics', e.target.value)} placeholder="Favorable economics per unit sold?" /></div></Card>
                <Card><h2 className="text-2xl font-semibold mb-2">Tipping Point</h2><EditableTextarea label="" value={overview.tipping_point || ''} onChange={(e) => updateField('tipping_point', e.target.value)} rows={4} placeholder="What needs to happen for this to be a great investment?" /></Card>
            </div>
            <Toast status={saveStatus} message={error ?? undefined}/>
        </div>
    );
};

export default DetailPage;