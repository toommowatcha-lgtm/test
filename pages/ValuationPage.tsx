import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { WatchlistItem, Valuation } from '../types';
import { debounce } from 'lodash';
import Card from '../components/ui/Card';
import Toast, { SaveStatus } from '../components/ui/Toast';
import { ArrowLeft } from 'lucide-react';
import { formatErrorMessage } from '../utils/errorHandler';

const defaultValuation: Omit<Valuation, 'id' | 'stock_id' | 'created_at' | 'updated_at'> = {
    current_price: 0,
    investment_horizon_years: 5,
    current_sales_mm: 0,
    sales_growth_cagr_percent: 0,
    net_profit_margin_percent: 0,
    shares_outstanding_mm: 0,
    pe_at_year_end: 0,
    share_change_percent: 0,
    expected_return_percent: 15,
    margin_of_safety_percent: 30,
    tam_mm: 0,
    sam_mm: 0,
};

const EditableField = ({ label, value, unit, name, onChange }: {
    label: string;
    value: number;
    unit: string;
    name: keyof Valuation;
    onChange: (name: keyof Valuation, value: number) => void;
}) => (
    <div className="flex justify-between items-center py-2 border-b border-accent">
        <label htmlFor={name} className="text-text-secondary">{label}</label>
        <div className="flex items-center">
            <input
                type="number"
                id={name}
                name={name}
                value={value}
                onChange={(e) => onChange(name, parseFloat(e.target.value) || 0)}
                className="w-32 bg-accent p-1 rounded text-right border border-gray-600 focus:ring-primary focus:border-primary"
            />
            <span className="ml-2 w-8 text-text-secondary">{unit}</span>
        </div>
    </div>
);

const CalculatedField = ({ label, value, unit, highlight = false }: {
    label: string;
    value: string;
    unit: string;
    highlight?: boolean;
}) => (
    <div className={`flex justify-between items-center py-2 border-b border-accent ${highlight ? 'text-primary font-bold' : ''}`}>
        <span className="text-text-secondary">{label}</span>
        <div className="flex items-center">
            <span className="w-32 text-right">{value}</span>
            <span className="ml-2 w-8 text-text-secondary">{unit}</span>
        </div>
    </div>
);

