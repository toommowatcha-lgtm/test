import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { WatchlistItem, FinancialMetric, FinancialSubsegment, FinancialValue, FinancialPeriod } from '../types';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { debounce } from 'lodash';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Toast, { SaveStatus } from '../components/ui/Toast';
import { ArrowLeft, Plus, Trash2, LineChart as LineChartIcon, BarChart as BarChartIcon } from 'lucide-react';
import { formatErrorMessage } from '../utils/errorHandler';

const COLORS = ['#06b6d4', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#fde047', '#a855f7', '#64748b'];

// Chart Performance Summary Component
const ChartSummary: React.FC<{ annualData: Record<string, string | number>[], metrics: FinancialMetric[], selectedChartItems: Record<string, boolean> }> = ({ annualData, metrics, selectedChartItems }) => {
    if (annualData.length < 2) return null;

    const getYear = (p: string): number | null => {
        const match = p.match(/\b(\d{4})\b/);
        return match ? parseInt(match[1]) : null;
    };

    const formatPercent = (value: number | null) => {
        if (value === null || !isFinite(value)) return 'N/A';
        const formatted = (value * 100).toFixed(1) + '%';
        const color = value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-text-secondary';
        return <span className={color}>{value > 0 ? '+' : ''}{formatted}</span>;
    };
    
    const summaryData = metrics
      .filter(m => selectedChartItems[`metric-${m.id}`])
      .map(metric => {
        const values = annualData.map(d => {
            const value = metric.financial_subsegments.length > 0
                ? metric.financial_subsegments.reduce((sum, sub) => sum + (Number(d[`subsegment-${sub.id}`]) || 0), 0)
                : Number(d[`metric-${metric.id}`]) || 0;
            return {
                period: d.period_label as string,
                value,
            };
        }).filter(item => item.value !== 0 && isFinite(item.value));
        
        if (values.length < 2) return { name: metric.metric_name, totalChange: null, cagr: null };

        const first = values[0];
        const last = values[values.length - 1];
        
        if (Math.abs(first.value) < 1e-6) return { name: metric.metric_name, totalChange: null, cagr: null };

        const totalChange = (last.value - first.value) / Math.abs(first.value);
        
        const firstYear = getYear(first.period);
        const lastYear = getYear(last.period);
        let cagr: number | null = null;

        if (firstYear !== null && lastYear !== null && lastYear > firstYear) {
            const numYears = lastYear - firstYear;
            if (first.value !== 0) {
                const ratio = last.value / first.value;
                cagr = ratio > 0 ? Math.pow(ratio, 1 / numYears) - 1 : null;
            }
        }
        return { name: metric.metric_name, totalChange, cagr };
    });

    if (summaryData.filter(d => d.cagr !== null || d.totalChange !== null).length === 0) return null;

    return (
        <Card className="mt-6">
            <h3 className="text-xl font-semibold mb-3">Performance Summary (Annualized)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                {summaryData.map(data => (
                    <div key={data.name} className="bg-accent p-3 rounded-md">
                        <p className="font-bold text-text-primary truncate">{data.name}</p>
                        <div className="flex justify-between mt-1"><span className="text-text-secondary">Total Change:</span>{formatPercent(data.totalChange)}</div>
                        <div className="flex justify-between mt-1"><span className="text-text-secondary">CAGR:</span>{formatPercent(data.cagr)}</div>
                    </div>
                ))}
            </div>
        </Card>
    );
};

const EditableHeader: React.FC<{ id: string; initialValue: string; onUpdate: (id: string, newValue: string) => void; startInEditMode?: boolean; onEditEnd?: () => void; onDelete?: (id: string) => void; isMetric?: boolean; }> = ({ id, initialValue, onUpdate, startInEditMode = false, onEditEnd, onDelete, isMetric = false }) => {
    const [isEditing, setIsEditing] = useState(startInEditMode);
    const [value, setValue] = useState(initialValue);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleBlur = () => {
        setIsEditing(false);
        onEditEnd?.();
        if (value.trim() && value !== initialValue) {
            onUpdate(id, value.trim());
        } else {
            setValue(initialValue);
        }
    };
    
    if (isEditing) {
        return <input ref={inputRef} type="text" value={value} onChange={e => setValue(e.target.value)} onBlur={handleBlur} onKeyDown={e => e.key === 'Enter' && handleBlur()} className={`w-full p-1 rounded focus:outline-none focus:ring-2 focus:ring-primary ${isMetric ? 'bg-transparent' : 'bg-accent text-center'}`} />;
    }

    return (
        <div className={`group relative p-1 rounded cursor-pointer min-h-[34px] flex items-center ${isMetric ? '' : 'justify-center hover:bg-accent'}`} onClick={() => setIsEditing(true)}>
            {value}
            {onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(id); }} className={`absolute p-1 bg-danger rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity ${isMetric ? 'top-1 -left-7' : '-top-2 -right-2'}`}><Trash2 className="w-3 h-3"/></button>}
        </div>
    );
};


