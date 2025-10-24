import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { BusinessOverview, WatchlistItem, RevenueBreakdownItem, MoatPower } from '../types';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Toast, { SaveStatus } from '../components/ui/Toast';
import { ArrowLeft, Plus, Trash2, Info } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { debounce } from 'lodash';
import { formatErrorMessage } from '../utils/errorHandler';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF8A19'];

const POWER_DEFINITIONS = [
    { name: 'Network Effects', tooltip: 'The value of the product or service increases as more people use it.' },
    { name: 'Switching Costs', tooltip: 'It is costly or inconvenient for customers to switch to a competitor.' },
    { name: 'Branding', tooltip: 'A strong brand allows the company to charge a premium for its products.' },
    { name: 'Economics of Scale', tooltip: 'The cost per unit of production decreases as the volume of production increases.' },
    { name: 'Process Power', tooltip: 'A unique and hard-to-replicate process that creates a superior product or service.' },
    { name: 'Counter Position', tooltip: 'A business model that incumbents cannot easily copy without damaging their own business.' },
    { name: 'Cornered Resource', tooltip: 'Exclusive access to a valuable resource that competitors cannot obtain.' },
];

const createDefaultOverview = (stock_id: string): Omit<BusinessOverview, 'id' | 'updated_at'> => ({
    stock_id,
    what_do_they_do: '',
    customers: '',
    revenue_breakdown: [{ segment: "Segment 1", percent: 100 }],
    growth_engine: '',
    tipping_point: '',
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

type PowerLevel = 'Weak' | 'Normal' | 'High' | null;

const MoatPowerEditor = ({ label, level, note, onUpdate, tooltip }: {
    label: string;
    level: PowerLevel;
    note: string | null;
    onUpdate: (field: 'power_level' | 'power_note', value: string) => void;
    tooltip?: string;
}) => {
    const levels: Array<'Weak' | 'Normal' | 'High'> = ['Weak', 'Normal', 'High'];

    const getButtonClasses = (btnLevel: 'Weak' | 'Normal' | 'High') => {
        const base = 'px-4 py-1 rounded-md text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-content';
        if (level === btnLevel) {
            if (btnLevel === 'Weak') return `${base} bg-danger text-white focus:ring-danger`;
            if (btnLevel === 'Normal') return `${base} bg-primary text-white focus:ring-primary`;
            if (btnLevel === 'High') return `${base} bg-success text-white focus:ring-success`;
        }
        return `${base} bg-accent text-text-primary hover:bg-accent-hover focus:ring-accent`;
    };

    const handleLevelChange = (newLevel: 'Weak' | 'Normal' | 'High') => {
        const valueToSet = level === newLevel ? '' : newLevel;
        onUpdate('power_level', valueToSet);
    }

    return (
        <div className="py-4 border-b border-accent last:border-b-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center group relative mb-2 sm:mb-0">
                    <span className="font-semibold text-text-primary">{label}</span>
                    {tooltip && (
                        <>
                            <Info className="w-4 h-4 ml-2 text-text-secondary cursor-help" />
                            <div className="absolute bottom-full left-0 mb-2 w-64 p-2 bg-accent text-sm text-text-secondary rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                {tooltip}
                            </div>
                        </>
                    )}
                </div>
                <div className="flex items-center space-x-2">
                    {levels.map(btnLevel => (
                        <button
                            key={btnLevel}
                            onClick={() => handleLevelChange(btnLevel)}
                            className={getButtonClasses(btnLevel)}
                        >
                            {btnLevel}
                        </button>
                    ))}
                </div>
            </div>
            <div className="mt-3">
                <textarea
                    value={note || ''}
                    onChange={(e) => onUpdate('power_note', e.target.value)}
                    rows={2}
                    className="w-full bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary text-sm"
                    placeholder={`Notes on ${label}...`}
                />
            </div>
        </div>
    );
};


const DetailPage: React.FC = () => {
    const { stockId } = useParams<{ stockId: string }>();
    const [stock, setStock] = useState<WatchlistItem | null>(null);
    const [overview, setOverview] = useState<BusinessOverview | null>(null);
    const [moatPowers, setMoatPowers] = useState<MoatPower[]>([]);
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

    const debouncedPowerSave = useCallback(debounce(async (powerToSave: MoatPower) => {
        if (!stockId) return;
        setSaveStatus('saving');
        try {
            const { error: upsertError } = await supabase
                .from('moat_powers')
                .upsert(powerToSave, { onConflict: 'company_id,power_name' });
            
            if (upsertError) throw upsertError;
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (err) {
            setError(formatErrorMessage('Error auto-saving moat power', err));
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
                if (stockError && stockError.code !== 'PGRST116') throw stockError;
                if (!stockData) { setStock(null); return; }
                setStock(stockData);

                const { data: overviewData, error: overviewError } = await supabase.from('business_overview').select('*').eq('stock_id', stockId).single();
                if (overviewError && overviewError.code !== 'PGRST116') throw overviewError;
                setOverview(overviewData || createDefaultOverview(stockId) as BusinessOverview);

                const { data: powersData, error: powersError } = await supabase.from('moat_powers').select('*').eq('company_id', stockId);
                if (powersError) throw powersError;

                const initialPowers = POWER_DEFINITIONS.map(def => {
                    const existingPower = powersData?.find(p => p.power_name === def.name);
                    return {
                        company_id: stockId,
                        power_name: def.name,
                        power_level: existingPower?.power_level || null,
                        power_note: existingPower?.power_note || ''
                    };
                });
                setMoatPowers(initialPowers);

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

    const handlePowerUpdate = (powerName: string, field: 'power_level' | 'power_note', value: string) => {
        let updatedPower: MoatPower | undefined;
        const newPowers = moatPowers.map(p => {
            if (p.power_name === powerName) {
                // Use null for empty string on power_level to clear selection
                const finalValue = field === 'power_level' && value === '' ? null : value;
                updatedPower = { ...p, [field]: finalValue };
                return updatedPower;
            }
            return p;
        });
        setMoatPowers(newPowers);
        if (updatedPower) {
            debouncedPowerSave(updatedPower);
        }
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
            
            <div className="border-b border-accent mb-8">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <Link to={`/stock/${stockId}`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-primary text-primary">Business Overview</Link>
                    <Link to={`/stock/${stockId}/financials`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Financials</Link>
                    <Link to={`/stock/${stockId}/earning-call-story`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Earning Call Story</Link>
                    <Link to={`/stock/${stockId}/valuation`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Valuation</Link>
                </nav>
            </div>

            <header className="mb-8"><h1 className="text-5xl font-bold">{stock.symbol}</h1><p className="text-xl text-text-secondary">{stock.company}</p></header>
            
            <div className="space-y-8">
                <Card><h2 className="text-2xl font-semibold mb-4 border-b border-accent pb-2">Business Description</h2><div className="space-y-4"><EditableTextarea label="What does this company do?" value={overview.what_do_they_do || ''} onChange={(e) => updateField('what_do_they_do', e.target.value)} placeholder="Describe the core business..." rows={4} /><EditableTextarea label="Who are their customers?" value={overview.customers || ''} onChange={(e) => updateField('customers', e.target.value)} placeholder="Describe the target customer base..." rows={3} /></div></Card>
                <Card><h2 className="text-2xl font-semibold mb-4 border-b border-accent pb-2">Revenue Breakdown</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-8"><div className="space-y-2">{(overview.revenue_breakdown || []).map((seg, index) => (<div key={index} className="flex items-center gap-2"><input type="text" placeholder="Segment Name" value={seg.segment} onChange={(e) => handleRevenueChange(index, 'segment', e.target.value)} className="w-full bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary"/><input type="number" placeholder="%" value={seg.percent} onChange={(e) => handleRevenueChange(index, 'percent', e.target.value)} className="w-24 bg-accent p-2 rounded border border-gray-600 focus:ring-primary focus:border-primary"/><Button variant="danger" onClick={() => removeRevenueSegment(index)} className="p-2"><Trash2 className="w-4 h-4"/></Button></div>))}<Button onClick={addRevenueSegment} variant="secondary"><Plus className="w-4 h-4 mr-2"/>Add Segment</Button></div><div style={{ width: '100%', height: 250 }}>{chartData.length > 0 ? (<ResponsiveContainer><PieChart><Pie data={chartData} dataKey="percent" nameKey="segment" cx="50%" cy="50%" outerRadius={80} fill="#8884d8" label={({ name, percent }) => `${name} ${percent}%`}>{chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => `${value}%`}/></PieChart></ResponsiveContainer>) : (<div className="flex items-center justify-center h-full text-text-secondary">Add revenue data to see chart</div>)}</div></div></Card>
                <Card>
                    <h2 className="text-2xl font-semibold mb-4 border-b border-accent pb-2">Moat (7 Powers)</h2>
                    <div>
                        {moatPowers.map(power => (
                             <MoatPowerEditor
                                key={power.power_name}
                                label={power.power_name}
                                tooltip={POWER_DEFINITIONS.find(p => p.name === power.power_name)?.tooltip}
                                level={power.power_level}
                                note={power.power_note}
                                onUpdate={(field, value) => handlePowerUpdate(power.power_name, field, value)}
                            />
                        ))}
                    </div>
                </Card>
                <Card><h2 className="text-2xl font-semibold mb-2">Growth Engine</h2><EditableTextarea label="" value={overview.growth_engine || ''} onChange={(e) => updateField('growth_engine', e.target.value)} rows={5} placeholder="Key drivers for future growth?" /></Card>
                <Card><h2 className="text-2xl font-semibold mb-4 border-b border-accent pb-2">Market Analysis</h2><div className="space-y-4"><EditableTextarea label="TAM (Total Addressable Market)" value={overview.think_tam || ''} onChange={(e) => updateField('think_tam', e.target.value)} placeholder="Size of the market?" /><EditableTextarea label="Market Share" value={overview.think_market_share || ''} onChange={(e) => updateField('think_market_share', e.target.value)} placeholder="Current and potential market share?" /><EditableTextarea label="Unit Economics" value={overview.think_unit_economics || ''} onChange={(e) => updateField('think_unit_economics', e.target.value)} placeholder="Favorable economics per unit sold?" /></div></Card>
                <Card><h2 className="text-2xl font-semibold mb-2">Tipping Point</h2><EditableTextarea label="" value={overview.tipping_point || ''} onChange={(e) => updateField('tipping_point', e.target.value)} rows={4} placeholder="What needs to happen for this to be a great investment?" /></Card>
            </div>
            <Toast status={saveStatus} message={error ?? undefined}/>
        </div>
    );
};

export default DetailPage;