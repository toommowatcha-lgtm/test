import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
// FIX: Import SaveStatus type.
import { WatchlistItem, FinancialMetric, FinancialSubsegment, FinancialValue, FinancialPeriod, SaveStatus } from '../types';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Toast from '../components/ui/Toast';
import FinancialInput from '../components/ui/FinancialInput';
import { ArrowLeft, Plus, Trash2, LineChart as LineChartIcon, BarChart as BarChartIcon, Loader2 } from 'lucide-react';
import { formatErrorMessage } from '../utils/errorHandler';
import { MetricSaveProvider, useMetricSaveQueue } from '../hooks/useMetricSaveQueue';
import { ensurePeriodExistsAndLink, saveFinancialValue } from '../services/financialsService';

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

const EditableHeader: React.FC<{ id: string; initialValue: string; onUpdate: (id: string, newValue: string) => void; startInEditMode?: boolean; onEditEnd?: () => void; onDelete?: (id: string) => void; isMetric?: boolean; forceEditMode?: boolean; isSaving?: boolean; }> = ({ id, initialValue, onUpdate, startInEditMode = false, onEditEnd, onDelete, isMetric = false, forceEditMode = false, isSaving = false }) => {
    const [isEditing, setIsEditing] = useState(startInEditMode);
    const [value, setValue] = useState(initialValue);
    const inputRef = useRef<HTMLInputElement>(null);

    const effectiveIsEditing = forceEditMode || isEditing;

    useEffect(() => {
        if (effectiveIsEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [effectiveIsEditing, startInEditMode]);

    const handleBlur = () => {
        if (!forceEditMode) {
            setIsEditing(false);
        }
        onEditEnd?.();
        if (value.trim() && value !== initialValue) {
            onUpdate(id, value.trim());
        } else {
            setValue(initialValue);
        }
    };
    
    if (effectiveIsEditing) {
        return <input ref={inputRef} type="text" value={value} onChange={e => setValue(e.target.value)} onBlur={handleBlur} onKeyDown={e => e.key === 'Enter' && handleBlur()} className={`w-full p-1 rounded focus:outline-none focus:ring-2 focus:ring-primary ${isMetric ? 'bg-transparent' : 'bg-accent text-center'}`} />;
    }

    return (
        <div className={`group relative p-1 rounded cursor-pointer min-h-[34px] flex items-center ${isMetric ? '' : 'justify-center hover:bg-accent'}`} onClick={() => setIsEditing(true)}>
            {value}
            {onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(id); }} disabled={isSaving} className={`absolute p-1 bg-danger rounded-full text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed ${forceEditMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${isMetric ? 'top-1/2 -translate-y-1/2 right-2' : '-top-2 -right-2'}`}>{isSaving ? <Loader2 className="w-3 h-3 animate-spin"/> : <Trash2 className="w-3 h-3"/>}</button>}
        </div>
    );
};

// FIX: Changed type from unknown to any for better compatibility with recharts.
const valueFormatter = (v: any): string => {
    if (typeof v === 'number') {
        return new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(v);
    }
    return String(v ?? '');
};

