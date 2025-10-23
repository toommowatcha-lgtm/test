import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { WatchlistItem, FinancialMetric, FinancialSubsegment, FinancialValue, FinancialPeriod } from '../types';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { debounce } from 'lodash';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Toast, { SaveStatus } from '../components/ui/Toast';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { formatErrorMessage } from '../utils/errorHandler';

const COLORS = ['#06b6d4', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#fde047', '#a855f7', '#64748b'];
type ChartType = 'bar' | 'line';
type ActiveTab = 'quarterly' | 'annual';


// Chart Performance Summary Component
const ChartSummary: React.FC<{ displayedData: Record<string, string | number>[], metrics: FinancialMetric[], selectedChartItems: Record<string, boolean> }> = ({ displayedData, metrics, selectedChartItems }) => {
    const getYear = (p: string): number | null => {
        const match = p.match(/\b(\d{4})\b/);
        return match ? parseInt(match[1]) : null;
    };

    const formatPercent = (value: number | null) => {
        if (value === null || !isFinite(value)) return 'N/A';
        const formatted = (value * 100).toFixed(2) + '%';
        const color = value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-text-secondary';
        return <span className={color}>{value > 0 ? '+' : ''}{formatted}</span>;
    };
    
    const summaryData = metrics
      .filter(m => selectedChartItems[`metric-${m.id}`])
      .map(metric => {
         const values = displayedData.map(d => {
            let total = 0;
            if (metric.financial_subsegments.length > 0) {
              total = metric.financial_subsegments.reduce((sum, sub) => sum + ((d[sub.subsegment_name] as number) || 0), 0);
            } else {
              total = (d[metric.metric_name] as number) || 0;
            }
            return { period: d.period_label as string, value: total };
        }).filter(item => item.value !== 0 && isFinite(item.value));


        if (values.length < 2) {
            return { name: metric.metric_name, totalChange: null, cagr: null };
        }

        const first = values[0];
        const last = values[values.length - 1];

        const totalChange = (last.value - first.value) / Math.abs(first.value);
        
        const firstYear = getYear(first.period);
        const lastYear = getYear(last.period);
        let cagr: number | null = null;

        if (firstYear !== null && lastYear !== null && lastYear > firstYear) {
            const numYears = lastYear - firstYear;
            if (first.value > 0) {
              cagr = Math.pow(last.value / first.value, 1 / numYears) - 1;
            }
        }

        return { name: metric.metric_name, totalChange, cagr };
    });

    if (summaryData.length === 0) return null;

    return (
        <Card className="mt-4">
            <h3 className="text-xl font-semibold mb-2">Performance Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                {summaryData.map(data => (
                    <div key={data.name} className="bg-accent p-3 rounded-md">
                        <p className="font-bold text-text-primary">{data.name}</p>
                        <div className="flex justify-between mt-1">
                            <span className="text-text-secondary">Total Change:</span>
                            {formatPercent(data.totalChange)}
                        </div>
                        <div className="flex justify-between mt-1">
                            <span className="text-text-secondary">CAGR:</span>
                            {formatPercent(data.cagr)}
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
};


const FinancialsPage: React.FC = () => {
    const { stockId } = useParams<{ stockId: string }>();
    const [stock, setStock] = useState<WatchlistItem | null>(null);
    const [metrics, setMetrics] = useState<FinancialMetric[]>([]);
    const [periods, setPeriods] = useState<FinancialPeriod[]>([]);
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [selectedChartItems, setSelectedChartItems] = useState<Record<string, boolean>>({});
    const [chartTypes, setChartTypes] = useState<Record<string, ChartType>>({});
    const [activeTab, setActiveTab] = useState<ActiveTab>('quarterly');
    const [newlyAddedPeriodId, setNewlyAddedPeriodId] = useState<number | null>(null);


    const showSaveStatus = (status: SaveStatus, customError?: string) => {
        setSaveStatus(status);
        if (customError) setError(customError);
        setTimeout(() => setSaveStatus('idle'), status === 'saved' ? 2000 : 5000);
    };

    const fetchData = useCallback(async (showLoading = true) => {
        if (!stockId) return;
        if (showLoading) setLoading(true);
        setError(null);
        try {
            const [stockRes, metricsRes, valuesRes, periodsRes] = await Promise.all([
                supabase.from('watchlist').select('*').eq('id', stockId).single(),
                supabase.from('financial_metric').select('*, financial_subsegment(*)').eq('stock_id', stockId).order('display_order'),
                supabase.from('financial_values').select('*').eq('stock_id', stockId),
                supabase.from('financial_period').select('*').eq('stock_id', stockId).order('display_order'),
            ]);
            
            if (stockRes.error) throw stockRes.error;
            setStock(stockRes.data);

            if (periodsRes.error) throw periodsRes.error;
            setPeriods(periodsRes.data || []);

            const metricsData = metricsRes.data || [];
            const valuesData = valuesRes.data || [];

            // Stitch data together
            const stitchedMetrics = metricsData.map(metric => {
                const metricSubsegments = (metric.financial_subsegment || []).map((sub: any) => ({
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
            if (showLoading) setLoading(false);
        }
    }, [stockId]);

    useEffect(() => {
        fetchData();
    }, [stockId, fetchData]);
    
    const debouncedSave = useCallback(debounce(async (table: string, data: any, conflictField?: string) => {
        setSaveStatus('saving');
        try {
            const query = conflictField 
                ? supabase.from(table).upsert(data, { onConflict: conflictField })
                : supabase.from(table).upsert(data);

            const { error: upsertError } = await query;
            if (upsertError) throw upsertError;
            showSaveStatus('saved');
        } catch (err) {
            showSaveStatus('error', formatErrorMessage('Save failed', err));
        }
    }, 1500), []);

    const handleValueChange = (metric_id: number, subsegment_id: number | null, period_id: number, valueStr: string) => {
        const value = valueStr === '' ? null : parseFloat(valueStr);
        if (isNaN(value as number) && value !== null) return;
        
        const valuePayload = { stock_id: stockId, metric_id, subsegment_id, period_id, value };
        
        setMetrics(prev => prev.map(m => {
          if (m.id !== metric_id) return m;
          const target = subsegment_id ? m.financial_subsegments.find(s => s.id === subsegment_id) : m;
          if (!target) return m;

          const valueIndex = target.financial_values.findIndex(v => v.period_id === period_id);
          if (valueIndex > -1) {
            target.financial_values[valueIndex].value = value;
          } else {
            target.financial_values.push({ id: Date.now(), ...valuePayload });
          }
          return { ...m };
        }));

        debouncedSave('financial_values', valuePayload, 'stock_id,metric_id,subsegment_id,period_id');
    };
    
    const handlePeriodLabelUpdate = async (id: number, newLabel: string) => {
        let finalLabel = newLabel;
        const isDuplicate = periods.some(p => p.id !== id && p.period_label === finalLabel);
        if (isDuplicate) {
            finalLabel = `${newLabel} (2)`;
        }

        setSaveStatus('saving');
        const { error } = await supabase
            .from('financial_period')
            .update({ period_label: finalLabel })
            .match({ id });

        if (error) {
            showSaveStatus('error', formatErrorMessage('Failed to update period', error));
        } else {
            showSaveStatus('saved');
            setPeriods(prev => prev.map(p => p.id === id ? { ...p, period_label: finalLabel } : p));
        }
    };

    const handleNameChange = (type: 'metric' | 'sub', id: number, newName: string) => {
        const table = type === 'metric' ? 'financial_metric' : 'financial_subsegment';
        const nameField = type === 'metric' ? 'metric_name' : 'subsegment_name';
        debouncedSave(table, { id, [nameField]: newName });
    }

    const addMetric = async () => {
        if (!stockId) return;
        const { data, error } = await supabase.from('financial_metric').insert({ stock_id: stockId, metric_name: 'New Metric', display_order: metrics.length }).select().single();
        if (error) { showSaveStatus('error', formatErrorMessage('Failed to add metric', error)); return; }
        
        const newValues = periods.map(p => ({ stock_id: stockId, metric_id: data.id, subsegment_id: null, period_id: p.id, value: null }));
        if (newValues.length > 0) {
          const { error: valueError } = await supabase.from('financial_values').insert(newValues);
          if (valueError) showSaveStatus('error', formatErrorMessage('Failed to create values', valueError));
        }
        await fetchData(false);
    };

    const addSubsegment = async (metric_id: number) => {
        const parentMetric = metrics.find(m => m.id === metric_id);
        if (!parentMetric || !stockId) return;
        
        if (parentMetric.financial_subsegments.length === 0) {
            await supabase.from('financial_values').delete().match({ metric_id: metric_id, subsegment_id: null });
        }
        
        const display_order = parentMetric.financial_subsegments.length;
        const { data, error } = await supabase.from('financial_subsegment').insert({ metric_id, subsegment_name: 'New Sub-segment', display_order }).select().single();
        if (error || !data) { showSaveStatus('error', formatErrorMessage('Failed to add sub-segment', error)); return; }
        
        const newValues = periods.map(p => ({ stock_id: stockId, metric_id, subsegment_id: data.id, period_id: p.id, value: null }));
        if (newValues.length > 0) {
          const { error: valueError } = await supabase.from('financial_values').insert(newValues);
          if (valueError) showSaveStatus('error', formatErrorMessage('Failed to create values', valueError));
        }
        await fetchData(false);
    };

    const addPeriod = async () => {
        if (!stockId) return;

        let nextLabel = "New Period";
        const lastPeriod = periods.length > 0 ? periods[periods.length - 1] : null;

        if (lastPeriod) {
            const qMatch = lastPeriod.period_label.match(/^Q([1-4])\s(\d{4})$/);
            if (qMatch) {
                let quarter = parseInt(qMatch[1]);
                let year = parseInt(qMatch[2]);
                quarter = quarter === 4 ? 1 : quarter + 1;
                year = quarter === 1 ? year + 1 : year;
                nextLabel = `Q${quarter} ${year}`;
            } else {
                let counter = 1;
                while (periods.some(p => p.period_label === nextLabel)) {
                    nextLabel = `New Period ${counter++}`;
                }
            }
        } else {
             nextLabel = `Q1 ${new Date().getFullYear()}`;
        }

        setSaveStatus('saving');
        const { data: newPeriod, error: periodError } = await supabase
            .from('financial_period')
            .insert({ stock_id: stockId, period_label: nextLabel, display_order: periods.length })
            .select()
            .single();
        
        if (periodError || !newPeriod) {
            showSaveStatus('error', formatErrorMessage('Failed to add period', periodError));
            return;
        }

        const newValuePlaceholders: Omit<FinancialValue, 'id' | 'created_at'>[] = metrics.flatMap(metric => 
            metric.financial_subsegments.length > 0
                ? metric.financial_subsegments.map(sub => ({ stock_id: stockId, metric_id: metric.id, subsegment_id: sub.id, period_id: newPeriod.id, value: null }))
                : [{ stock_id: stockId, metric_id: metric.id, subsegment_id: null, period_id: newPeriod.id, value: null }]
        );

        if (newValuePlaceholders.length > 0) {
            const { error: valuesError } = await supabase.from('financial_values').insert(newValuePlaceholders);
            if (valuesError) {
                showSaveStatus('error', formatErrorMessage('Failed to create values for new period', valuesError));
            }
        }
        showSaveStatus('saved');
        setNewlyAddedPeriodId(newPeriod.id);
        await fetchData(false);
    };
    
    const deleteMetric = async (id: number) => {
        if (!confirm('Delete this entire metric and all its data?')) return;
        const { error } = await supabase.from('financial_metric').delete().match({ id });
        if (error) showSaveStatus('error', formatErrorMessage('Failed to delete', error));
        else fetchData(false);
    }

    const deleteSubsegment = async (id: number) => {
        if (!confirm('Delete this sub-segment?')) return;
        const { error } = await supabase.from('financial_subsegment').delete().match({ id });
        if (error) showSaveStatus('error', formatErrorMessage('Failed to delete', error));
        else fetchData(false);
    }
    
    const calculateMetricTotalForPeriod = (metric: FinancialMetric, periodId: number) => {
        return metric.financial_subsegments.reduce((total, sub) => {
            const value = sub.financial_values.find(v => v.period_id === periodId)?.value || 0;
            return total + value;
        }, 0);
    };
    
    const { chartData, annualData } = useMemo(() => {
        const quarterlyChartData = periods.map(period => {
            const entry: Record<string, string | number> = { period_label: period.period_label };
            metrics.forEach(m => {
                if (m.financial_subsegments.length > 0) {
                    m.financial_subsegments.forEach(s => {
                        entry[s.subsegment_name] = s.financial_values.find(v => v.period_id === period.id)?.value ?? 0;
                    });
                } else {
                    entry[m.metric_name] = m.financial_values.find(v => v.period_id === period.id)?.value ?? 0;
                }
            });
            return entry;
        });

        const groupedByYear: Record<string, Record<string, number | string>> = {};
        quarterlyChartData.forEach(item => {
            const yearMatch = (item.period_label as string).match(/\d{4}$/);
            if (yearMatch) {
                const year = yearMatch[0];
                if (!groupedByYear[year]) groupedByYear[year] = { period_label: year };
                Object.keys(item).forEach(key => {
                    if (key !== 'period_label') {
                        if (!groupedByYear[year][key]) groupedByYear[year][key] = 0;
                        groupedByYear[year][key] = (groupedByYear[year][key] as number) + (item[key] as number);
                    }
                });
            }
        });
        const annualChartData = Object.values(groupedByYear).sort((a,b) => (a.period_label as string).localeCompare((b.period_label as string)));

        return { chartData: quarterlyChartData, annualData: annualChartData };
    }, [metrics, periods]);
    
    const displayedData = activeTab === 'quarterly' ? chartData : annualData;

    if (loading) return <div className="p-8 text-center text-text-secondary">Loading Financials...</div>;
    if (error && !stock) return <div className="p-8 text-center text-danger bg-danger/10 rounded-lg">{error}</div>;

    const valueFormatter = (v: string | number): string => (typeof v === 'number') ? new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(v) : String(v);
    
    const EditablePeriodHeader: React.FC<{ period: FinancialPeriod; onUpdate: (id: number, newLabel: string) => void; startInEditMode: boolean; onEditEnd: () => void; }> = ({ period, onUpdate, startInEditMode, onEditEnd }) => {
        const [isEditing, setIsEditing] = useState(startInEditMode);
        const [label, setLabel] = useState(period.period_label);
        const inputRef = useRef<HTMLInputElement>(null);

        useEffect(() => {
            if (startInEditMode) setIsEditing(true);
        }, [startInEditMode]);

        useEffect(() => {
            if (isEditing && inputRef.current) {
                inputRef.current.focus();
                inputRef.current.select();
            }
        }, [isEditing]);

        const handleBlur = () => {
            setIsEditing(false);
            onEditEnd();
            if (label.trim() && label !== period.period_label) {
                onUpdate(period.id, label.trim());
            } else {
                setLabel(period.period_label);
            }
        };

        const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') inputRef.current?.blur();
            else if (e.key === 'Escape') {
                setLabel(period.period_label);
                setIsEditing(false);
                onEditEnd();
            }
        };

        if (isEditing) {
            return <input ref={inputRef} type="text" value={label} onChange={e => setLabel(e.target.value)} onBlur={handleBlur} onKeyDown={handleKeyDown} className="w-full bg-accent p-1 text-center rounded focus:outline-none focus:ring-2 focus:ring-primary" />;
        }
        return <div onClick={() => setIsEditing(true)} className="p-1 rounded cursor-pointer hover:bg-accent min-h-[34px] flex items-center justify-center">{period.period_label}</div>;
    };


    return (
        <div className="container mx-auto p-4 md:p-8">
            <Link to={`/stock/${stockId}`} className="inline-flex items-center text-primary mb-6 hover:underline"><ArrowLeft className="w-4 h-4 mr-2" />Back to Overview</Link>
            <header className="mb-8"><h1 className="text-5xl font-bold">{stock?.symbol} - Financials</h1><p className="text-xl text-text-secondary">{stock?.company}</p></header>
            
            <Card className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">Chart Controls & Visualization</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-2 mb-4">
                  {metrics.map(metric => (
                    <div key={metric.id}>
                      <label className="flex items-center space-x-2 cursor-pointer font-bold">
                        <input type="checkbox" checked={!!selectedChartItems[`metric-${metric.id}`]} onChange={() => setSelectedChartItems(p => ({...p, [`metric-${metric.id}`]: !p[`metric-${metric.id}`]}))} className="form-checkbox h-5 w-5 rounded bg-accent border-gray-600 text-primary focus:ring-primary"/>
                        <span>{metric.metric_name}</span>
                      </label>
                    </div>
                  ))}
                </div>
                <div style={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>
                        <ComposedChart data={displayedData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="period_label" stroke="#d1d5db" />
                            <YAxis stroke="#d1d5db" tickFormatter={valueFormatter} />
                            <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} formatter={valueFormatter} />
                            <Legend />
                            {metrics.filter(m => selectedChartItems[`metric-${m.id}`]).map((metric, i) => {
                                if (metric.financial_subsegments.length > 0) {
                                    return metric.financial_subsegments.map((sub, j) => (
                                        <Bar key={sub.id} dataKey={sub.subsegment_name} stackId={metric.id} fill={COLORS[(i*3 + j) % COLORS.length]} />
                                    ));
                                } else {
                                    return <Bar key={metric.id} dataKey={metric.metric_name} fill={COLORS[i % COLORS.length]} />;
                                }
                            })}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
                <ChartSummary displayedData={displayedData} metrics={metrics} selectedChartItems={selectedChartItems} />
            </Card>

            <Card>
                <div className="border-b border-accent mb-4"><nav className="-mb-px flex space-x-8"><button onClick={() => setActiveTab('quarterly')} className={`${activeTab === 'quarterly' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'} capitalize whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>Quarterly</button><button onClick={() => setActiveTab('annual')} className={`${activeTab === 'annual' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'} capitalize whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>Annual</button></nav></div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-left">
                        <thead><tr><th className="p-3 font-semibold sticky left-0 bg-content z-20 w-52">Metric / Sub-segment</th>{periods.map(p => (<th key={p.id} className="p-1 font-semibold text-center"><EditablePeriodHeader period={p} onUpdate={handlePeriodLabelUpdate} startInEditMode={p.id === newlyAddedPeriodId} onEditEnd={() => setNewlyAddedPeriodId(null)} /></th>))}</tr></thead>
                        <tbody>
                            {metrics.map(metric => (
                                <React.Fragment key={metric.id}>
                                    <tr className="bg-content hover:bg-content/50 group">
                                        <td className="p-2 font-bold sticky left-0 bg-content z-10 w-52 flex items-center gap-1">
                                            <Button variant="danger" size="sm" className="p-1 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => deleteMetric(metric.id)}><Trash2 className="w-3 h-3"/></Button>
                                            <input type="text" defaultValue={metric.metric_name} onBlur={(e) => handleNameChange('metric', metric.id, e.target.value)} className="w-full bg-transparent p-1 rounded hover:bg-accent focus:bg-accent" />
                                        </td>
                                        {periods.map(p => <td key={p.id} className="p-1">
                                            <input type="number" step="any"
                                                className="w-full bg-transparent p-2 text-right rounded hover:bg-accent focus:bg-accent disabled:text-text-secondary disabled:font-bold disabled:hover:bg-transparent"
                                                disabled={metric.financial_subsegments.length > 0}
                                                defaultValue={metric.financial_subsegments.length > 0 ? calculateMetricTotalForPeriod(metric, p.id) : metric.financial_values.find(v => v.period_id === p.id)?.value ?? ''}
                                                onBlur={(e) => { if (metric.financial_subsegments.length === 0) handleValueChange(metric.id, null, p.id, e.target.value); }}
                                            />
                                        </td>)}
                                    </tr>
                                    {metric.financial_subsegments.map(sub => (
                                        <tr key={sub.id} className="hover:bg-accent/20 group">
                                            <td className="p-2 pl-6 sticky left-0 bg-content z-10 w-52 flex items-center gap-1">
                                                <Button variant="danger" size="sm" className="p-1 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => deleteSubsegment(sub.id)}><Trash2 className="w-3 h-3"/></Button>
                                                <input type="text" defaultValue={sub.subsegment_name} onBlur={(e) => handleNameChange('sub', sub.id, e.target.value)} className="w-full bg-transparent p-1 rounded hover:bg-accent focus:bg-accent"/>
                                            </td>
                                            {periods.map(p => (
                                                <td key={p.id} className="p-1"><input type="number" step="any" defaultValue={sub.financial_values.find(v => v.period_id === p.id)?.value ?? ''} onBlur={(e) => handleValueChange(metric.id, sub.id, p.id, e.target.value)} placeholder="-" className="w-full bg-transparent p-2 text-right rounded hover:bg-accent focus:bg-accent"/></td>
                                            ))}
                                        </tr>
                                    ))}
                                    <tr><td colSpan={periods.length + 1} className="py-1 pl-6"><Button onClick={() => addSubsegment(metric.id)} variant="secondary" size="sm" className="text-xs px-2 py-1"><Plus className="w-3 h-3 mr-1"/>Add Sub-segment</Button></td></tr>
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex gap-4 mt-4">
                  <Button onClick={addMetric} variant="secondary"><Plus className="w-4 h-4 mr-2"/>Add Metric</Button>
                  {activeTab === 'quarterly' && <Button onClick={addPeriod} variant="secondary"><Plus className="w-4 h-4 mr-2"/>Add Period</Button>}
                </div>
            </Card>
            <Toast status={saveStatus} message={error ?? undefined}/>
        </div>
    );
};

export default FinancialsPage;