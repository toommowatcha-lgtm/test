import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { WatchlistItem, FinancialMetric } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { debounce } from 'lodash';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Toast, { SaveStatus } from '../components/ui/Toast';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { formatErrorMessage } from '../utils/errorHandler';

const COLORS = ['#06b6d4', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#fde047', '#a855f7'];

const FinancialsPage: React.FC = () => {
    const { stockId } = useParams<{ stockId: string }>();
    const [stock, setStock] = useState<WatchlistItem | null>(null);
    const [financials, setFinancials] = useState<FinancialMetric[]>([]);
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [chartMetrics, setChartMetrics] = useState<string[]>([]);

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
            
            setFinancials(financialsData || []);
            
            if (financialsData && financialsData.length > 0 && chartMetrics.length === 0) {
              const defaultMetric = [...new Set(financialsData.map(f => f.metric_name))].sort()[0];
              if (defaultMetric) setChartMetrics([defaultMetric]);
            }
        } catch (err) {
            setError(formatErrorMessage('Failed to load financials', err));
        } finally {
            if (showLoading) setLoading(false);
        }
    }, [stockId, chartMetrics.length]);

    const saveData = async (record: FinancialMetric) => {
        setSaveStatus('saving');
        try {
            const { id, ...recordToUpsert } = record;
            if (id) {
                const { error } = await supabase.from('financials').update(recordToUpsert).eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('financials').insert(recordToUpsert);
                if (error) throw error;
            }
            showSaveStatus('saved');
            await fetchFinancials(false);
        } catch(err) {
            showSaveStatus('error', formatErrorMessage('Save failed', err));
        }
    }
    const debouncedSave = useCallback(debounce(saveData, 1000), [fetchFinancials]);


    useEffect(() => {
        fetchFinancials();
    }, [fetchFinancials]);


    const { metrics, periods, dataMap, chartData } = useMemo(() => {
        const periodSorter = (a: string, b: string) => {
            const parsePeriod = (p: string) => {
                if (p.match(/^Q[1-4]\s\d{4}$/)) { // e.g. "Q1 2024"
                    const [q, y] = p.split(' ');
                    return parseInt(y) + (parseInt(q.slice(1)) / 10);
                }
                if (p.match(/^\d{4}$/)) { // e.g. "2024"
                     return parseInt(p);
                }
                return 0; // fallback
            };
            return parsePeriod(a) - parsePeriod(b);
        };

        const uniqueMetrics = [...new Set(financials.map(f => f.metric_name))].sort();
        const uniquePeriods = [...new Set(financials.map(f => f.period_label))].sort(periodSorter);
        
        const dataMap: Record<string, Record<string, FinancialMetric | undefined>> = {};
        financials.forEach(f => {
            if (!dataMap[f.metric_name]) dataMap[f.metric_name] = {};
            dataMap[f.metric_name][f.period_label] = f;
        });
        
        const chartData = uniquePeriods.map(period => {
            const periodData: { period_label: string; [key: string]: number | string } = { period_label: period };
            chartMetrics.forEach(metric => {
                periodData[metric] = dataMap[metric]?.[period]?.value ?? 0;
            });
            return periodData;
        });

        return { metrics: uniqueMetrics, periods: uniquePeriods, dataMap, chartData };
    }, [financials, chartMetrics]);

    const handleValueChange = (metric_name: string, period_label: string, valueStr: string) => {
        if (!stockId) return;
        const value = valueStr === '' ? null : parseFloat(valueStr);
        if (isNaN(value as number) && value !== null) return;
        
        const existingRecord = financials.find(f => f.metric_name === metric_name && f.period_label === period_label);
        const recordToSave = existingRecord 
            ? { ...existingRecord, value }
            : { stock_id: stockId, metric_name, period_label, value };
        
        const newFinancials = existingRecord
            ? financials.map(f => f.id === existingRecord.id ? recordToSave : f)
            : [...financials, recordToSave];

        setFinancials(newFinancials as FinancialMetric[]);
        debouncedSave(recordToSave as FinancialMetric);
    };
    
    const handleMetricNameChange = async (oldName: string, newName: string) => {
        if (!stockId || !newName || oldName === newName) return;
        if (metrics.includes(newName)) {
            showSaveStatus('error', 'Metric name must be unique.');
            // Revert UI change by refetching
            await fetchFinancials(false); 
            return;
        }
        
        showSaveStatus('saving');
        const { error: updateError } = await supabase.from('financials').update({ metric_name: newName }).match({ stock_id: stockId, metric_name: oldName });
        
        if (updateError) {
            showSaveStatus('error', formatErrorMessage('Failed to update metric name', updateError));
        } else {
            setFinancials(prev => prev.map(f => f.metric_name === oldName ? { ...f, metric_name: newName } : f));
            setChartMetrics(prev => prev.map(m => m === oldName ? newName : m));
            showSaveStatus('saved');
        }
    };
    
    const handlePeriodLabelChange = async (oldLabel: string, newLabel: string) => {
      if (!stockId || !newLabel || oldLabel === newLabel) return;
      if (periods.includes(newLabel)) {
          showSaveStatus('error', 'Period label must be unique.');
          await fetchFinancials(false);
          return;
      }
      showSaveStatus('saving');
      const { error: updateError } = await supabase.from('financials').update({ period_label: newLabel }).match({ stock_id: stockId, period_label: oldLabel });

      if (updateError) {
          showSaveStatus('error', formatErrorMessage('Failed to update period label', updateError));
      } else {
          setFinancials(prev => prev.map(f => f.period_label === oldLabel ? { ...f, period_label: newLabel } : f));
          showSaveStatus('saved');
      }
    };

    const addMetric = async () => {
        if (!stockId) return;
        let newMetricName = "New Metric";
        let count = 1;
        while (metrics.includes(newMetricName)) {
            newMetricName = `New Metric ${++count}`;
        }
        
        const periodsToCreateFor = periods.length > 0 ? periods : ['2025'];
        const newRecords = periodsToCreateFor.map(p => ({ stock_id: stockId, metric_name: newMetricName, period_label: p, value: 0 }));

        showSaveStatus('saving');
        const { data, error: insertError } = await supabase.from('financials').insert(newRecords).select();
        if (insertError) {
            showSaveStatus('error', formatErrorMessage('Failed to add metric', insertError));
        } else if (data) {
            setFinancials(prev => [...prev, ...data]);
            showSaveStatus('saved');
        }
    };

    const addPeriod = async () => {
        if (!stockId) return;
        const lastPeriod = periods[periods.length - 1];
        let newPeriodLabel = '2025';
        if (lastPeriod) {
            if (lastPeriod.match(/^Q[1-4]\s\d{4}$/)) {
                const [q, y] = lastPeriod.split(' ');
                const quarterNum = parseInt(q.slice(1));
                const yearNum = parseInt(y);
                newPeriodLabel = quarterNum < 4 ? `Q${quarterNum + 1} ${yearNum}` : `Q1 ${yearNum + 1}`;
            } else if (lastPeriod.match(/^\d{4}$/)) {
                newPeriodLabel = (parseInt(lastPeriod) + 1).toString();
            }
        }
        
        const metricsToCreateFor = metrics.length > 0 ? metrics : ["Revenue"];
        const newRecords = metricsToCreateFor.map(m => ({ stock_id: stockId, metric_name: m, period_label: newPeriodLabel, value: 0 }));

        showSaveStatus('saving');
        const { data, error: insertError } = await supabase.from('financials').insert(newRecords).select();
        if (insertError) {
            showSaveStatus('error', formatErrorMessage('Failed to add period', insertError));
        } else if (data) {
            setFinancials(prev => [...prev, ...data]);
            showSaveStatus('saved');
        }
    };
    
    const removeMetric = async (metricName: string) => {
        if (!stockId || !confirm(`Are you sure you want to delete the metric "${metricName}" and all its data?`)) return;
        showSaveStatus('saving');
        const { error: deleteError } = await supabase.from('financials').delete().match({ stock_id: stockId, metric_name: metricName });

        if (deleteError) {
            showSaveStatus('error', formatErrorMessage("Failed to delete metric", deleteError));
        } else {
            setFinancials(prev => prev.filter(f => f.metric_name !== metricName));
            setChartMetrics(prev => prev.filter(m => m !== metricName));
            showSaveStatus('saved');
        }
    };

    const removePeriod = async (periodLabel: string) => {
        if (!stockId || !confirm(`Are you sure you want to delete the period "${periodLabel}" and all its data?`)) return;
        showSaveStatus('saving');
        const { error: deleteError } = await supabase.from('financials').delete().match({ stock_id: stockId, period_label: periodLabel });

        if (deleteError) {
            showSaveStatus('error', formatErrorMessage("Failed to delete period", deleteError));
        } else {
            setFinancials(prev => prev.filter(f => f.period_label !== periodLabel));
            showSaveStatus('saved');
        }
    };

    if (loading) return <div className="p-8 text-center text-text-secondary">Loading Financials...</div>;
    if (error && !stock) return <div className="p-8 text-center text-danger bg-danger/10 rounded-lg">{error}</div>;

    return (
        <div className="container mx-auto p-4 md:p-8">
            <Link to={`/stock/${stockId}`} className="inline-flex items-center text-primary mb-6 hover:underline"><ArrowLeft className="w-4 h-4 mr-2" />Back to Overview</Link>
            <header className="mb-8"><h1 className="text-5xl font-bold">{stock?.symbol} - Financials</h1><p className="text-xl text-text-secondary">{stock?.company}</p></header>
            
            <Card className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">Chart</h2>
                <div className="flex flex-wrap gap-4 mb-4">{metrics.map(metric => (<label key={metric} className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={chartMetrics.includes(metric)} onChange={() => setChartMetrics(prev => prev.includes(metric) ? prev.filter(m => m !== metric) : [...prev, metric])} className="form-checkbox h-5 w-5 rounded bg-accent border-gray-600 text-primary focus:ring-primary"/><span>{metric}</span></label>))}</div>
                <div style={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>
                        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis dataKey="period_label" stroke="#d1d5db" />
                            {/* FIX: Explicitly type the value from the recharts formatter prop to 'any' to match library types. */}
                            <YAxis stroke="#d1d5db" tickFormatter={(v: any) => typeof v === 'number' ? new Intl.NumberFormat('en-US',{notation:'compact',compactDisplay:'short'}).format(v) : ''} />
                            <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                            <Legend />
                            {chartMetrics.map((metric, i) => (<Bar key={metric} dataKey={metric} fill={COLORS[i % COLORS.length]}>
                                {/* FIX: Explicitly type the value from the recharts formatter prop to 'any' to match library types. */}
                                <LabelList dataKey={metric} position="top" formatter={(v: any) => typeof v === 'number' ? new Intl.NumberFormat('en-US',{notation:'compact',compactDisplay:'short'}).format(v) : ''} style={{ fill: '#d1d5db' }}/>
                            </Bar>))}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            <Card>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-semibold">Metrics</h2>
                    <Button onClick={addPeriod} variant="secondary"><Plus className="w-4 h-4 mr-2"/>Add Period</Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-left">
                        <thead>
                            <tr>
                                <th className="p-3 font-semibold sticky left-0 bg-content z-20 w-48">Metric</th>
                                {periods.map(p => (
                                    <th key={p} className="p-1 font-semibold text-center group">
                                        <div className="flex items-center gap-1 justify-center">
                                            <input type="text" defaultValue={p} onBlur={e => handlePeriodLabelChange(p, e.target.value)} className="w-full bg-transparent p-2 text-center rounded hover:bg-accent focus:bg-accent focus:outline-none"/>
                                            <Button variant="danger" size="sm" className="p-1 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => removePeriod(p)}><Trash2 className="w-3 h-3"/></Button>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {metrics.map(metric => (
                                <tr key={metric} className="hover:bg-accent/20 group">
                                    <td className="p-1 font-bold sticky left-0 bg-content z-10 w-48 flex items-center gap-2">
                                        <Button variant="danger" size="sm" className="p-1 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => removeMetric(metric)}><Trash2 className="w-3 h-3"/></Button>
                                        <input type="text" defaultValue={metric} onBlur={(e) => handleMetricNameChange(metric, e.target.value)} className="w-full bg-transparent p-2 rounded hover:bg-accent focus:bg-accent focus:outline-none"/>
                                    </td>
                                    {periods.map(p => (
                                        <td key={p} className="p-1">
                                            <input type="number" step="any" defaultValue={dataMap[metric]?.[p]?.value ?? ''} onBlur={(e) => handleValueChange(metric, p, e.target.value)} placeholder="-" className="w-full bg-transparent p-2 text-right rounded hover:bg-accent focus:bg-accent focus:outline-none"/>
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
