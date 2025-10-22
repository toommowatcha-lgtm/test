import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { WatchlistItem, FinancialMetric } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { debounce, sumBy } from 'lodash';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Toast, { SaveStatus } from '../components/ui/Toast';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';

const COLORS = ['#06b6d4', '#22c55e', '#f97316', '#8b5cf6', '#ec4899'];

const FinancialsPage: React.FC = () => {
    const { stockId } = useParams<{ stockId: string }>();
    const [stock, setStock] = useState<WatchlistItem | null>(null);
    const [financials, setFinancials] = useState<FinancialMetric[]>([]);
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [chartMetrics, setChartMetrics] = useState<string[]>(['Revenue']);

    // Fetch initial data for the stock and its financials.
    useEffect(() => {
        const fetchData = async () => {
            if (!stockId) return;
            setLoading(true);
            setError(null);

            const { data: stockData, error: stockError } = await supabase
                .from('watchlist').select('*').eq('id', stockId).single();
            
            if (stockError) {
                console.error("Error fetching stock:", stockError.message);
                setError(`Failed to load stock: ${stockError.message}`);
                setLoading(false);
                return;
            }
            setStock(stockData);

            const { data: financialsData, error: financialsError } = await supabase
                .from('financials').select('*').eq('stock_id', stockId);

            if (financialsError) {
                console.error("Error fetching financials:", financialsError.message);
                setError(`Failed to load financials: ${financialsError.message}`);
            } else {
                setFinancials(financialsData || []);
                // If there's no data, initialize with a default 'Revenue' metric
                if (!financialsData || financialsData.length === 0) {
                     setFinancials([{ stock_id: parseInt(stockId), metric_name: 'Revenue', quarter: 'Q1 2024', value: null }]);
                }
            }
            setLoading(false);
        };
        fetchData();
    }, [stockId]);
    
    // Auto-save function, debounced to avoid excessive DB calls.
    // It uses 'upsert' with a unique constraint to either insert or update a metric.
    const debouncedSave = useCallback(
        debounce(async (metric: FinancialMetric) => {
            setSaveStatus('saving');
            const { error } = await supabase.from('financials').upsert(metric, {
                onConflict: 'stock_id,metric_name,quarter'
            });

            if (error) {
                setSaveStatus('error');
                setError(`Save failed: ${error.message}`);
                setTimeout(() => setSaveStatus('idle'), 4000);
            } else {
                setSaveStatus('saved');
                setTimeout(() => setSaveStatus('idle'), 2000);
            }
        }, 1500), [stockId]
    );

    // Memoize transformations of the raw financial data for performance.
    const { metrics, quarters, dataMap, annuals, chartData, annualYears } = useMemo(() => {
        const uniqueMetrics = [...new Set(financials.map(f => f.metric_name))].sort();
        
        const quarterSorter = (a: string, b: string) => {
            const [aQ, aY] = a.split(' ');
            const [bQ, bY] = b.split(' ');
            if (aY !== bY) return parseInt(aY) - parseInt(bY);
            return parseInt(aQ.slice(1)) - parseInt(bQ.slice(1));
        };
        const uniqueQuarters = [...new Set(financials.map(f => f.quarter))].sort(quarterSorter);

        // Create a map for quick lookups: dataMap['Revenue']['Q1 2024'] -> value
        const dataMap: Record<string, Record<string, number | null>> = {};
        financials.forEach(f => {
            if (!dataMap[f.metric_name]) dataMap[f.metric_name] = {};
            dataMap[f.metric_name][f.quarter] = f.value;
        });

        // Calculate annual totals if all 4 quarters of a year exist for a metric.
        const annuals: Record<string, Record<string, number>> = {};
        uniqueMetrics.forEach(metric => {
            // Safely handle potentially undefined dataMap[metric] to prevent runtime errors and fix type inference issues.
            const quartersForMetric = dataMap[metric] || {};
            
            // FIX: Manually group quarters by year to ensure strong typing and avoid inference issues with lodash.groupBy.
            const quartersByYear: Record<string, string[]> = {};
            for (const q of Object.keys(quartersForMetric)) {
                const year = q.split(' ')[1];
                if (!quartersByYear[year]) {
                    quartersByYear[year] = [];
                }
                quartersByYear[year].push(q);
            }

            annuals[metric] = {};
            for (const year in quartersByYear) {
                if (Object.prototype.hasOwnProperty.call(quartersByYear, year)) {
                    const yearQuarters = quartersByYear[year];
                    if (yearQuarters && yearQuarters.length === 4 && yearQuarters.every(q => typeof quartersForMetric[q] === 'number')) {
                        // The .every() check acts as a type guard, so `!` is safe here.
                        annuals[metric][year] = sumBy(yearQuarters, q => quartersForMetric[q]!);
                    }
                }
            }
        });
        
        // Format data for the Recharts bar chart.
        const chartData = uniqueQuarters.map(quarter => {
            const entry: { quarter: string, [key: string]: any } = { quarter };
            chartMetrics.forEach(metric => {
                entry[metric] = dataMap[metric]?.[quarter] ?? 0;
            });
            return entry;
        });

        // FIX: Generate a sorted list of years for table headers to avoid using groupBy in JSX.
        const annualYears = [...new Set(uniqueQuarters.map(q => q.split(' ')[1]))].sort();

        return { metrics: uniqueMetrics, quarters: uniqueQuarters, dataMap, annuals, chartData, annualYears };
    }, [financials, chartMetrics]);
    
    const handleValueChange = (metricName: string, quarter: string, value: string) => {
        const newValue = value === '' ? null : parseFloat(value);
        if (isNaN(newValue as number) && newValue !== null) return;

        const existingIndex = financials.findIndex(f => f.metric_name === metricName && f.quarter === quarter);
        const updatedFinancials = [...financials];

        if (existingIndex > -1) {
            updatedFinancials[existingIndex] = { ...updatedFinancials[existingIndex], value: newValue };
        } else {
            updatedFinancials.push({ stock_id: parseInt(stockId!), metric_name: metricName, quarter, value: newValue });
        }
        
        setFinancials(updatedFinancials);
        debouncedSave({ stock_id: parseInt(stockId!), metric_name: metricName, quarter, value: newValue });
    };

    const addMetric = () => {
        const newMetricName = `New Metric ${metrics.length + 1}`;
        if (metrics.includes(newMetricName)) return; // Avoid duplicates
        const newMetricData = quarters.length > 0
            ? quarters.map(q => ({ stock_id: parseInt(stockId!), metric_name: newMetricName, quarter: q, value: null }))
            : [{ stock_id: parseInt(stockId!), metric_name: newMetricName, quarter: 'Q1 2024', value: null }];
        
        setFinancials([...financials, ...newMetricData]);
    };
    
    const removeMetric = async (metricName: string) => {
        setFinancials(financials.filter(f => f.metric_name !== metricName));
        setChartMetrics(chartMetrics.filter(m => m !== metricName));
        const { error } = await supabase.from('financials').delete().match({ stock_id: stockId, metric_name: metricName });
        if (error) console.error("Failed to delete metric:", error);
    };

    if (loading) return <div className="p-8 text-center text-text-secondary">Loading Financials...</div>;
    if (error) return <div className="p-8 text-center text-danger bg-danger/10 rounded-lg">{error}</div>;

    return (
        <div className="container mx-auto p-4 md:p-8">
            <Link to={`/stock/${stockId}`} className="inline-flex items-center text-primary mb-6 hover:underline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Analysis
            </Link>

            <header className="mb-8">
                <h1 className="text-5xl font-bold">{stock?.symbol} - Financials</h1>
                <p className="text-xl text-text-secondary">{stock?.company_name}</p>
            </header>
            
            <Card className="mb-8">
                 <h2 className="text-2xl font-semibold mb-4">Chart</h2>
                <div className="flex gap-4 mb-4">
                    {metrics.map(metric => (
                        <label key={metric} className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={chartMetrics.includes(metric)}
                                onChange={() => {
                                    setChartMetrics(prev => 
                                        prev.includes(metric) ? prev.filter(m => m !== metric) : [...prev, metric]
                                    );
                                }}
                                className="form-checkbox h-5 w-5 rounded bg-accent border-gray-600 text-primary focus:ring-primary"
                            />
                            <span>{metric}</span>
                        </label>
                    ))}
                </div>
                 <div style={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>
                        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="quarter" stroke="#d1d5db" />
                            <YAxis stroke="#d1d5db" tickFormatter={(value) => new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(value)} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                                labelStyle={{ color: '#f9fafb' }}
                            />
                            <Legend />
                            {chartMetrics.map((metric, i) => (
                                <Bar key={metric} dataKey={metric} fill={COLORS[i % COLORS.length]}>
                                    <LabelList dataKey={metric} position="top" formatter={(value: number) => new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(value)} style={{ fill: '#d1d5db' }}/>
                                </Bar>
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            <Card>
                <h2 className="text-2xl font-semibold mb-4">Metrics</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b-2 border-accent">
                                <th className="p-3 font-semibold text-text-secondary sticky left-0 bg-content z-10 w-48">Metric</th>
                                {quarters.map(q => <th key={q} className="p-3 font-semibold text-center">{q}</th>)}
                                {/* FIX: Use the pre-calculated annualYears array for table headers. */}
                                {annualYears.map(year => (
                                    <th key={year} className="p-3 font-semibold text-center bg-accent/50">Annual {year}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {metrics.map(metric => (
                                <tr key={metric} className="border-b border-accent last:border-0 hover:bg-accent/20">
                                    <td className="p-3 font-bold sticky left-0 bg-content z-10 w-48 flex items-center gap-2">
                                        <Button variant="danger" size="sm" className="p-1 h-6 w-6" onClick={() => removeMetric(metric)}><Trash2 className="w-3 h-3"/></Button>
                                        <span>{metric}</span>
                                    </td>
                                    {quarters.map(q => (
                                        <td key={q} className="p-1">
                                            <input
                                                type="number"
                                                step="any"
                                                value={dataMap[metric]?.[q] ?? ''}
                                                onChange={(e) => handleValueChange(metric, q, e.target.value)}
                                                placeholder="-"
                                                className="w-full bg-transparent p-2 text-right rounded hover:bg-accent focus:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
                                            />
                                        </td>
                                    ))}
                                    {/* FIX: Use the pre-calculated annualYears array for table cells. */}
                                    {annualYears.map(year => (
                                        <td key={year} className="p-3 text-right font-mono bg-accent/50">
                                            {annuals[metric]?.[year]?.toLocaleString() ?? '-'}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Button onClick={addMetric} variant="secondary" className="mt-4"><Plus className="w-4 h-4 mr-2"/>Add Metric</Button>
            </Card>
            
            <Toast status={saveStatus} message={error ?? undefined}/>
        </div>
    );
};

export default FinancialsPage;