const ValuationPage: React.FC = () => {
    const { stockId } = useParams<{ stockId: string }>();
    const [stock, setStock] = useState<WatchlistItem | null>(null);
    const [inputs, setInputs] = useState<Omit<Valuation, 'id' | 'stock_id' | 'created_at' | 'updated_at'>>(defaultValuation);
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    
    const debouncedSave = useCallback(debounce(async (newInputs: Partial<Valuation>) => {
        if (!stockId) return;
        setSaveStatus('saving');
        try {
            const { error: upsertError } = await supabase
                .from('valuation')
                .upsert({ ...newInputs, stock_id: stockId, updated_at: new Date().toISOString() }, { onConflict: 'stock_id' });
            if (upsertError) throw upsertError;
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (err) {
            setError(formatErrorMessage('Error auto-saving', err));
            setSaveStatus('error');
        }
    }, 1500), [stockId]);
    
    useEffect(() => {
        const fetchData = async () => {
            if (!stockId) return;
            setLoading(true);
            setError(null);
            try {
                const { data: stockData, error: stockError } = await supabase.from('watchlist').select('*').eq('id', stockId).single();
                if (stockError) throw stockError;
                setStock(stockData);

                const { data: valuationData, error: valuationError } = await supabase.from('valuation').select('*').eq('stock_id', stockId).single();
                if (valuationError && valuationError.code !== 'PGRST116') throw valuationError;
                
                if (valuationData) {
                    setInputs(valuationData);
                } else {
                    setInputs(defaultValuation);
                }
            } catch (err) {
                setError(formatErrorMessage('Could not load data', err));
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [stockId]);

    const handleInputChange = (name: keyof Valuation, value: number) => {
        const newInputs = { ...inputs, [name]: value };
        setInputs(newInputs);
        debouncedSave({ [name]: value });
    };

    const calcs = useMemo(() => {
        const i = inputs;
        const salesGrowth = i.sales_growth_cagr_percent / 100;
        const netProfitMargin = i.net_profit_margin_percent / 100;
        const shareChange = i.share_change_percent / 100;
        const expectedReturn = i.expected_return_percent / 100;
        const marginOfSafety = i.margin_of_safety_percent / 100;

        const normalizedNetProfit = i.current_sales_mm * netProfitMargin;
        const normalizedEPS = i.shares_outstanding_mm > 0 ? normalizedNetProfit / i.shares_outstanding_mm : 0;
        const normalizedCurrentPE = normalizedEPS > 0 ? i.current_price / normalizedEPS : 0;
        
        const salesAtYearEnd = i.current_sales_mm * Math.pow(1 + salesGrowth, i.investment_horizon_years);
        const netProfitAtYearEnd = salesAtYearEnd * netProfitMargin;
        const sharesAtYearEnd = i.shares_outstanding_mm * Math.pow(1 - shareChange, i.investment_horizon_years);
        const epsAtYearEnd = sharesAtYearEnd > 0 ? netProfitAtYearEnd / sharesAtYearEnd : 0;

        const peExpansionPercent = (normalizedCurrentPE > 0 && i.investment_horizon_years > 0)
            ? (Math.pow(i.pe_at_year_end / normalizedCurrentPE, 1 / i.investment_horizon_years) - 1)
            : 0;

        const epsExpansionPercent = (normalizedEPS > 0 && i.investment_horizon_years > 0)
            ? (Math.pow(epsAtYearEnd / normalizedEPS, 1 / i.investment_horizon_years) - 1)
            : 0;
        
        const totalReturn = salesGrowth + peExpansionPercent + (salesGrowth * epsExpansionPercent) + shareChange;
        
        const fairPrice = (epsAtYearEnd * i.pe_at_year_end) / Math.pow(1 + expectedReturn, i.investment_horizon_years);
        const fairPriceWithMOS = fairPrice * (1 - marginOfSafety);

        return {
            normalizedNetProfit,
            normalizedEPS,
            normalizedCurrentPE,
            salesAtYearEnd,
            marketSharePercent: i.sam_mm > 0 ? salesAtYearEnd / i.sam_mm : 0,
            netProfitAtYearEnd,
            epsAtYearEnd,
            epsExpansionPercent,
            peExpansionPercent,
            totalReturn,
            difference: totalReturn - expectedReturn,
            fairPrice,
            fairPriceWithMOS,
        };

    }, [inputs]);

    if (loading) return <div className="p-8 text-center text-text-secondary">Loading Valuation Model...</div>;
    if (error && !stock) return <div className="p-8 text-center text-danger bg-danger/10 rounded-lg">{error}</div>;

    const formatPercent = (v: number) => `${(v * 100).toFixed(2)}%`;
    const formatCurrency = (v: number, decimals = 2) => `$${v.toFixed(decimals)}`;
    const formatNumber = (v: number, decimals = 2) => v.toFixed(decimals);

    return (
        <div className="container mx-auto p-4 md:p-8">
            <Link to={`/stock/${stockId}`} className="inline-flex items-center text-primary mb-6 hover:underline"><ArrowLeft className="w-4 h-4 mr-2" />Back to Overview</Link>
            <header className="mb-8">
                <h1 className="text-5xl font-bold">{stock?.symbol} - Valuation</h1>
                <p className="text-xl text-text-secondary">{stock?.company}</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <Card>
                        <h2 className="text-2xl font-semibold mb-4 border-b border-accent pb-2">Inputs & Assumptions</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                            <div>
                                <h3 className="font-bold mt-4 mb-2">Current State</h3>
                                <EditableField label="Current Price" name="current_price" value={inputs.current_price} unit="$" onChange={handleInputChange} />
                                <EditableField label="Current Sales" name="current_sales_mm" value={inputs.current_sales_mm} unit="M" onChange={handleInputChange} />
                                <EditableField label="Shares Outstanding" name="shares_outstanding_mm" value={inputs.shares_outstanding_mm} unit="M" onChange={handleInputChange} />
                            </div>
                             <div>
                                <h3 className="font-bold mt-4 mb-2">Future Assumptions</h3>
                                <EditableField label="Investment Horizon" name="investment_horizon_years" value={inputs.investment_horizon_years} unit="Yrs" onChange={handleInputChange} />
                                <EditableField label="Sales Growth (CAGR)" name="sales_growth_cagr_percent" value={inputs.sales_growth_cagr_percent} unit="%" onChange={handleInputChange} />
                                <EditableField label="Net Profit Margin" name="net_profit_margin_percent" value={inputs.net_profit_margin_percent} unit="%" onChange={handleInputChange} />
                                <EditableField label="P/E at Year End" name="pe_at_year_end" value={inputs.pe_at_year_end} unit="" onChange={handleInputChange} />
                                <EditableField label="Share Change" name="share_change_percent" value={inputs.share_change_percent} unit="%" onChange={handleInputChange} />
                            </div>
                            <div>
                                <h3 className="font-bold mt-4 mb-2">Market</h3>
                                <EditableField label="Total Addressable Market (TAM)" name="tam_mm" value={inputs.tam_mm} unit="M" onChange={handleInputChange} />
                                <EditableField label="Serviceable Addressable Market (SAM)" name="sam_mm" value={inputs.sam_mm} unit="M" onChange={handleInputChange} />
                            </div>
                             <div>
                                <h3 className="font-bold mt-4 mb-2">Your Requirements</h3>
                                <EditableField label="Expected Return" name="expected_return_percent" value={inputs.expected_return_percent} unit="%" onChange={handleInputChange} />
                                <EditableField label="Margin of Safety" name="margin_of_safety_percent" value={inputs.margin_of_safety_percent} unit="%" onChange={handleInputChange} />
                            </div>
                        </div>
                    </Card>
                     <Card>
                        <h2 className="text-2xl font-semibold mb-4 border-b border-accent pb-2">Calculations</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                            <div>
                                <h3 className="font-bold mt-4 mb-2">Normalized (Current)</h3>
                                <CalculatedField label="Net Profit" value={formatCurrency(calcs.normalizedNetProfit)} unit="M" />
                                <CalculatedField label="EPS" value={formatCurrency(calcs.normalizedEPS)} unit="" />
                                <CalculatedField label="P/E" value={formatNumber(calcs.normalizedCurrentPE)} unit="" />
                           </div>
                           <div>
                                <h3 className="font-bold mt-4 mb-2">Projections (Year End)</h3>
                                <CalculatedField label="Sales" value={formatCurrency(calcs.salesAtYearEnd)} unit="M" />
                                <CalculatedField label="Net Profit" value={formatCurrency(calcs.netProfitAtYearEnd)} unit="M" />
                                <CalculatedField label="EPS" value={formatCurrency(calcs.epsAtYearEnd)} unit="" />
                                <CalculatedField label="Market Share" value={formatPercent(calcs.marketSharePercent)} unit="of SAM" />
                           </div>
                        </div>
                    </Card>
                </div>
                
                <div className="lg:col-span-1 space-y-8">
                    <Card>
                         <h2 className="text-2xl font-semibold mb-4 border-b border-accent pb-2">Return Analysis</h2>
                         <CalculatedField label="Sales Growth" value={formatPercent(inputs.sales_growth_cagr_percent / 100)} unit="" />
                         <CalculatedField label="EPS Expansion" value={formatPercent(calcs.epsExpansionPercent)} unit="" />
                         <CalculatedField label="P/E Expansion" value={formatPercent(calcs.peExpansionPercent)} unit="" />
                         <CalculatedField label="Share Change" value={formatPercent(inputs.share_change_percent / 100)} unit="" />
                         <CalculatedField label="Total Return (CAGR)" value={formatPercent(calcs.totalReturn)} unit="" highlight />
                         <CalculatedField label="vs. Expected" value={formatPercent(calcs.difference)} unit="" />
                    </Card>
                     <Card>
                         <h2 className="text-2xl font-semibold mb-4 border-b border-accent pb-2">Fair Value Estimation</h2>
                         <CalculatedField label="Fair Price" value={formatCurrency(calcs.fairPrice)} unit="" />
                         <CalculatedField label="Buy Price (with MOS)" value={formatCurrency(calcs.fairPriceWithMOS)} unit="" highlight />
                         <CalculatedField label="Current Price" value={formatCurrency(inputs.current_price)} unit="" />
                    </Card>
                </div>
            </div>
            <Toast status={saveStatus} message={error ?? undefined}/>
        </div>
    );
};

export default ValuationPage;
