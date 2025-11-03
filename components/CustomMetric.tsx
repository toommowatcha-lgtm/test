import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { FinancialMetric, FinancialSubsegment, FinancialValue } from '../types';
import { debounce } from 'lodash';
import Card from './ui/Card';
import Button from './ui/Button';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { formatErrorMessage } from '../utils/errorHandler';


// A local, stitched type for the component's state
interface DisplayMetric extends FinancialMetric {
  metric_value: number | null;
  financial_subsegments: (FinancialSubsegment & { metric_value: number | null; })[];
}

interface CustomMetricProps {
  stockId: string;
  periodId: string;
}

const CustomMetric: React.FC<CustomMetricProps> = ({ stockId, periodId }) => {
  const [metrics, setMetrics] = useState<DisplayMetric[]>([]);
  const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>([]);
  const [newMetricName, setNewMetricName] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refactored to a robust manual "upsert" to handle new and existing values correctly,
  // especially with nullable subsegment_id which can be tricky for Supabase's default upsert.
  const debouncedSave = useCallback(debounce(async (payloads: Partial<FinancialValue>[]) => {
    setIsSaving(true);
    setError(null);
    try {
        const savePromises = payloads.map(async (payload) => {
            if (!payload.stock_id || !payload.metric_id || !payload.period_id) {
                console.warn('Skipping save for incomplete payload:', payload);
                return;
            }

            const { error } = await supabase.rpc("upsert_financial_value", {
                p_stock_id: payload.stock_id,
                p_metric_id: payload.metric_id,
                p_period_id: payload.period_id,
                p_subsegment_id: payload.subsegment_id || null,
                p_value: payload.metric_value,
            });
            
            if (error) throw error;
        });

        await Promise.all(savePromises);
        console.log('Save successful:', payloads);

    } catch (err) {
      const message = formatErrorMessage('Save failed', err);
      setError(message);
      console.error(message);
    } finally {
      setIsSaving(false);
    }
}, 300), []);


  const fetchData = useCallback(async () => {
    if (!stockId || !periodId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: metricsData, error: metricsError } = await supabase.from('financial_metric').select('*').eq('stock_id', stockId).order('display_order');
      if (metricsError) throw metricsError;

      const metricIds = metricsData.map(m => m.id);
      if (metricIds.length === 0) {
        setMetrics([]);
        setLoading(false);
        return;
      }
      
      const { data: subsegmentsData, error: subsegmentsError } = await supabase.from('financial_subsegment').select('*').in('metric_id', metricIds).order('display_order');
      if (subsegmentsError) throw subsegmentsError;

      const { data: valuesData, error: valuesError } = await supabase.from('financial_values').select('*').eq('stock_id', stockId).eq('period_id', periodId);
      if (valuesError) throw valuesError;
      
      const stitchedMetrics: DisplayMetric[] = metricsData.map(metric => {
        const subsegments = subsegmentsData.filter(s => s.metric_id === metric.id);
        
        const metricValue = valuesData.find(v => v.metric_id === metric.id && v.subsegment_id === null)?.metric_value ?? null;

        const subsegmentsWithValues = subsegments.map(sub => {
          // FIX: Correctly match on both metric_id and subsegment_id to find the sub-value.
          const subValue = valuesData.find(v => v.metric_id === metric.id && v.subsegment_id === sub.id)?.metric_value ?? null;
          return { ...sub, metric_value: subValue };
        });

        return { ...metric, metric_value: metricValue, financial_subsegments: subsegmentsWithValues };
      });

      setMetrics(stitchedMetrics);
    } catch (err) {
        setError(formatErrorMessage('Failed to fetch metrics', err));
    } finally {
      setLoading(false);
    }
  }, [stockId, periodId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleSelection = (metricId: string) => {
    setSelectedMetricIds(prev =>
      prev.includes(metricId) ? prev.filter(id => id !== metricId) : [...prev, metricId]
    );
  };

  const handleValueChange = (metricId: string, subsegmentId: string | null, valueStr: string) => {
    const value = valueStr === '' ? null : parseFloat(valueStr);
    if (valueStr !== '' && isNaN(value as number)) return;

    const newMetrics = JSON.parse(JSON.stringify(metrics));
    const metric = newMetrics.find((m: DisplayMetric) => m.id === metricId);
    if (!metric) return;

    const payloads: Partial<FinancialValue>[] = [];

    if (subsegmentId) {
      const sub = metric.financial_subsegments.find((s: any) => s.id === subsegmentId);
      if (sub) sub.metric_value = value;

      const total = metric.financial_subsegments.reduce((sum: number, s: { metric_value: number | null }) => sum + (s.metric_value || 0), 0);
      metric.metric_value = total;
      
      payloads.push({ stock_id: stockId, period_id: periodId, metric_id: metricId, subsegment_id: subsegmentId, metric_value: value });
      payloads.push({ stock_id: stockId, period_id: periodId, metric_id: metricId, subsegment_id: null, metric_value: total });

    } else {
      metric.metric_value = value;
      payloads.push({ stock_id: stockId, period_id: periodId, metric_id: metricId, subsegment_id: null, metric_value: value });
    }

    setMetrics(newMetrics);
    debouncedSave(payloads);
  };
  
  const handleAddNewMetric = async () => {
    if (!newMetricName.trim()) return;
    setLoading(true);
    setError(null);
    try {
        // Step 1: Insert the new metric definition to get an ID.
        const { data: newMetricData, error: metricError } = await supabase
            .from('financial_metric')
            .insert({ stock_id: stockId, metric_name: newMetricName, display_order: metrics.length })
            .select()
            .single();
        if (metricError) throw metricError;
        if (!newMetricData) throw new Error("Failed to get data for new metric");

        // Step 2: Get all periods for the stock to create placeholder values for each.
        const { data: periodsData, error: periodsError } = await supabase
            .from('financial_period')
            .select('id')
            .eq('stock_id', stockId);
        if (periodsError) throw periodsError;

        // Step 3: Create a placeholder `financial_values` record for each period.
        // This ensures that when a value is entered, we are UPDATING an existing row.
        if (periodsData && periodsData.length > 0) {
            const rpcCalls = periodsData.map(period =>
                supabase.rpc("upsert_financial_value", {
                    p_stock_id: stockId,
                    p_metric_id: newMetricData.id,
                    p_period_id: period.id,
                    p_subsegment_id: null,
                    p_value: null,
                })
            );
            const results = await Promise.all(rpcCalls);
            const firstError = results.find(res => res.error);
            if (firstError) {
                throw firstError.error;
            }
        }

        setNewMetricName('');
        // Step 4: Refresh all data to reflect the new metric and its empty values.
        await fetchData();
    } catch (err) {
        setError(formatErrorMessage('Failed to add metric', err));
    } finally {
        setLoading(false);
    }
  };

  const handleRemoveSelectedMetrics = async () => {
    if (selectedMetricIds.length === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedMetricIds.length} metric(s)? This cannot be undone.`)) {
        setLoading(true);
        try {
            const { error } = await supabase.from('financial_metric').delete().in('id', selectedMetricIds);
            if (error) throw error;
            setMetrics(prev => prev.filter(m => !selectedMetricIds.includes(m.id)));
            setSelectedMetricIds([]);
        } catch (err) {
            setError(formatErrorMessage('Failed to remove metrics', err));
        } finally {
            setLoading(false);
        }
    }
  };

  if (loading && metrics.length === 0) return <div className="p-4 text-text-secondary">Loading metrics...</div>;

  return (
    <Card>
      <h3 className="text-xl font-semibold mb-4">Custom Metrics for Period</h3>
      {error && <div className="bg-danger/20 text-danger p-3 rounded-md mb-4">{error}</div>}
      
      <div className="space-y-3">
        {metrics.map(metric => (
          <div key={metric.id}>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedMetricIds.includes(metric.id)}
                onChange={() => handleToggleSelection(metric.id)}
                className="form-checkbox h-5 w-5 rounded bg-accent border-gray-600 text-primary focus:ring-primary"
              />
              <span className="font-semibold flex-1">{metric.metric_name}</span>
              <input
                type="number"
                value={metric.metric_value ?? ''}
                onChange={(e) => handleValueChange(metric.id, null, e.target.value)}
                disabled={metric.financial_subsegments.length > 0}
                placeholder="Value"
                className="w-32 bg-accent p-1 rounded text-right border border-gray-600 focus:ring-primary focus:border-primary disabled:bg-content"
              />
            </div>
            {metric.financial_subsegments.length > 0 && (
              <div className="ml-8 mt-2 space-y-2">
                {metric.financial_subsegments.map(sub => (
                  <div key={sub.id} className="flex items-center gap-2">
                    <span className="text-text-secondary flex-1">{sub.subsegment_name}</span>
                    <input
                      type="number"
                      value={sub.metric_value ?? ''}
                      onChange={(e) => handleValueChange(metric.id, sub.id, e.target.value)}
                      placeholder="Value"
                      className="w-32 bg-accent p-1 rounded text-right border border-gray-600 focus:ring-primary focus:border-primary"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-accent pt-4 space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMetricName}
            onChange={(e) => setNewMetricName(e.target.value)}
            placeholder="New metric name..."
            className="flex-grow bg-accent px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button onClick={handleAddNewMetric} disabled={loading || !newMetricName.trim()}>
            <Plus className="w-4 h-4 mr-2" /> Add Metric
          </Button>
        </div>
        <div>
          <Button
            variant="danger"
            onClick={handleRemoveSelectedMetrics}
            disabled={loading || selectedMetricIds.length === 0}
          >
            <Trash2 className="w-4 h-4 mr-2" /> Remove Selected
          </Button>
        </div>
      </div>
       {isSaving && (
        <div className="flex items-center text-sm text-text-secondary mt-2">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Saving...
        </div>
      )}
    </Card>
  );
};

export default CustomMetric;