import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { WatchlistItem, FinancialMetric, FinancialSubsegment, FinancialValue, FinancialPeriod } from '../types';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { debounce } from 'lodash';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Toast, { SaveStatus } from '../components/ui/Toast';
import { ArrowLeft, Plus, Trash2, LineChart as LineChartIcon, BarChart as BarChartIcon, Loader2 } from 'lucide-react';
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

const FinancialsPage: React.FC = () => {
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
    
    const debouncedSave = useCallback(debounce(async (payloads: Partial<FinancialValue>[]) => {
        setSaveStatus('saving');
        try {
            for (const payload of payloads) {
                const { stock_id, metric_id, period_id, subsegment_id, value } = payload;
    
                if (!stock_id || !metric_id || !period_id) continue;
    
                let checkQuery = supabase
                    .from('financial_values')
                    .select('id')
                    .eq('stock_id', stock_id)
                    .eq('metric_id', metric_id)
                    .eq('period_id', period_id);
    
                if (subsegment_id) {
                    checkQuery = checkQuery.eq('subsegment_id', subsegment_id);
                } else {
                    checkQuery = checkQuery.is('subsegment_id', null);
                }
    
                const { data: existing, error: checkError } = await checkQuery;
    
                if (checkError) {
                    throw new Error(`DB check failed: ${checkError.message}`);
                }
    
                if (existing && existing.length > 0) {
                    // Found at least one record, update the first one to handle duplicates gracefully.
                    const { error: updateError } = await supabase
                        .from('financial_values')
                        .update({ value })
                        .eq('id', existing[0].id);
    
                    if (updateError) {
                        throw new Error(`Update failed: ${updateError.message}`);
                    }
                } else {
                    // No record found, insert a new one if value is not null/undefined
                    if (value !== null && value !== undefined) {
                        const { error: insertError } = await supabase
                            .from('financial_values')
                            .insert(payload);
                        if (insertError) {
                            throw new Error(`Insert failed: ${insertError.message}`);
                        }
                    }
                }
            }
            showToast('saved', 'Changes saved');
        } catch (err) {
            showToast('error', formatErrorMessage('Save failed', err));
        }
    }, 1500), [stockId, showToast]);

    const handleValueChange = (metric_id: string, subsegment_id: string | null, period_id: string, valueStr: string) => {
        const value = valueStr === '' ? null : parseFloat(valueStr);
        if (valueStr !== '' && isNaN(value as number)) return;

        const newMetrics = JSON.parse(JSON.stringify(metrics));
        const payloadsToSave: Partial<FinancialValue>[] = [];
        
        const metric = newMetrics.find((m: FinancialMetric) => m.id === metric_id);
        if (!metric) return;

        const mainPayload: Partial<FinancialValue> = { stock_id: stockId, metric_id, subsegment_id, period_id, value };
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

            const parentMetricPayload: Partial<FinancialValue> = { stock_id: stockId, metric_id, subsegment_id: null, period_id, value: total };
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
            debouncedSave(payloadsToSave);
        }
    };
    
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

        setSaveStatus('saving');
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
        setSaveStatus('saving');
        const { data, error } = await supabase.from('financial_metric').insert({ stock_id: stockId, metric_name: 'New Metric', display_order: metrics.length }).select().single();
        if (error) { showToast('error', formatErrorMessage('Failed to add metric', error)); return; }
        if (!data) { showToast('error', 'Failed to add metric: No data returned from server.'); return; }
        const newMetric: FinancialMetric = { ...data, financial_subsegments: [], financial_values: [] };
        setMetrics(prev => [...prev, newMetric]);
        showToast('saved', 'Metric added successfully');
    };

    const addSubsegment = async (metric_id: string) => {
        await debouncedSave.flush();
        const parentMetric = metrics.find(m => m.id === metric_id);
        if (!parentMetric) return;
    
        setSaveStatus('saving');
        try {
            const isFirstSubsegment = parentMetric.financial_subsegments.length === 0;
    
            const { data: newSubData, error: insertError } = await supabase.from('financial_subsegment').insert({ metric_id, subsegment_name: 'New Sub-segment', display_order: parentMetric.financial_subsegments.length }).select().single();
            if (insertError) throw insertError;
            if (!newSubData) throw new Error("No data returned for new sub-segment.");
    
            const newSub: FinancialSubsegment = { ...newSubData, financial_values: [] };
    
            if (isFirstSubsegment && parentMetric.financial_values.length > 0) {
                // Copy parent's values to the new sub-segment.
                const valuesToMove = parentMetric.financial_values
                    .filter(v => v.value !== null && v.value !== 0)
                    .map(({ id, created_at, ...rest }) => ({ ...rest, subsegment_id: newSubData.id }));
                
                if (valuesToMove.length > 0) {
                    const { error: valuesInsertError } = await supabase.from('financial_values').insert(valuesToMove);
                    if (valuesInsertError) throw valuesInsertError;
                    
                    // Eagerly update local state object
                    newSub.financial_values = valuesToMove.map(v => ({...v, id: crypto.randomUUID(), created_at: new Date().toISOString()}));
                }
            }
    
            // Update local state to reflect the new structure.
            setMetrics(prevMetrics => prevMetrics.map(m => {
                if (m.id === metric_id) {
                    const updatedMetric = { ...m, financial_subsegments: [...m.financial_subsegments, newSub] };
                    // If this was the first subsegment, the parent's values are now derived.
                    // Its local state should reflect the sum (which is just the new subsegment's value).
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
            await fetchData(); // Refetch to ensure consistency on error
        }
    };

    const addPeriod = async () => {
        if (!stockId) return;
        const newLabel = `Q${(periods.length % 4) + 1} ${new Date().getFullYear() + Math.floor(periods.length / 4)}`;
        setSaveStatus('saving');
        const { data, error } = await supabase.from('financial_period').insert({ stock_id: stockId, period_label: newLabel, period_type: 'quarter', display_order: periods.length }).select().single();
        if (error) { showToast('error', formatErrorMessage('Failed to add period', error)); return; }
        if (!data) { showToast('error', 'Failed to add period: No data returned from server.'); return; }
        setPeriods(prev => [...prev, data]);
        setNewlyAddedId(data.id);
        showToast('saved', 'Period added successfully');
    };
    
    const deleteItem = async (type: 'metric' | 'sub' | 'period', id: string) => {
        alert(`✅ Remove button clicked for ${type}!`);
        console.log(`Remove button triggered for ${type}: ${id}`);
        if (!window.confirm(`Are you sure you want to delete this ${type}? This cannot be undone.`)) return;
    
        setSaveStatus('saving');
        try {
            if (type === 'metric') {
                // This simplified logic directly attempts to delete the metric.
                // If it fails due to a foreign key constraint (i.e., it has linked data),
                // the catch block below will handle the specific error message as requested.
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
                const { error } = await supabase.from('financial_period').delete().match({ id });
                if (error) throw error;
                
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
            showToast('saved', `${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully`);
        } catch (err: any) {
            let userMessage = formatErrorMessage(`Failed to delete ${type}`, err);
            if (err.message && err.message.includes('foreign key constraint')) {
                userMessage = `Cannot delete this ${type} because it has linked financial data.`;
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
        alert("✅ Remove button clicked!");
        console.log("Remove button triggered successfully");

        if (selectedMetricIds.length === 0) {
            alert("No metrics selected to delete.");
            return;
        };

        const confirmed = window.confirm(`Are you sure you want to delete ${selectedMetricIds.length} metric(s)? This cannot be undone.`);
        if (!confirmed) return;
        
        setSaveStatus('saving');
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
            showToast('saved', 'Deleted successfully.');

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
    } = useMemo(() => {
        const getYear = (p: string): string | null => {
            const match = p.match(/\b(\d{4})\b/);
            return match ? match[1] : null;
        };

        const quarterlyData = periods.map((p: FinancialPeriod) => {
            const entry: Record<string, string | number> = { period_label: p.period_label };
            metrics.forEach((m: FinancialMetric) => {
                if (m.financial_subsegments.length > 0) {
                    m.financial_subsegments.forEach((s: FinancialSubsegment) => { 
                        entry[`subsegment-${s.id}`] = s.financial_values.find(v => v.period_id === p.id)?.value ?? 0; 
                    });
                } else {
                    entry[`metric-${m.id}`] = m.financial_values.find(v => v.period_id === p.id && !v.subsegment_id)?.value ?? 0;
                }
            });
            return entry;
        });
        
        const uniqueYears = [...new Set(periods.map((p: FinancialPeriod) => getYear(p.period_label)).filter((y): y is string => y !== null))].sort();
        const annualPeriodsForTable = uniqueYears.map((year: string) => ({ id: year, period_label: year, display_order: parseInt(year), period_type: 'annual' as 'annual', created_at: '' }));
        const aggregatedValues: Record<string, Record<string, number>> = {}; // { [metric/sub_id]: { [year]: value } }

        metrics.forEach((metric: FinancialMetric) => {
            aggregatedValues[metric.id] = {};
            metric.financial_subsegments.forEach((sub: FinancialSubsegment) => {
                aggregatedValues[sub.id] = {};
            });
            uniqueYears.forEach((year: string) => {
                let metricTotalForYear = 0;
                const hasSubsegments = metric.financial_subsegments.length > 0;
                metric.financial_subsegments.forEach((sub: FinancialSubsegment) => {
                    let subTotalForYear = 0;
                    periods.forEach((period: FinancialPeriod) => {
                        if (getYear(period.period_label) === year) {
                            const val = sub.financial_values.find(v => v.period_id === period.id)?.value || 0;
                            subTotalForYear += val;
                        }
                    });
                    aggregatedValues[sub.id][year] = subTotalForYear;
                    metricTotalForYear += subTotalForYear;
                });
                if (!hasSubsegments) {
                    periods.forEach((period: FinancialPeriod) => {
                        if (getYear(period.period_label) === year) {
                            const val = metric.financial_values.find(v => v.period_id === period.id && !v.subsegment_id)?.value || 0;
                            metricTotalForYear += val;
                        }
                    });
                }
                aggregatedValues[metric.id][year] = metricTotalForYear;
            });
        });

        const annualDataForChart = uniqueYears.map((year: string) => {
            const entry: Record<string, string | number> = { period_label: year };
            metrics.forEach((m: FinancialMetric) => {
                if (m.financial_subsegments.length > 0) {
                    m.financial_subsegments.forEach((s: FinancialSubsegment) => {
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

    const chartDataSource = activeTab === 'quarterly' ? quarterlyChartData : annualChartData;

    const renderStackTotalLabel = (props: any, metric: FinancialMetric) => {
        const { x, y, width, height, index } = props;
        if (height < 10) return null; // Don't render for tiny bars

        const dataPoint = chartDataSource[index];
        if (!dataPoint) return null;

        const total = metric.financial_subsegments.reduce((acc, sub) => {
            const value = dataPoint[`subsegment-${sub.id}`];
            return acc + (typeof value === 'number' ? value : 0);
        }, 0);

        if (total === 0) return null;

        return (
            <text x={x + width / 2} y={y - 6} fill="#d1d5db" textAnchor="middle" dominantBaseline="middle" fontSize={12}>
                {valueFormatter(total)}
            </text>
        );
    };
    
    if (loading) return <div className="p-8 text-center text-text-secondary">Loading Financials...</div>;
    if (error && !stock) return <div className="p-8 text-center text-danger bg-danger/10 rounded-lg">{error}</div>;

    const tablePeriods = activeTab === 'quarterly' ? periods : annualPeriods;
    
    return (
        <div className="container mx-auto p-4 md:p-8">
            <div
                ref={floatingPanelRef}
                className={`fixed top-24 right-8 z-50 bg-content rounded-lg shadow-lg p-3 flex items-center gap-4 transition-all duration-300 transform-gpu ${isEditMode && selectedMetricIds.length > 0 ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0 pointer-events-none'}`}>
                <span className="font-semibold">{selectedMetricIds.length} selected</span>
                <Button
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        handleDeleteSelectedMetrics();
                    }}
                    variant="danger"
                    size="sm"
                    disabled={saveStatus === 'saving'}
                >
                     {saveStatus === 'saving' ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Trash2 className="w-4 h-4 mr-2" />}
                    Delete Selected
                </Button>
            </div>

            <Link to="/" className="inline-flex items-center text-primary mb-6 hover:underline"><ArrowLeft className="w-4 h-4 mr-2" />Back to Watchlist</Link>
            
            <div className="border-b border-accent mb-8">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <Link to={`/stock/${stockId}`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Business Overview</Link>
                    <Link to={`/stock/${stockId}/financials`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-primary text-primary">Financials</Link>
                    <Link to={`/stock/${stockId}/earning-call-story`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Earning Call Story</Link>
                    <Link to={`/stock/${stockId}/valuation`} className="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300">Valuation</Link>
                </nav>
            </div>

            <header className="flex flex-wrap justify-between items-center mb-8 gap-4">
                <div>
                    <h1 className="text-5xl font-bold">{stock?.symbol} - Financials</h1>
                    <p className="text-xl text-text-secondary">{stock?.company}</p>
                </div>
                 <Button ref={editModeButtonRef} onClick={() => setIsEditMode(!isEditMode)} variant={isEditMode ? 'primary' : 'secondary'}>
                    {isEditMode ? 'Done' : 'Custom Metrics'}
                </Button>
            </header>

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
                    <ResponsiveContainer>{(chartDataSource.length > 0 && metrics.length > 0) ? <ComposedChart data={chartDataSource} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis dataKey="period_label" stroke="#d1d5db" /><YAxis stroke="#d1d5db" tickFormatter={valueFormatter} /><Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} formatter={(value) => valueFormatter(value)} /><Legend />{metrics.filter(m => selectedChartItems[`metric-${m.id}`]).map((m, i) => (chartType === 'bar' ? (m.financial_subsegments.length > 0 ? (m.financial_subsegments.map((s, j) => <Bar key={s.id} dataKey={`subsegment-${s.id}`} name={s.subsegment_name} stackId={m.id} fill={COLORS[(i*3 + j) % COLORS.length]}>{j === m.financial_subsegments.length - 1 && (<LabelList content={(props: any) => renderStackTotalLabel(props, m)} />)}</Bar>)) : <Bar key={m.id} dataKey={`metric-${m.id}`} name={m.metric_name} fill={COLORS[i % COLORS.length]}><LabelList dataKey={`metric-${m.id}`} position="top" formatter={valueFormatter} style={{ fill: '#d1d5db', fontSize: 12 }} /></Bar>) : (m.financial_subsegments.length > 0 ? m.financial_subsegments.map((s, j) => <Line key={s.id} type="monotone" dataKey={`subsegment-${s.id}`} name={s.subsegment_name} stroke={COLORS[(i*3 + j) % COLORS.length]} ><LabelList dataKey={`subsegment-${s.id}`} position="top" formatter={valueFormatter} style={{ fill: '#d1d5db', fontSize: 12 }} offset={5} /></Line>) : <Line key={m.id} type="monotone" dataKey={`metric-${m.id}`} name={m.metric_name} stroke={COLORS[i % COLORS.length]} ><LabelList dataKey={`metric-${m.id}`} position="top" formatter={valueFormatter} style={{ fill: '#d1d5db', fontSize: 12 }} offset={5} /></Line>)))}</ComposedChart> : <div className="flex items-center justify-center h-full text-text-secondary">Add data and select metrics to see the chart.</div>}</ResponsiveContainer>
                </div>
                <ChartSummary annualData={annualChartData} metrics={metrics} selectedChartItems={selectedChartItems} />
            </Card>

            <Card ref={tableCardRef} className={`transition-all duration-300 ${isEditMode ? 'border-2 border-primary shadow-lg shadow-primary/20' : ''}`}>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-left">
                        <thead><tr><th className="p-3 font-semibold sticky left-0 bg-content z-20 min-w-52">Metric / Sub-segment</th>{tablePeriods.map(p => (<th key={p.id} className="p-1 font-semibold text-center w-32">{activeTab === 'quarterly' ? <EditableHeader id={p.id} initialValue={p.period_label} onUpdate={handleNameUpdate.bind(null, 'period')} startInEditMode={p.id === newlyAddedId} onEditEnd={() => setNewlyAddedId(null)} onDelete={deleteItem.bind(null, 'period')} forceEditMode={isEditMode} isSaving={saveStatus === 'saving'} /> : <div className="p-1">{p.period_label}</div>}</th>))}{activeTab === 'quarterly' && <th className="p-1 w-24">{isEditMode && <Button onClick={addPeriod} variant="secondary" className="w-full text-xs"><Plus className="w-3 h-3 mr-1"/>Period</Button>}</th>}</tr></thead>
                        <tbody>
                            {metrics.map(metric => (
                                <React.Fragment key={metric.id}>
                                    <tr className="bg-content/50">
                                        <td className="p-0 font-bold sticky left-0 bg-content z-10 min-w-52">
                                            <div className="flex items-center">
                                                {isEditMode && (
                                                    <label className="pl-3 py-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedMetricIds.includes(metric.id)}
                                                            onChange={() => handleToggleMetricSelection(metric.id)}
                                                            className="form-checkbox h-5 w-5 rounded bg-accent border-gray-600 text-primary focus:ring-primary shrink-0"
                                                        />
                                                    </label>
                                                )}
                                                <div className="flex-grow">
                                                    <EditableHeader
                                                        id={metric.id}
                                                        initialValue={metric.metric_name}
                                                        onUpdate={handleNameUpdate.bind(null, 'metric')}
                                                        onDelete={isEditMode ? undefined : deleteItem.bind(null, 'metric')}
                                                        isMetric
                                                        forceEditMode={isEditMode}
                                                        isSaving={saveStatus === 'saving'}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        {tablePeriods.map(p => <td key={p.id} className="p-1 w-32 text-right pr-3 font-semibold">{metric.financial_subsegments.length > 0 ? (activeTab === 'quarterly' ? valueFormatter(metric.financial_values.find(v => v.period_id === p.id)?.value ?? 0) : valueFormatter(getAnnualValue(metric.id, null, p.period_label))) : (activeTab === 'quarterly' ? <input type="number" step="any" value={metric.financial_values.find(v => v.period_id === p.id)?.value ?? ''} onChange={e => handleValueChange(metric.id, null, p.id, e.target.value)} placeholder="-" className="w-full bg-transparent p-2 text-right rounded hover:bg-accent focus:bg-accent" disabled={!isEditMode}/> : <div className="w-full bg-transparent p-2 text-right rounded">{valueFormatter(getAnnualValue(metric.id, null, p.period_label))}</div>)}</td>)}
                                        {activeTab === 'quarterly' && <td></td>}
                                    </tr>
                                    {metric.financial_subsegments.map(sub => (
                                        <tr key={sub.id} className="hover:bg-accent/20">
                                            <td className="p-2 pl-6 sticky left-0 bg-content z-10 w-52"><EditableHeader id={sub.id} initialValue={sub.subsegment_name} onUpdate={handleNameUpdate.bind(null, 'sub')} onDelete={deleteItem.bind(null, 'sub')} isMetric forceEditMode={isEditMode} isSaving={saveStatus === 'saving'} /></td>
                                            {tablePeriods.map(p => <td key={p.id} className="p-1 w-32">{activeTab === 'quarterly' ? <input type="number" step="any" value={sub.financial_values.find(v => v.period_id === p.id)?.value ?? ''} onChange={e => handleValueChange(metric.id, sub.id, p.id, e.target.value)} placeholder="-" className="w-full bg-transparent p-2 text-right rounded hover:bg-accent focus:bg-accent" disabled={!isEditMode}/> : <div className="w-full bg-transparent p-2 text-right rounded">{valueFormatter(getAnnualValue(metric.id, sub.id, p.period_label))}</div>}</td>)}
                                            {activeTab === 'quarterly' && <td></td>}
                                        </tr>
                                    ))}
                                    {isEditMode && activeTab === 'quarterly' && <tr><td colSpan={periods.length + 2} className="py-1 pl-6"><Button onClick={() => addSubsegment(metric.id)} variant="secondary" className="text-xs px-2 py-1"><Plus className="w-3 h-3 mr-1"/>Add Subsegment</Button></td></tr>}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
                {isEditMode && <div className="mt-4"><Button onClick={addMetric} variant="secondary"><Plus className="w-4 h-4 mr-2"/>Add Metric</Button></div>}
            </Card>
            <Toast status={saveStatus} message={toastText}/>
        </div>
    );
};

export default FinancialsPage;