const FinancialsPage: React.FC = () => {
    const { stockId = '' } = useParams<{ stockId: string }>();
    const [stock, setStock] = useState<WatchlistItem | null>(null);
    const [metrics, setMetrics] = useState<FinancialMetric[]>([]);
    const [periods, setPeriods] = useState<FinancialPeriod[]>([]);
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [selectedChartItems, setSelectedChartItems] = useState<Record<string, boolean>>({});
    const [chartType, setChartType] = useState<'line' | 'bar'>('bar');
    const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'quarterly' | 'annual'>('quarterly');


    const showSaveStatus = useCallback((status: SaveStatus, customError?: string) => {
        setSaveStatus(status);
        if (customError) setError(customError);
        setTimeout(() => setSaveStatus('idle'), status === 'saved' ? 2000 : 5000);
    }, []);

    const fetchData = useCallback(async () => {
        if (!stockId) return;
        setLoading(true);
        setError(null);
        try {
            const [stockRes, metricsRes, subsegmentsRes, valuesRes, periodsRes] = await Promise.all([
                supabase.from('watchlist').select('*').eq('id', stockId).single(),
                supabase.from('financial_metric').select('*').eq('stock_id', stockId).order('display_order'),
                supabase.from('financial_subsegment').select('*').order('display_order'),
                supabase.from('financial_values').select('*').eq('stock_id', stockId),
                supabase.from('financial_period').select('*').eq('stock_id', stockId).order('display_order'),
            ]);

            if (stockRes.error) throw stockRes.error;
            setStock(stockRes.data);
            if (periodsRes.error) throw periodsRes.error;
            setPeriods(periodsRes.data || []);
            
            const metricsData = metricsRes.data || [];
            const subsegmentsData = subsegmentsRes.data || [];
            const valuesData = valuesRes.data || [];

            const stitchedMetrics = metricsData.map(metric => {
                const metricSubsegments = subsegmentsData
                    .filter(s => s.metric_id === metric.id)
                    .map(sub => ({
                        ...sub,
                        financial_values: valuesData.filter(v => v.subsegment_id === sub.id)
                    }));
                return {
                    ...metric,
                    financial_subsegments: metricSubsegments,
                    financial_values: valuesData.filter(v => v.metric_id === metric.id && v.subsegment_id === null)
                };
            });
            setMetrics(stitchedMetrics);

        } catch (err) {
            setError(formatErrorMessage('Failed to load financials', err));
        } finally {
            setLoading(false);
        }
    }, [stockId]);

    useEffect(() => { fetchData(); }, [fetchData]);
    
    const debouncedSave = useCallback(debounce(async (table: string, data: any | any[], conflictFields: string[]) => {
        setSaveStatus('saving');
        try {
            const { error: upsertError } = await supabase.from(table).upsert(data, { onConflict: conflictFields.join(',') });
            if (upsertError) throw upsertError;
            showSaveStatus('saved');
        } catch (err) {
            showSaveStatus('error', formatErrorMessage('Save failed', err));
        }
    }, 1500), [showSaveStatus]);

    const handleValueChange = (metric_id: string, subsegment_id: string | null, period_id: string, valueStr: string) => {
        const value = valueStr === '' ? null : parseFloat(valueStr);
        if (valueStr !== '' && (value === null || isNaN(value))) return;

        const newMetrics = JSON.parse(JSON.stringify(metrics));
        const payloadsToSave: any[] = [];
        
        const metric = newMetrics.find((m: FinancialMetric) => m.id === metric_id);
        if (!metric) return;

        const mainPayload = { stock_id: stockId, metric_id, subsegment_id, period_id, value };
        payloadsToSave.push(mainPayload);

        const target = subsegment_id
            ? metric.financial_subsegments.find((s: FinancialSubsegment) => s.id === subsegment_id)
            : metric;

        if (!target) return;

        let valueUpdated = false;
        target.financial_values = target.financial_values.map((v: FinancialValue) => {
            if (v.period_id === period_id) {
                valueUpdated = true;
                return { ...v, value };
            }
            return v;
        });

        if (!valueUpdated) {
            const newId = crypto.randomUUID();
            target.financial_values.push({ id: newId, created_at: new Date().toISOString(), ...mainPayload });
        }
        
        if (subsegment_id && metric.financial_subsegments.length > 0) {
            const total = metric.financial_subsegments.reduce((sum: number, sub: FinancialSubsegment) => {
                const subValue = sub.financial_values.find((v: FinancialValue) => v.period_id === period_id)?.value || 0;
                return sum + subValue;
            }, 0);

            const parentMetricPayload = { stock_id: stockId, metric_id, subsegment_id: null, period_id, value: total };
            payloadsToSave.push(parentMetricPayload);
            
            let parentValueUpdated = false;
            metric.financial_values = metric.financial_values.map((v: FinancialValue) => {
                if (v.period_id === period_id && v.subsegment_id === null) {
                    parentValueUpdated = true;
                    return { ...v, value: total };
                }
                return v;
            });

            if (!parentValueUpdated) {
                const newId = crypto.randomUUID();
                metric.financial_values.push({ id: newId, created_at: new Date().toISOString(), ...parentMetricPayload });
            }
        }
        
        setMetrics(newMetrics);
        
        if (payloadsToSave.length > 0) {
            debouncedSave('financial_values', payloadsToSave, ['stock_id', 'metric_id', 'subsegment_id', 'period_id']);
        }
    };
    
    const handleNameUpdate = async (type: 'metric' | 'sub' | 'period', id: string, newName: string) => {
        const table = type === 'metric' ? 'financial_metric' : type === 'sub' ? 'financial_subsegment' : 'financial_period';
        const nameField = type === 'metric' ? 'metric_name' : type === 'sub' ? 'subsegment_name' : 'period_label';
        
        const isDuplicate = type === 'period' && periods.some(p => p.id !== id && p.period_label === newName);
        if (isDuplicate) {
            showSaveStatus('error', `Period "${newName}" already exists.`);
            const oldName = periods.find(p => p.id === id)?.period_label;
            if(oldName) setPeriods(prev => prev.map(p => p.id === id ? {...p, period_label: oldName} : p));
            return;
        }

        setSaveStatus('saving');
        const { error } = await supabase.from(table).update({ [nameField]: newName }).match({ id });
        if (error) {
            showSaveStatus('error', formatErrorMessage(`Failed to update ${type}`, error));
            fetchData();
        } else { 
            showSaveStatus('saved'); 
            if (type === 'metric') {
                setMetrics(prev => prev.map(m => m.id === id ? { ...m, metric_name: newName } : m));
            } else if (type === 'sub') {
                setMetrics(prev => prev.map(m => ({
                    ...m,
                    financial_subsegments: m.financial_subsegments.map(s => s.id === id ? { ...s, subsegment_name: newName } : s)
                })));
            } else if (type === 'period') {
                setPeriods(prev => prev.map(p => p.id === id ? { ...p, period_label: newName } : p));
            }
        }
    };

    const addMetric = async () => {
        if (!stockId) return;
        showSaveStatus('saving');
        const { data, error } = await supabase.from('financial_metric').insert({ stock_id: stockId, metric_name: 'New Metric', display_order: metrics.length }).select().single();
        if (error) { showSaveStatus('error', formatErrorMessage('Failed to add metric', error)); return; }
        if (!data) { showSaveStatus('error', 'Failed to add metric: No data returned from server.'); return; }
        const newMetric: FinancialMetric = { ...data, financial_subsegments: [], financial_values: [] };
        setMetrics(prev => [...prev, newMetric]);
        showSaveStatus('saved');
    };

    const addSubsegment = async (metric_id: string) => {
        const parentMetric = metrics.find(m => m.id === metric_id);
        if (!parentMetric) return;

        showSaveStatus('saving');
        try {
            let parentValuesToUpdate: FinancialValue[] = [];
            if (parentMetric.financial_subsegments.length === 0 && parentMetric.financial_values.length > 0) {
                const { error: deleteError } = await supabase.from('financial_values').delete().match({ metric_id: metric_id, subsegment_id: null });
                if (deleteError) throw deleteError;

                parentValuesToUpdate = periods.map(p => ({
                    id: crypto.randomUUID(), stock_id: stockId, metric_id: parentMetric.id, subsegment_id: null, period_id: p.id, value: 0, created_at: new Date().toISOString()
                }));
                if (parentValuesToUpdate.length > 0) {
                    const { error: upsertError } = await supabase.from('financial_values').upsert(parentValuesToUpdate, { onConflict: 'stock_id,metric_id,subsegment_id,period_id' });
                    if (upsertError) throw upsertError;
                }
            }

            const { data: newSubData, error: insertError } = await supabase.from('financial_subsegment').insert({ metric_id, subsegment_name: 'New Sub-segment', display_order: parentMetric.financial_subsegments.length }).select().single();
            if (insertError) throw insertError;
            if (!newSubData) throw new Error("No data returned for new sub-segment.");

            const newSub: FinancialSubsegment = { ...newSubData, financial_values: [] };
            setMetrics(prevMetrics => prevMetrics.map(m => {
                if (m.id === metric_id) {
                    const updatedMetric = { ...m };
                    if (parentValuesToUpdate.length > 0) updatedMetric.financial_values = parentValuesToUpdate;
                    updatedMetric.financial_subsegments = [...m.financial_subsegments, newSub];
                    return updatedMetric;
                }
                return m;
            }));
            showSaveStatus('saved');
        } catch (err) {
            showSaveStatus('error', formatErrorMessage('Failed to add sub-segment', err));
        }
    };

    const addPeriod = async () => {
        if (!stockId) return;
        const newLabel = `Q${(periods.length % 4) + 1} ${new Date().getFullYear() + Math.floor(periods.length / 4)}`;
        showSaveStatus('saving');
        const { data, error } = await supabase.from('financial_period').insert({ stock_id: stockId, period_label: newLabel, period_type: 'quarter', display_order: periods.length }).select().single();
        if (error) { showSaveStatus('error', formatErrorMessage('Failed to add period', error)); return; }
        if (!data) { showSaveStatus('error', 'Failed to add period: No data returned from server.'); return; }
        setPeriods(prev => [...prev, data]);
        setNewlyAddedId(data.id);
        showSaveStatus('saved');
    };
    
    const deleteItem = async (type: 'metric' | 'sub' | 'period', id: string) => {
        const table = type === 'metric' ? 'financial_metric' : type === 'sub' ? 'financial_subsegment' : 'financial_period';
        if (!confirm(`Delete this ${type}? This cannot be undone.`)) return;

        showSaveStatus('saving');
        try {
            if (type === 'sub') {
                // Recalculate parent total before deleting the subsegment
                const parentMetric = metrics.find(m => m.financial_subsegments.some(s => s.id === id));
                if (parentMetric) {
                    const updatedParentValuesPayload = periods.map(p => {
                        const total = parentMetric.financial_subsegments
                            .filter(s => s.id !== id)
                            .reduce((sum, sub) => sum + (sub.financial_values.find(v => v.period_id === p.id)?.value || 0), 0);
                        return { stock_id: stockId, metric_id: parentMetric.id, subsegment_id: null, period_id: p.id, value: total };
                    });
                    
                    if (updatedParentValuesPayload.length > 0) {
                        const { error: parentUpdateError } = await supabase.from('financial_values').upsert(updatedParentValuesPayload, { onConflict: 'stock_id,metric_id,subsegment_id,period_id' });
                        if (parentUpdateError) throw parentUpdateError;
                    }
                }
            }

            const { error } = await supabase.from(table).delete().match({ id });
            if (error) throw error;
            
            showSaveStatus('saved');
            if (type === 'metric') setMetrics(prev => prev.filter(m => m.id !== id));
            else if (type === 'sub') {
                setMetrics(prev => prev.map(m => ({
                    ...m,
                    financial_subsegments: m.financial_subsegments.filter(s => s.id !== id)
                })));
            }
            else if (type === 'period') {
                setPeriods(prev => prev.filter(p => p.id !== id));
                setMetrics(prevMetrics => prevMetrics.map(m => ({
                    ...m,
                    financial_values: m.financial_values.filter(v => v.period_id !== id),
                    financial_subsegments: m.financial_subsegments.map(s => ({
                       ...s,
                       financial_values: s.financial_values.filter(v => v.period_id !== id)
                    }))
                })));
            }
        } catch (err) {
            showSaveStatus('error', formatErrorMessage(`Failed to delete ${type}`, err));
        }
    }
    
    // FIX: Changed v from unknown to any to fix cascading type inference errors.
    const valueFormatter = (v: any): string => (typeof v === 'number') ? new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(v) : String(v);

    const {
        quarterlyChartData,
        annualChartData,
        annualPeriods,
        getAnnualValue
    } = useMemo(() => {
        const getYear = (p: string): string | null => {
            const match = p.match(/\b(\d{4})\b/);
            return match ? match[1] : null;
        };

        const quarterlyData = periods.map(p => {
            const entry: Record<string, string | number> = { period_label: p.period_label };
            metrics.forEach(m => {
                if (m.financial_subsegments.length > 0) {
                    m.financial_subsegments.forEach(s => { 
                        entry[`subsegment-${s.id}`] = s.financial_values.find(v => v.period_id === p.id)?.value ?? 0; 
                    });
                } else {
                    entry[`metric-${m.id}`] = m.financial_values.find(v => v.period_id === p.id && !v.subsegment_id)?.value ?? 0;
                }
            });
            return entry;
        });
        
        const uniqueYears = [...new Set(periods.map(p => getYear(p.period_label)).filter(Boolean))].sort();
        const annualPeriodsForTable = uniqueYears.map(year => ({ id: year, period_label: year, display_order: parseInt(year), period_type: 'annual' as 'annual', created_at: '' }));
        const aggregatedValues: Record<string, Record<string, number>> = {}; // { [metric/sub_id]: { [year]: value } }

        metrics.forEach(metric => {
            aggregatedValues[metric.id] = {};
            metric.financial_subsegments.forEach(sub => {
                aggregatedValues[sub.id] = {};
            });
            uniqueYears.forEach(year => {
                let metricTotalForYear = 0;
                const hasSubsegments = metric.financial_subsegments.length > 0;
                metric.financial_subsegments.forEach(sub => {
                    let subTotalForYear = 0;
                    periods.forEach(period => {
                        if (getYear(period.period_label) === year) {
                            const val = sub.financial_values.find(v => v.period_id === period.id)?.value || 0;
                            subTotalForYear += val;
                        }
                    });
                    aggregatedValues[sub.id][year] = subTotalForYear;
                    metricTotalForYear += subTotalForYear;
                });
                if (!hasSubsegments) {
                    periods.forEach(period => {
                        if (getYear(period.period_label) === year) {
                            const val = metric.financial_values.find(v => v.period_id === period.id && !v.subsegment_id)?.value || 0;
                            metricTotalForYear += val;
                        }
                    });
                }
                aggregatedValues[metric.id][year] = metricTotalForYear;
            });
        });

        const annualDataForChart = uniqueYears.map(year => {
            const entry: Record<string, string | number> = { period_label: year };
            metrics.forEach(m => {
                if (m.financial_subsegments.length > 0) {
                    m.financial_subsegments.forEach(s => {
                        entry[`subsegment-${s.id}`] = aggregatedValues[s.id]?.[year] ?? 0;
                    });
                } else {
                    entry[`metric-${m.id}`] = aggregatedValues[m.id]?.[year] ?? 0;
                }
            });
            return entry;
        });

        const getAnnualValueHelper = (metricId: string, subsegmentId: string | null, year: string): number | null => {
            const id = subsegmentId || metricId;
            return aggregatedValues[id]?.[year] ?? null;
        };

        return {
            quarterlyChartData: quarterlyData,
            annualChartData: annualDataForChart,
            annualPeriods: annualPeriodsForTable,
            getAnnualValue: getAnnualValueHelper,
        };
    }, [metrics, periods]);
    
    if (loading) return <div className="p-8 text-center text-text-secondary">Loading Financials...</div>;
    if (error && !stock) return <div className="p-8 text-center text-danger bg-danger/10 rounded-lg">{error}</div>;

    const chartDataSource = activeTab === 'quarterly' ? quarterlyChartData : annualChartData;
    const tablePeriods = activeTab === 'quarterly' ? periods : annualPeriods;
    
    return (
        <div className="container mx-auto p-4 md:p-8">
            <Link to="/" className="inline-flex items-center text-primary mb-6 hover:underline"><ArrowLeft className="w-4 h-4 mr-2" />Back to Watchlist</Link>
            
            <div className="border-b border-accent mb-8">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <Link to={`/stock/${stockId}`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Business Overview</Link>
                    <Link to={`/stock/${stockId}/financials`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-primary text-primary">Financials</Link>
                    <Link to={`/stock/${stockId}/earning-call-story`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Earning Call Story</Link>
                    <Link to={`/stock/${stockId}/valuation`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Valuation</Link>
                </nav>
            </div>

            <header className="mb-8"><h1 className="text-5xl font-bold">{stock?.symbol} - Financials</h1><p className="text-xl text-text-secondary">{stock?.company}</p></header>

             <div className="border-b border-accent mb-8">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button onClick={() => setActiveTab('quarterly')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'quarterly' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300'}`}>Quarterly</button>
                    <button onClick={() => setActiveTab('annual')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'annual' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300'}`}>Annual</button>
                </nav>
            </div>

            <Card className="mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-semibold">Chart Visualization</h2>
                    <div className="flex items-center gap-2 p-1 bg-accent rounded-lg"><Button variant={chartType === 'bar' ? 'primary' : 'secondary'} onClick={() => setChartType('bar')} className="p-2"><BarChartIcon className="w-5 h-5"/></Button><Button variant={chartType === 'line' ? 'primary' : 'secondary'} onClick={() => setChartType('line')} className="p-2"><LineChartIcon className="w-5 h-5"/></Button></div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-2 mb-4">{metrics.map(m => (<div key={m.id}><label className="flex items-center space-x-2 cursor-pointer font-bold"><input type="checkbox" checked={!!selectedChartItems[`metric-${m.id}`]} onChange={() => setSelectedChartItems(p => ({...p, [`metric-${m.id}`]: !p[`metric-${m.id}`]}))} className="form-checkbox h-5 w-5 rounded bg-accent border-gray-600 text-primary focus:ring-primary"/><span className="truncate">{m.metric_name}</span></label></div>))}</div>
                <div style={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>{(chartDataSource.length > 0 && metrics.length > 0) ? <ComposedChart data={chartDataSource} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis dataKey="period_label" stroke="#d1d5db" /><YAxis stroke="#d1d5db" tickFormatter={valueFormatter} /><Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} formatter={valueFormatter} /><Legend />{metrics.filter(m => selectedChartItems[`metric-${m.id}`]).map((m, i) => (chartType === 'bar' ? (m.financial_subsegments.length > 0 ? m.financial_subsegments.map((s, j) => <Bar key={s.id} dataKey={`subsegment-${s.id}`} name={s.subsegment_name} stackId={m.id} fill={COLORS[(i*3 + j) % COLORS.length]} />) : <Bar key={m.id} dataKey={`metric-${m.id}`} name={m.metric_name} fill={COLORS[i % COLORS.length]} />) : (m.financial_subsegments.length > 0 ? m.financial_subsegments.map((s, j) => <Line key={s.id} type="monotone" dataKey={`subsegment-${s.id}`} name={s.subsegment_name} stroke={COLORS[(i*3 + j) % COLORS.length]} />) : <Line key={m.id} type="monotone" dataKey={`metric-${m.id}`} name={m.metric_name} stroke={COLORS[i % COLORS.length]} />)))}</ComposedChart> : <div className="flex items-center justify-center h-full text-text-secondary">Add data and select metrics to see the chart.</div>}</ResponsiveContainer>
                </div>
                <ChartSummary annualData={annualChartData} metrics={metrics} selectedChartItems={selectedChartItems} />
            </Card>

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-left">
                        <thead><tr><th className="p-3 font-semibold sticky left-0 bg-content z-20 w-52">Metric / Sub-segment</th>{tablePeriods.map(p => (<th key={p.id} className="p-1 font-semibold text-center w-32">{activeTab === 'quarterly' ? <EditableHeader id={p.id} initialValue={p.period_label} onUpdate={handleNameUpdate.bind(null, 'period')} startInEditMode={p.id === newlyAddedId} onEditEnd={() => setNewlyAddedId(null)} onDelete={deleteItem.bind(null, 'period')} /> : <div className="p-1">{p.period_label}</div>}</th>))}{activeTab === 'quarterly' && <th className="p-1 w-24"><Button onClick={addPeriod} variant="secondary" className="w-full text-xs"><Plus className="w-3 h-3 mr-1"/>Period</Button></th>}</tr></thead>
                        <tbody>
                            {metrics.map(metric => (
                                <React.Fragment key={metric.id}>
                                    <tr className="bg-content/50">
                                        <td className="p-2 font-bold sticky left-0 bg-content z-10 w-52"><EditableHeader id={metric.id} initialValue={metric.metric_name} onUpdate={handleNameUpdate.bind(null, 'metric')} onDelete={deleteItem.bind(null, 'metric')} isMetric /></td>
                                        {tablePeriods.map(p => <td key={p.id} className="p-1 w-32 text-right pr-3 font-semibold">{metric.financial_subsegments.length > 0 ? (activeTab === 'quarterly' ? valueFormatter(metric.financial_values.find(v => v.period_id === p.id)?.value ?? 0) : valueFormatter(getAnnualValue(metric.id, null, p.period_label))) : (activeTab === 'quarterly' ? <input type="number" step="any" value={metric.financial_values.find(v => v.period_id === p.id)?.value ?? ''} onChange={e => handleValueChange(metric.id, null, p.id, e.target.value)} placeholder="-" className="w-full bg-transparent p-2 text-right rounded hover:bg-accent focus:bg-accent"/> : <div className="w-full bg-transparent p-2 text-right rounded">{valueFormatter(getAnnualValue(metric.id, null, p.period_label))}</div>)}</td>)}
                                        {activeTab === 'quarterly' && <td></td>}
                                    </tr>
                                    {metric.financial_subsegments.map(sub => (
                                        <tr key={sub.id} className="hover:bg-accent/20">
                                            <td className="p-2 pl-6 sticky left-0 bg-content z-10 w-52"><EditableHeader id={sub.id} initialValue={sub.subsegment_name} onUpdate={handleNameUpdate.bind(null, 'sub')} onDelete={deleteItem.bind(null, 'sub')} isMetric /></td>
                                            {tablePeriods.map(p => <td key={p.id} className="p-1 w-32">{activeTab === 'quarterly' ? <input type="number" step="any" value={sub.financial_values.find(v => v.period_id === p.id)?.value ?? ''} onChange={e => handleValueChange(metric.id, sub.id, p.id, e.target.value)} placeholder="-" className="w-full bg-transparent p-2 text-right rounded hover:bg-accent focus:bg-accent"/> : <div className="w-full bg-transparent p-2 text-right rounded">{valueFormatter(getAnnualValue(metric.id, sub.id, p.period_label))}</div>}</td>)}
                                            {activeTab === 'quarterly' && <td></td>}
                                        </tr>
                                    ))}
                                    {activeTab === 'quarterly' && <tr><td colSpan={periods.length + 2} className="py-1 pl-6"><Button onClick={() => addSubsegment(metric.id)} variant="secondary" className="text-xs px-2 py-1"><Plus className="w-3 h-3 mr-1"/>Add Subsegment</Button></td></tr>}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
                {activeTab === 'quarterly' && <div className="mt-4"><Button onClick={addMetric} variant="secondary"><Plus className="w-4 h-4 mr-2"/>Add Metric</Button></div>}
            </Card>
            <Toast status={saveStatus} message={error ?? undefined}/>
        </div>
    );
};

export default FinancialsPage;