const FinancialsPageContent: React.FC = () => {
    const { stockId = '' } = useParams<{ stockId: string }>();
    const [stock, setStock] = useState<WatchlistItem | null>(null);
    const [metrics, setMetrics] = useState<FinancialMetric[]>([]);
    const [periods, setPeriods] = useState<FinancialPeriod[]>([]);
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [toastText, setToastText] = useState<string | undefined>();
    const [error, setError] = useState<string | null>(null);
    const [selectedChartItems, setSelectedChartItems] = useState<Record<string, boolean>>({});
    const [chartType, setChartType] = useState<'line' | 'bar'>('bar');
    const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'quarterly' | 'annual'>('quarterly');
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>([]);
    
    const tableCardRef = useRef<HTMLDivElement>(null);
    const editModeButtonRef = useRef<HTMLButtonElement>(null);
    const floatingPanelRef = useRef<HTMLDivElement>(null);

    // FIX: Get `addToQueue` from the context to centralize all save operations.
    const { addToQueue } = useMetricSaveQueue();

    useEffect(() => {
        if (!isEditMode) {
            setSelectedMetricIds([]);
        }
    }, [isEditMode]);

    // Effect to handle clicks outside of the table card to exit edit mode
    useEffect(() => {
        if (!isEditMode) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (
                tableCardRef.current && !tableCardRef.current.contains(event.target as Node) &&
                editModeButtonRef.current && !editModeButtonRef.current.contains(event.target as Node) &&
                floatingPanelRef.current && !floatingPanelRef.current.contains(event.target as Node)
            ) {
                setIsEditMode(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isEditMode]);

    const showToast = useCallback((status: SaveStatus, text?: string) => {
        setToastText(text);
        setSaveStatus(status);
        setTimeout(() => {
            setSaveStatus('idle');
            setToastText(undefined);
        }, status === 'saved' ? 2000 : 5000);
    }, []);

    const fetchData = useCallback(async () => {
        if (!stockId) return;
        setLoading(true);
        setError(null);
        try {
            // Fetch all data in parallel
            const [stockRes, metricsRes, valuesRes, periodsRes] = await Promise.all([
                supabase.from('watchlist').select('*').eq('id', stockId).single(),
                supabase.from('financial_metric').select('*, financial_subsegment(*)').eq('stock_id', stockId).order('display_order'),
                supabase.from('financial_values').select('*').eq('stock_id', stockId),
                supabase.from('financial_period').select('*').eq('stock_id', stockId)
            ]);
    
            if (stockRes.error) throw stockRes.error;
            setStock(stockRes.data);
    
            // Process metrics and link values
            const metricsData = metricsRes.data || [];
            const valuesData = valuesRes.data || [];
    
            const stitchedMetrics = metricsData.map(metric => {
                const subsegmentsWithValues = (metric.financial_subsegment || []).map(sub => ({
                    ...sub,
                    financial_values: valuesData.filter(v => v.subsegment_id === sub.id)
                })).sort((a, b) => a.display_order - b.display_order);
                
                return {
                    ...metric,
                    financial_subsegments: subsegmentsWithValues,
                    financial_values: valuesData.filter(v => v.metric_id === metric.id && v.subsegment_id === null),
                };
            });
            setMetrics(stitchedMetrics as FinancialMetric[]);
    
            if (periodsRes.error) throw periodsRes.error;
            const sortedPeriods = (periodsRes.data || []).sort((a, b) => a.display_order - b.display_order || a.period_label.localeCompare(b.period_label));
            setPeriods(sortedPeriods);
    
        } catch (err) {
            setError(formatErrorMessage('Failed to load financials', err));
        } finally {
            setLoading(false);
        }
    }, [stockId]);

    useEffect(() => { fetchData(); }, [fetchData]);
    
    // FIX: Refactored parent total saving to use the central queue.
    const handleSaveSuccess = useCallback((metricId: string, periodId: string) => {
        // This function is called after a subsegment value is successfully saved.
        // We now update the local state optimistically and queue the parent total save.
        setMetrics(currentMetrics => {
            const newMetrics = JSON.parse(JSON.stringify(currentMetrics));
            const metric = newMetrics.find((m: FinancialMetric) => m.id === metricId);
            if (!metric || metric.financial_subsegments.length === 0) {
                return currentMetrics; // Should not happen if called from a subsegment
            }

            // Recalculate the total for the parent metric for the specific period
            const total = metric.financial_subsegments.reduce((sum: number, sub: FinancialSubsegment) => {
                const subVal = sub.financial_values.find((v: FinancialValue) => v.period_id === periodId)?.metric_value || 0;
                return sum + subVal;
            }, 0);

            // Update the value in our local state for immediate UI feedback
            let parentValueUpdated = false;
            metric.financial_values = metric.financial_values.map((v: FinancialValue) => {
                if (v.period_id === periodId && v.subsegment_id === null) {
                    parentValueUpdated = true;
                    return { ...v, metric_value: total };
                }
                return v;
            });
            if (!parentValueUpdated) {
                // If no value existed before, create one locally. The queue will upsert it.
                metric.financial_values.push({
                    id: crypto.randomUUID(), // Temp ID for local state
                    stock_id: stockId,
                    metric_id: metricId,
                    period_id: periodId,
                    subsegment_id: null,
                    metric_value: total,
                });
            }
            
            // Queue the save operation for the parent total.
            // The debouncing in the queue will handle rapid updates efficiently.
            const uniqueId = `${stockId}-${metricId}-${periodId}-null`;
            addToQueue({
                id: uniqueId,
                stock_id: stockId,
                metric_id: metricId,
                period_id: periodId,
                subsegment_id: null,
                metric_value: total,
            });
            
            return newMetrics;
        });
    }, [stockId, addToQueue]);
    
    const handleNameUpdate = async (type: 'metric' | 'sub' | 'period', id: string, newName: string) => {
        const table = type === 'metric' ? 'financial_metric' : type === 'sub' ? 'financial_subsegment' : 'financial_period';
        const nameField = type === 'metric' ? 'metric_name' : type === 'sub' ? 'subsegment_name' : 'period_label';
        
        const isDuplicate = type === 'period' && periods.some(p => p.id !== id && p.period_label === newName);
        if (isDuplicate) {
            showToast('error', `Period "${newName}" already exists.`);
            const oldName = periods.find(p => p.id === id)?.period_label;
            if(oldName) setPeriods(prev => prev.map(p => p.id === id ? {...p, period_label: oldName} : p));
            return;
        }

        showToast('saving', `Updating ${type}...`);
        const { error } = await supabase.from(table).update({ [nameField]: newName }).match({ id });
        if (error) {
            showToast('error', formatErrorMessage(`Failed to update ${type}`, error));
            fetchData();
        } else { 
            showToast('saved', `${type.charAt(0).toUpperCase() + type.slice(1)} updated`); 
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
        showToast('saving', 'Adding metric...');
        try {
            const { data: newMetricData, error: metricError } = await supabase
                .from('financial_metric')
                .insert({ stock_id: stockId, metric_name: 'New Metric', display_order: metrics.length })
                .select()
                .single();
            if (metricError) throw metricError;
            if (!newMetricData) throw new Error("Failed to get data for new metric.");
    
            if (periods.length > 0) {
                 for (const period of periods) {
                    await saveFinancialValue({
                        id: '', // Not needed for save function
                        stock_id: stockId,
                        metric_id: newMetricData.id,
                        period_id: period.id,
                        subsegment_id: null,
                        metric_value: null,
                    });
                }
            }
    
            const newMetric: FinancialMetric = { ...newMetricData, financial_subsegments: [], financial_values: [] };
            setMetrics(prev => [...prev, newMetric]);
            showToast('saved', 'Metric added successfully.');
        } catch (err) {
            showToast('error', formatErrorMessage('Failed to add metric', err));
            await fetchData();
        }
    };

    const addSubsegment = async (metric_id: string) => {
        const parentMetric = metrics.find(m => m.id === metric_id);
        if (!parentMetric) return;
    
        showToast('saving', 'Adding sub-segment...');
        try {
            const isFirstSubsegment = parentMetric.financial_subsegments.length === 0;
    
            const { data: newSubData, error: insertError } = await supabase.from('financial_subsegment').insert({ metric_id, subsegment_name: 'New Sub-segment', display_order: parentMetric.financial_subsegments.length }).select().single();
            if (insertError) throw insertError;
            if (!newSubData) throw new Error("No data returned for new sub-segment.");
    
            const newSub: FinancialSubsegment = { ...newSubData, financial_values: [] };
    
            if (isFirstSubsegment && parentMetric.financial_values.length > 0) {
                const valuesToMove = parentMetric.financial_values
                    .filter(v => v.metric_value !== null && v.metric_value !== 0)
                    .map(({ id, created_at, updated_at, ...rest }) => ({ ...rest, subsegment_id: newSubData.id }));
                
                if (valuesToMove.length > 0) {
                    for (const v of valuesToMove) {
                        await saveFinancialValue({
                            id: '', // Not needed
                            stock_id: v.stock_id,
                            metric_id: v.metric_id,
                            period_id: v.period_id,
                            subsegment_id: v.subsegment_id,
                            metric_value: v.metric_value,
                        });
                    }
                    newSub.financial_values = valuesToMove.map(v => ({...v, id: crypto.randomUUID(), created_at: new Date().toISOString()}));
                }
            }
    
            setMetrics(prevMetrics => prevMetrics.map(m => {
                if (m.id === metric_id) {
                    const updatedMetric = { ...m, financial_subsegments: [...m.financial_subsegments, newSub] };
                    if (isFirstSubsegment) {
                        updatedMetric.financial_values = newSub.financial_values.map(v => ({...v, subsegment_id: null}));
                    }
                    return updatedMetric;
                }
                return m;
            }));
            showToast('saved', 'Sub-segment added successfully');
        } catch (err) {
            showToast('error', formatErrorMessage('Failed to add sub-segment', err));
            await fetchData();
        }
    };

    const addPeriodHandler = async () => {
        if (!stockId) return;
    
        let newLabel = `Q1 ${new Date().getFullYear()}`;
        const currentPeriods = periods.filter(p => p.period_type === 'quarter');
        if (currentPeriods.length > 0) {
            const latestPeriod = currentPeriods.sort((a,b) => a.period_label.localeCompare(b.period_label)).pop();
            if (latestPeriod) {
                const match = latestPeriod.period_label.match(/Q(\d)\s+(\d{4})/);
                if (match) {
                    let quarter = parseInt(match[1], 10);
                    let year = parseInt(match[2], 10);
                    if (quarter >= 4) {
                        quarter = 1;
                        year += 1;
                    } else {
                        quarter += 1;
                    }
                    newLabel = `Q${quarter} ${year}`;
                }
            }
        }
    
        showToast('saving', 'Adding period...');
        
        const result = await ensurePeriodExistsAndLink({
            stockId,
            periodLabel: newLabel,
            periodType: 'quarter',
            metrics,
        });
    
        if (!result.ok || !result.data) {
            showToast('error', result.error?.message || 'Failed to add period.');
            return;
        }
    
        await fetchData(); // Refresh all data to ensure UI consistency
        setNewlyAddedId(result.data.id);
        showToast('saved', 'Period added successfully');
    };
    
    const deleteItem = async (type: 'metric' | 'sub' | 'period', id: string) => {
        if (!window.confirm(`Are you sure you want to delete this ${type}? This cannot be undone.`)) return;
    
        showToast('saving', `Deleting ${type}...`);
        try {
            if (type === 'metric') {
                const { error } = await supabase.from('financial_metric').delete().eq('id', id);
                if (error) throw error;
    
                setMetrics(prev => prev.filter(m => m.id !== id));
            } else if (type === 'sub') {
                const { error: valueError } = await supabase.from('financial_values').delete().eq('subsegment_id', id);
                if (valueError) throw valueError;
                
                const { error: subDeleteError } = await supabase.from('financial_subsegment').delete().match({ id });
                if (subDeleteError) throw subDeleteError;
                
                await fetchData();
            } else if (type === 'period') {
                const { error } = await supabase.from('financial_period').delete().eq('id', id);
                if (error) throw error;
                await fetchData();
            }
            showToast('saved', `${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully`);
        } catch (err: any) {
            let userMessage = formatErrorMessage(`Failed to delete ${type}`, err);
            if (err.message && err.message.includes('foreign key constraint')) {
                userMessage = `Cannot delete this ${type} because it has linked financial data. Please remove its sub-items first.`;
            }
            showToast('error', userMessage);
        }
    };
    
    const handleToggleMetricSelection = (metricId: string) => {
        setSelectedMetricIds(prev =>
            prev.includes(metricId)
                ? prev.filter(id => id !== metricId)
                : [...prev, metricId]
        );
    };

    const handleDeleteSelectedMetrics = async () => {
        if (selectedMetricIds.length === 0) {
            showToast('error', "No metrics selected to delete.");
            return;
        };

        const confirmed = window.confirm(`Are you sure you want to delete ${selectedMetricIds.length} metric(s)? This cannot be undone.`);
        if (!confirmed) return;
        
        showToast('saving', 'Deleting metrics...');
        try {
            const { error } = await supabase
                .from('financial_metric')
                .delete()
                .in('id', selectedMetricIds);
            
            if (error) throw error;
            
            const newSelectedChartItems = { ...selectedChartItems };
            selectedMetricIds.forEach(id => {
                delete newSelectedChartItems[`metric-${id}`];
            });
            setSelectedChartItems(newSelectedChartItems);

            setMetrics(prev => prev.filter(m => !selectedMetricIds.includes(m.id)));
            setSelectedMetricIds([]);
            showToast('saved', `${selectedMetricIds.length} metric(s) deleted.`);

        } catch (err: any) {
            let userMessage = formatErrorMessage('Failed to delete metrics', err);
            if (err.message && err.message.includes('foreign key constraint')) {
                userMessage = "One or more selected metrics could not be deleted because they have associated financial data.";
            }
            showToast('error', userMessage);
        }
    };

    const {
        quarterlyChartData,
        annualChartData,
        annualPeriods,
        getAnnualValue
    // FIX: This was the start of the truncated section. Completed the useMemo hook and the rest of the component.
    } = useMemo(() => {
        const processData = (periodType: 'quarter' | 'annual') => {
            const filteredPeriods = periods.filter(p => p.period_type === periodType);
            if (filteredPeriods.length === 0) return [];
    
            return filteredPeriods.map(period => {
                const dataPoint: Record<string, string | number> = {
                    period_label: period.period_label
                };
                metrics.forEach(metric => {
                    if (metric.financial_subsegments.length > 0) {
                        const total = metric.financial_subsegments.reduce((sum, sub) => {
                            const value = sub.financial_values.find(v => v.period_id === period.id)?.metric_value ?? 0;
                            dataPoint[`subsegment-${sub.id}`] = value;
                            return sum + (value || 0);
                        }, 0);
                        dataPoint[`metric-${metric.id}`] = total;
                    } else {
                        const value = metric.financial_values.find(v => v.period_id === period.id && v.subsegment_id === null)?.metric_value ?? null;
                        dataPoint[`metric-${metric.id}`] = value as number;
                    }
                });
                return dataPoint;
            });
        };
    
        const quarterlyChartData = processData('quarter');
        const annualChartData = processData('annual');
        const annualPeriods = periods.filter(p => p.period_type === 'annual');
    
        const getAnnualValue = (metricOrSubId: string, periodId: string, isSub: boolean): FinancialValue | undefined => {
            const metricId = isSub ? metrics.find(m => m.financial_subsegments.some(s => s.id === metricOrSubId))?.id : metricOrSubId;
            if (!metricId) return undefined;
            const metric = metrics.find(m => m.id === metricId);
            if (!metric) return undefined;
            if (isSub) {
                const sub = metric.financial_subsegments.find(s => s.id === metricOrSubId);
                return sub?.financial_values.find(v => v.period_id === periodId);
            } else {
                return metric.financial_values.find(v => v.period_id === periodId && !v.subsegment_id);
            }
        };
    
        return { quarterlyChartData, annualChartData, annualPeriods, getAnnualValue };
    }, [metrics, periods]);

    if (loading) return <div className="p-8 text-center text-text-secondary">Loading financials...</div>;
    if (error && !stock) return <div className="p-8 text-center text-danger bg-danger/10 rounded-lg">{error}</div>;
    if (!stock) return <div className="p-8 text-center text-text-secondary">Stock data not found.</div>;

    const currentPeriods = activeTab === 'quarterly' ? periods.filter(p => p.period_type === 'quarter') : annualPeriods;
    const chartData = activeTab === 'quarterly' ? quarterlyChartData : annualChartData;

    return (
        <div className="container mx-auto p-4 md:p-8">
            <Link to={`/stock/${stockId}`} className="inline-flex items-center text-primary mb-6 hover:underline"><ArrowLeft className="w-4 h-4 mr-2" />Back to Business Overview</Link>
            
            <div className="border-b border-accent mb-8">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <Link to={`/stock/${stockId}`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Business Overview</Link>
                    <Link to={`/stock/${stockId}/financials`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-primary text-primary">Financials</Link>
                    <Link to={`/stock/${stockId}/earning-call-story`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Earning Call Story</Link>
                    <Link to={`/stock/${stockId}/valuation`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Valuation</Link>
                </nav>
            </div>
            <header className="mb-8">
                <h1 className="text-5xl font-bold">{stock.symbol} - Financials</h1>
                <p className="text-xl text-text-secondary">{stock.company}</p>
            </header>

            <Card>
                <div className="flex justify-between items-center mb-4">
                    <div className="flex gap-1 bg-accent p-1 rounded-lg">
                        <Button variant={activeTab === 'quarterly' ? 'primary' : 'secondary'} size="sm" onClick={() => setActiveTab('quarterly')}>Quarterly</Button>
                        <Button variant={activeTab === 'annual' ? 'primary' : 'secondary'} size="sm" onClick={() => setActiveTab('annual')}>Annual</Button>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-text-secondary">Chart Type:</span>
                        <Button variant={chartType === 'bar' ? 'primary' : 'secondary'} size="sm" onClick={() => setChartType('bar')}><BarChartIcon className="w-4 h-4"/></Button>
                        <Button variant={chartType === 'line' ? 'primary' : 'secondary'} size="sm" onClick={() => setChartType('line')}><LineChartIcon className="w-4 h-4"/></Button>
                    </div>
                </div>
                <div style={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>
                        <ComposedChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="period_label" stroke="#d1d5db" />
                            <YAxis stroke="#d1d5db" tickFormatter={valueFormatter}/>
                            <Tooltip formatter={valueFormatter}/>
                            <Legend />
                            {metrics.map((metric, index) => {
                                if (!selectedChartItems[`metric-${metric.id}`]) return null;
                                const ChartComponent = chartType === 'bar' ? Bar : Line;
                                return <ChartComponent key={metric.id} dataKey={`metric-${metric.id}`} name={metric.metric_name} fill={COLORS[index % COLORS.length]} stroke={COLORS[index % COLORS.length]}>
                                    <LabelList dataKey={`metric-${metric.id}`} position="top" formatter={valueFormatter} style={{ fill: '#d1d5db', fontSize: 12 }} />
                                </ChartComponent>
                            })}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            {activeTab === 'annual' && <ChartSummary annualData={annualChartData} metrics={metrics} selectedChartItems={selectedChartItems} />}
            
            <Card ref={tableCardRef} className="mt-6 overflow-x-auto">
                <div className="flex justify-end mb-4 gap-2">
                    <Button ref={editModeButtonRef} variant={isEditMode ? 'primary' : 'secondary'} size="sm" onClick={() => setIsEditMode(prev => !prev)}>
                        {isEditMode ? 'Done Editing' : 'Edit Names & Periods'}
                    </Button>
                </div>
                
                {isEditMode && selectedMetricIds.length > 0 && (
                     <div ref={floatingPanelRef} className="sticky left-4 z-10 p-2 bg-content-dark rounded-lg shadow-lg w-max flex items-center gap-2 mb-4 border border-accent">
                        <span className="text-sm font-medium">{selectedMetricIds.length} metric(s) selected</span>
                        <Button variant="danger" size="sm" onClick={handleDeleteSelectedMetrics}>Delete</Button>
                     </div>
                )}

                <table className="w-full text-left">
                    <thead>
                        <tr>
                            <th className="sticky left-0 bg-content p-2 min-w-[250px] z-10">Metric</th>
                            {currentPeriods.map(p => (
                                <th key={p.id} className="p-2 text-center min-w-[150px]">
                                    <EditableHeader
                                        id={p.id}
                                        initialValue={p.period_label}
                                        onUpdate={(id, val) => handleNameUpdate('period', id, val)}
                                        forceEditMode={isEditMode}
                                        onDelete={() => deleteItem('period', p.id)}
                                        startInEditMode={newlyAddedId === p.id}
                                        onEditEnd={() => setNewlyAddedId(null)}
                                    />
                                </th>
                            ))}
                            <th className="p-2">
                                <Button size="sm" variant="secondary" onClick={addPeriodHandler}><Plus className="w-4 h-4"/></Button>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {metrics.map(metric => (
                            <React.Fragment key={metric.id}>
                                <tr className="bg-content-dark">
                                    <td className="sticky left-0 bg-content-dark p-2 font-bold flex items-center gap-2">
                                        {isEditMode && (
                                            <input
                                                type="checkbox"
                                                checked={selectedMetricIds.includes(metric.id)}
                                                onChange={() => handleToggleMetricSelection(metric.id)}
                                                className="form-checkbox h-4 w-4 rounded bg-accent border-gray-600 text-primary focus:ring-primary"
                                            />
                                        )}
                                        <input type="checkbox" className="form-checkbox h-4 w-4 rounded bg-accent border-gray-600 text-primary focus:ring-primary" checked={selectedChartItems[`metric-${metric.id}`] || false} onChange={e => setSelectedChartItems(prev => ({...prev, [`metric-${metric.id}`]: e.target.checked}))} />
                                        <div className="flex-1">
                                            <EditableHeader
                                                id={metric.id}
                                                initialValue={metric.metric_name}
                                                onUpdate={(id, val) => handleNameUpdate('metric', id, val)}
                                                forceEditMode={isEditMode}
                                                onDelete={() => deleteItem('metric', metric.id)}
                                                isMetric
                                            />
                                        </div>
                                    </td>
                                    {currentPeriods.map(p => {
                                        const value = metric.financial_values.find(v => v.period_id === p.id && v.subsegment_id === null);
                                        return <td key={p.id} className="p-0 border-l border-accent"><FinancialInput stockId={stockId} metricId={metric.id} periodId={p.id} defaultValue={value?.metric_value ?? null} disabled={metric.financial_subsegments.length > 0} /></td>;
                                    })}
                                    <td className="p-2 border-l border-accent">
                                        <Button size="sm" variant="secondary" onClick={() => addSubsegment(metric.id)}><Plus className="w-4 h-4"/></Button>
                                    </td>
                                </tr>
                                {metric.financial_subsegments.map(sub => (
                                    <tr key={sub.id}>
                                        <td className="sticky left-0 bg-content pl-10 p-2 flex items-center">
                                            <EditableHeader
                                                id={sub.id}
                                                initialValue={sub.subsegment_name}
                                                onUpdate={(id, val) => handleNameUpdate('sub', id, val)}
                                                forceEditMode={isEditMode}
                                                onDelete={() => deleteItem('sub', sub.id)}
                                                isMetric
                                            />
                                        </td>
                                        {currentPeriods.map(p => {
                                            const value = sub.financial_values.find(v => v.period_id === p.id);
                                            return <td key={p.id} className="p-0 border-l border-accent"><FinancialInput stockId={stockId} metricId={metric.id} periodId={p.id} subsegmentId={sub.id} defaultValue={value?.metric_value ?? null} onSaveSuccess={() => handleSaveSuccess(metric.id, p.id)} /></td>;
                                        })}
                                        <td className="border-l border-accent"></td>
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
                <div className="mt-4">
                    <Button onClick={addMetric}><Plus className="w-4 h-4 mr-2"/>Add Metric</Button>
                </div>
            </Card>

            <Toast status={saveStatus} message={toastText} />
        </div>
    );
};

const FinancialsPage: React.FC = () => {
    return (
        <MetricSaveProvider>
            <FinancialsPageContent />
        </MetricSaveProvider>
    );
};

export default FinancialsPage;
