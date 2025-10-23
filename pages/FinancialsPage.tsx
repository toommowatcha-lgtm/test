import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { WatchlistItem, FinancialMetric } from '../types';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { debounce } from 'lodash';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Toast, { SaveStatus } from '../components/ui/Toast';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { formatErrorMessage } from '../utils/errorHandler';

const COLORS = ['#06b6d4', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#fde047', '#a855f7'];

type ChartType = 'bar' | 'line';
type ActiveTab = 'quarterly' | 'annual';

const FinancialsPage: React.FC = () => {
    const { stockId } = useParams<{ stockId: string }>();
    const [stock, setStock] = useState<WatchlistItem | null>(null);
    const [financials, setFinancials] = useState<FinancialMetric[]>([]);
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [chartMetrics, setChartMetrics] = useState<string[]>([]);
    const [chartTypes, setChartTypes] = useState<Record<string, ChartType>>({});
    const [activeTab, setActiveTab] = useState<ActiveTab>('quarterly');

    const showSaveStatus = (status: SaveStatus, customError?: string) => {
        setSaveStatus(status);
        if (customError) setError(customError);
        setTimeout(() => setSaveStatus('idle'), status === 'saved' ? 2000 : 4000);
    };

    const fetchFinancials = useCallback(async (showLoading = true) => {
        if (!stockId) return;
        if (showLoading) setLoading(true);
        setError(null);
        try {
            const { data: stockData, error: stockError } = await supabase.from('watchlist').select('*').eq('id', stockId).single();
            if (stockError) throw stockError;
            setStock(stockData);

            const { data: financialsData, error: financialsError } = await supabase.from('financials').select('*').eq('stock_id', stockId);
            if (financialsError) throw financialsError;
            
            const data: FinancialMetric[] = financialsData || [];
            setFinancials(data);
            
            if (data.length > 0) {
              // FIX: Using Array.from for better type inference to ensure uniqueMetrics is string[].
              const uniqueMetrics: string[] = Array.from(new Set(data.map(f => f.metric_name))).sort();
              if (chartMetrics.length === 0 && uniqueMetrics.length > 0) {
                 setChartMetrics([uniqueMetrics[0]]);
              }
              setChartTypes(prev => {
                const newTypes = {...prev};
                uniqueMetrics.forEach(m => { if (!newTypes[m]) newTypes[m] = 'bar'; });
                return newTypes;
              });
            }
        } catch (err) {
            setError(formatErrorMessage('Failed to load financials', err));
        } finally {
            if (showLoading) setLoading(false);
        }
    }, [stockId, chartMetrics.length]);

    const saveData = async (records: Partial<FinancialMetric>[]) => {
        if (records.length === 0 || !stockId) return;
        setSaveStatus('saving');
        try {
            const recordsToUpsert = records.map(({ metric_name, period_label, value }) => ({ stock_id: stockId, metric_name, period_label, value }));
            const { error: upsertError } = await supabase.from('financials').upsert(recordsToUpsert, { onConflict: 'stock_id,metric_name,period_label' });
            if (upsertError) throw upsertError;
            
            showSaveStatus('saved');
            await fetchFinancials(false);
        } catch(err) {
            showSaveStatus('error', formatErrorMessage('Save failed', err));
        }
    }
    const debouncedSave = useCallback(debounce(saveData, 1500), [stockId, fetchFinancials]);

    useEffect(() => {
        fetchFinancials();
    }, [fetchFinancials]);

    const dataProcessor = useMemo(() => {
        const quarterlyFinancials = financials.filter(f => /^Q[1-4]\s\d{4}$/.test(f.period_label));
        // FIX: Using Array.from for better type inference to ensure allMetrics is string[].
        const allMetrics: string[] = Array.from(new Set(financials.map(f => f.metric_name))).sort();

        const periodSorter = (a: string, b: string) => {
            const getVal = (p: string) => {
                const qMatch = p.match(/^Q([1-4])\s(\d{4})$/);
                if (qMatch) return parseInt(qMatch[2]) * 4 + parseInt(qMatch[1]);
                const yMatch = p.match(/^(\d{4})$/);
                if (yMatch) return parseInt(yMatch[1]);
                return 0;
            };
            return getVal(a) - getVal(b);
        };

        const quarterlyPeriods = [...new Set(quarterlyFinancials.map(f => f.period_label))].sort(periodSorter);
        const quarterlyDataMap: Record<string, Record<string, FinancialMetric | undefined>> = {};
        quarterlyFinancials.forEach(f => {
            if (!quarterlyDataMap[f.metric_name]) quarterlyDataMap[f.metric_name] = {};
            quarterlyDataMap[f.metric_name][f.period_label] = f;
        });

        // Calculate Annual Summaries
        const annualSummaries: FinancialMetric[] = [];
        const groupedByYearAndMetric: { [key: string]: FinancialMetric[] } = {};
        quarterlyFinancials.forEach(f => {
            const year = f.period_label.split(' ')[1];
            const key = `${f.metric_name}__${year}`;
            if (!groupedByYearAndMetric[key]) groupedByYearAndMetric[key] = [];
            groupedByYearAndMetric[key].push(f);
        });

        for (const key in groupedByYearAndMetric) {
            const group = groupedByYearAndMetric[key];
            if (group.length === 4) {
                const totalValue = group.reduce((sum, item) => sum + (item.value || 0), 0);
                const [metric_name, year] = key.split('__');
                annualSummaries.push({ stock_id: stockId!, metric_name, period_label: year, value: totalValue });
            }
        }
        
        const annualPeriods = [...new Set(annualSummaries.map(f => f.period_label))].sort();
        const annualDataMap: Record<string, Record<string, FinancialMetric | undefined>> = {};
        annualSummaries.forEach(f => {
            if (!annualDataMap[f.metric_name]) annualDataMap[f.metric_name] = {};
            annualDataMap[f.metric_name][f.period_label] = f;
        });
        
        // Prepare chart data based on active tab
        const quarterlyChartData = quarterlyPeriods.map(period => {
            const periodData: { period_label: string; [key: string]: number | string } = { period_label: period };
            chartMetrics.forEach(metric => {
                periodData[metric] = quarterlyDataMap[metric]?.[period]?.value ?? 0;
            });
            return periodData;
        });
        const annualChartData = annualPeriods.map(period => {
            const periodData: { period_label: string; [key: string]: number | string } = { period_label: period };
            chartMetrics.forEach(metric => {
                periodData[metric] = annualDataMap[metric]?.[period]?.value ?? 0;
            });
            return periodData;
        });
        
        const calculateGrowth = (periods: string[], dataMap: Record<string, Record<string, FinancialMetric | undefined>>, isQuarterly: boolean) => {
           return chartMetrics.map(metric => {
                if (periods.length < 2) return { metric, totalChange: 'N/A', cagr: 'N/A' };
                const startPeriod = periods[0];
                const endPeriod = periods[periods.length - 1];
                const startValue = dataMap[metric]?.[startPeriod]?.value;
                const endValue = dataMap[metric]?.[endPeriod]?.value;

                if (typeof startValue !== 'number' || typeof endValue !== 'number' || startValue <= 0) return { metric, totalChange: 'N/A', cagr: 'N/A' };
                
                const totalChange = ((endValue / startValue) - 1) * 100;
                let cagr: number | string = 'N/A';

                if (isQuarterly) {
                    const numQuarters = periods.length;
                    if (numQuarters > 4) { // Need more than a year for CAGR
                        const numYears = numQuarters / 4.0;
                        cagr = (Math.pow(endValue / startValue, 1 / numYears) - 1) * 100;
                    }
                } else { // Annual
                    const numYears = parseInt(endPeriod) - parseInt(startPeriod);
                    if (numYears > 0) {
                        cagr = (Math.pow(endValue / startValue, 1 / numYears) - 1) * 100;
                    }
                }

                return { 
                    metric, 
                    totalChange: `${totalChange.toFixed(2)}%`, 
                    cagr: typeof cagr === 'number' ? `${cagr.toFixed(2)}%` : cagr 
                };
            });
        };
        
        const quarterlyGrowthAnalysis = calculateGrowth(quarterlyPeriods, quarterlyDataMap, true);
        const annualGrowthAnalysis = calculateGrowth(annualPeriods, annualDataMap, false);

        return { allMetrics, quarterlyPeriods, quarterlyDataMap, annualPeriods, annualDataMap, quarterlyChartData, annualChartData, quarterlyGrowthAnalysis, annualGrowthAnalysis };
    }, [financials, chartMetrics, stockId]);

    const handleValueChange = (metric_name: string, period_label: string, valueStr: string) => {
        if (!stockId) return;
        const value = valueStr === '' ? null : parseFloat(valueStr);
        if (isNaN(value as number) && value !== null) return;
        
        const recordToSave: FinancialMetric = { stock_id: stockId, metric_name, period_label, value };
        const newFinancials = [...financials];
        const existingIndex = newFinancials.findIndex(f => f.metric_name === metric_name && f.period_label === period_label);
        if (existingIndex > -1) newFinancials[existingIndex] = { ...newFinancials[existingIndex], ...recordToSave };
        else newFinancials.push(recordToSave);
        setFinancials(newFinancials);
        debouncedSave([recordToSave]);
    };
    
    const handleMetricNameChange = async (oldName: string, newName: string) => {
        if (!stockId || !newName || oldName === newName) return;
        if (dataProcessor.allMetrics.includes(newName)) {
            showSaveStatus('error', 'Metric name must be unique.');
            await fetchFinancials(false); return;
        }
        showSaveStatus('saving');
        const { error: e } = await supabase.from('financials').update({ metric_name: newName }).match({ stock_id: stockId, metric_name: oldName });
        if (e) showSaveStatus('error', formatErrorMessage('Failed to update metric', e));
        else {
            setChartMetrics(prev => prev.map(m => m === oldName ? newName : m));
            setChartTypes(prev => { const n = {...prev}; if(n[oldName]){ n[newName] = n[oldName]; delete n[oldName]; } return n; });
            showSaveStatus('saved');
            await fetchFinancials(false);
        }
    };
    
    const addMetric = async () => {
        if (!stockId) return;
        let newMetricName = "New Metric"; let count = 1;
        while (dataProcessor.allMetrics.includes(newMetricName)) newMetricName = `New Metric ${++count}`;
        const periodsToCreateFor = dataProcessor.quarterlyPeriods.length > 0 ? dataProcessor.quarterlyPeriods : ['Q1 2025'];
        await saveData(periodsToCreateFor.map(p => ({ metric_name: newMetricName, period_label: p, value: 0 })));
        setChartTypes(prev => ({...prev, [newMetricName]: 'bar'}));
    };

    const addPeriod = async () => {
        if (!stockId) return;
        const lastPeriod = dataProcessor.quarterlyPeriods[dataProcessor.quarterlyPeriods.length - 1];
        let newPeriodLabel = 'Q1 2025';
        if (lastPeriod && lastPeriod.match(/^Q[1-4]\s\d{4}$/)) {
            const [q, y] = lastPeriod.split(' ');
            const quarterNum = parseInt(q.slice(1)); const yearNum = parseInt(y);
            newPeriodLabel = quarterNum < 4 ? `Q${quarterNum + 1} ${yearNum}` : `Q1 ${yearNum + 1}`;
        }
        const metricsToCreateFor = dataProcessor.allMetrics.length > 0 ? dataProcessor.allMetrics : ["Revenue"];
        await saveData(metricsToCreateFor.map(m => ({ metric_name: m, period_label: newPeriodLabel, value: 0 })));
    };
    
    const removeMetric = async (metricName: string) => {
        if (!stockId || !confirm(`Delete metric "${metricName}"?`)) return;
        showSaveStatus('saving');
        const { error: e } = await supabase.from('financials').delete().match({ stock_id: stockId, metric_name: metricName });
        if (e) showSaveStatus('error', formatErrorMessage("Failed to delete", e));
        else {
            setChartMetrics(prev => prev.filter(m => m !== metricName));
            showSaveStatus('saved');
            await fetchFinancials(false);
        }
    };

    const removePeriod = async (periodLabel: string) => {
        if (!stockId || !confirm(`Delete period "${periodLabel}"?`)) return;
        showSaveStatus('saving');
        const { error: e } = await supabase.from('financials').delete().match({ stock_id: stockId, period_label: periodLabel });
        if (e) showSaveStatus('error', formatErrorMessage("Failed to delete", e));
        else {
            showSaveStatus('saved');
            await fetchFinancials(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-text-secondary">Loading Financials...</div>;
    if (error && !stock) return <div className="p-8 text-center text-danger bg-danger/10 rounded-lg">{error}</div>;

    const valueFormatter = (v: any) => typeof v === 'number' ? new Intl.NumberFormat('en-US',{notation:'compact',compactDisplay:'short'}).format(v) : '';
    const chartData = activeTab === 'quarterly' ? dataProcessor.quarterlyChartData : dataProcessor.annualChartData;
    const growthAnalysis = activeTab === 'quarterly' ? dataProcessor.quarterlyGrowthAnalysis : dataProcessor.annualGrowthAnalysis;

    return (
        <div className="container mx-auto p-4 md:p-8">
            <Link to={`/stock/${stockId}`} className="inline-flex items-center text-primary mb-6 hover:underline"><ArrowLeft className="w-4 h-4 mr-2" />Back to Overview</Link>
            <header className="mb-8"><h1 className="text-5xl font-bold">{stock?.symbol} - Financials</h1><p className="text-xl text-text-secondary">{stock?.company}</p></header>
            
            <Card className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">Chart Controls</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4">
                  {dataProcessor.allMetrics.map(metric => (
                    <div key={metric}>
                      <label className="flex items-center space-x-2 cursor-pointer mb-1"><input type="checkbox" checked={chartMetrics.includes(metric)} onChange={() => setChartMetrics(prev => prev.includes(metric) ? prev.filter(m => m !== metric) : [...prev, metric])} className="form-checkbox h-5 w-5 rounded bg-accent border-gray-600 text-primary focus:ring-primary"/><span>{metric}</span></label>
                      <div className="flex items-center rounded-md bg-accent p-0.5 w-min ml-7"><button onClick={() => setChartTypes(p => ({...p, [metric]: 'bar'}))} className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${chartTypes[metric] === 'bar' ? 'bg-primary text-white' : 'hover:bg-content'}`}>Bar</button><button onClick={() => setChartTypes(p => ({...p, [metric]: 'line'}))} className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${chartTypes[metric] === 'line' ? 'bg-primary text-white' : 'hover:bg-content'}`}>Line</button></div>
                    </div>
                  ))}
                </div>
                <div style={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer><ComposedChart data={chartData} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis dataKey="period_label" stroke="#d1d5db" /><YAxis yAxisId="left" stroke="#d1d5db" tickFormatter={valueFormatter} /><YAxis yAxisId="right" orientation="right" stroke="#d1d5db" tickFormatter={(v: any) => (typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(0)}%` : '')} /><Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} formatter={(value: any, name: any) => { const sName = String(name); if (typeof value !== 'number' || !Number.isFinite(value)) return [String(value), sName]; return [sName.includes('%') ? `${value.toFixed(2)}%` : valueFormatter(value), sName];}} /><Legend />{chartMetrics.map((metric, i) => { const yAxis = metric.toLowerCase().includes('margin') || metric.toLowerCase().includes('%') ? 'right' : 'left'; if (chartTypes[metric] === 'line') return <Line key={metric} yAxisId={yAxis} type="monotone" dataKey={metric} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 4 }}><LabelList dataKey={metric} position="top" formatter={valueFormatter} style={{ fill: '#d1d5db' }}/></Line>; return <Bar key={metric} yAxisId={yAxis} dataKey={metric} fill={COLORS[i % COLORS.length]}><LabelList dataKey={metric} position="top" formatter={valueFormatter} style={{ fill: '#d1d5db' }}/></Bar>})}</ComposedChart></ResponsiveContainer>
                </div>
                {growthAnalysis.length > 0 && (
                    <div className="mt-6"><h3 className="text-xl font-semibold mb-2">Growth Analysis ({activeTab === 'quarterly' ? 'Quarterly' : 'Annual'})</h3><div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">{growthAnalysis.map(ga => (<div key={ga.metric} className="bg-accent p-3 rounded-lg"><p className="font-bold">{ga.metric}</p><p className="text-sm text-text-secondary">Total Change: <span className="text-text-primary font-mono">{ga.totalChange}</span></p><p className="text-sm text-text-secondary">CAGR: <span className="text-text-primary font-mono">{ga.cagr}</span></p></div>))}</div></div>
                )}
            </Card>

            <Card>
                <div className="border-b border-accent mb-4">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        {(['quarterly', 'annual'] as ActiveTab[]).map((tab) => (
                            <button key={tab} onClick={() => setActiveTab(tab)} className={`${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300'} capitalize whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>{tab}</button>
                        ))}
                    </nav>
                </div>
                {activeTab === 'quarterly' && (
                    <>
                        <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-semibold">Quarterly Data</h2><Button onClick={addPeriod} variant="secondary"><Plus className="w-4 h-4 mr-2"/>Add Period</Button></div>
                        <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left"><thead><tr><th className="p-3 font-semibold sticky left-0 bg-content z-20 w-48">Metric</th>{dataProcessor.quarterlyPeriods.map(p => (<th key={p} className="p-1 font-semibold text-center group"><div className="flex items-center gap-1 justify-center"><span>{p}</span><Button variant="danger" size="sm" className="p-1 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => removePeriod(p)}><Trash2 className="w-3 h-3"/></Button></div></th>))}</tr></thead><tbody>{dataProcessor.allMetrics.map(metric => (<tr key={metric} className="hover:bg-accent/20 group"><td className="p-1 font-bold sticky left-0 bg-content z-10 w-48 flex items-center gap-2"><Button variant="danger" size="sm" className="p-1 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => removeMetric(metric)}><Trash2 className="w-3 h-3"/></Button><input type="text" defaultValue={metric} onBlur={(e) => handleMetricNameChange(metric, e.target.value)} className="w-full bg-transparent p-2 rounded hover:bg-accent focus:bg-accent focus:outline-none"/></td>{dataProcessor.quarterlyPeriods.map(p => (<td key={p} className="p-1"><input type="number" step="any" defaultValue={dataProcessor.quarterlyDataMap[metric]?.[p]?.value ?? ''} onBlur={(e) => handleValueChange(metric, p, e.target.value)} placeholder="-" className="w-full bg-transparent p-2 text-right rounded hover:bg-accent focus:bg-accent focus:outline-none"/></td>))}</tr>))}</tbody></table></div>
                        <Button onClick={addMetric} variant="secondary" className="mt-4"><Plus className="w-4 h-4 mr-2"/>Add Metric</Button>
                    </>
                )}
                {activeTab === 'annual' && (
                    <>
                        <h2 className="text-2xl font-semibold mb-4">Annual Summary (Read-only)</h2>
                        <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left"><thead><tr><th className="p-3 font-semibold sticky left-0 bg-content z-20 w-48">Metric</th>{dataProcessor.annualPeriods.map(p => <th key={p} className="p-3 font-semibold text-center">{p}</th>)}</tr></thead><tbody>{dataProcessor.allMetrics.map(metric => (<tr key={metric} className="hover:bg-accent/20"><td className="p-3 font-bold sticky left-0 bg-content z-10 w-48">{metric}</td>{dataProcessor.annualPeriods.map(p => (<td key={p} className="p-3 text-right">{dataProcessor.annualDataMap[metric]?.[p]?.value?.toLocaleString() ?? '-'}</td>))}</tr>))}</tbody></table></div>
                    </>
                )}
            </Card>
            <Toast status={saveStatus} message={error ?? undefined}/>
        </div>
    );
};

export default FinancialsPage;