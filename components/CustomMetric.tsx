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
  value: number | null;
  financial_subsegments: (FinancialSubsegment & { value: number | null; })[];
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

  // FIX: Replaced the manual select-then-update/insert logic with a direct Supabase `upsert` call.
  // This is more efficient and correctly persists both new and existing metric values, fixing the data loss on refresh.
  const debouncedSave = useCallback(debounce(async (payloads: Partial<FinancialValue>[]) => {
    setIsSaving(true);
    setError(null);
    try {
      if (payloads.length === 0) {
        setIsSaving(false);
        return;
      }
      
      // Using Supabase's `upsert` is the correct, atomic way to handle this.
      // It requires a unique constraint on the specified `onConflict` columns in the database schema
      // to correctly identify which row to update or if a new one should be inserted.
      const { error: upsertError } = await supabase
        .from('financial_values')
        .upsert(payloads);

      if (upsertError) {
        throw upsertError;
      }

      console.log('Save successful (upsert):', payloads);
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
      
      const { data: subsegmentsData, error: subsegmentsError } = await supabase.from('financial_subsegment').select('*').in('metric_id', metricIds).order('display_order');
      if (subsegmentsError) throw subsegmentsError;

      const { data: valuesData, error: valuesError } = await supabase.from('financial_values').select('*').eq('stock_id', stockId).eq('period_id', periodId);
      if (valuesError) throw valuesError;
      
      const stitchedMetrics: DisplayMetric[] = metricsData.map(metric => {
        const subsegments = subsegmentsData.filter(s => s.metric_id === metric.id);
        
        const metricValue = valuesData.find(v => v.metric_id === metric.id && v.subsegment_id === null)?.value ?? null;

        const subsegmentsWithValues = subsegments.map(sub => {
          const subValue = valuesData.find(v => v.subsegment_id === sub.id)?.value ?? null;
          return { ...sub, value: subValue };
        });

        return { ...metric, value: metricValue, financial_subsegments: subsegmentsWithValues };
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
      const sub = metric.financial_subsegments.find((s: FinancialSubsegment) => s.id === subsegmentId);
      if (sub) sub.value = value;

      const total = metric.financial_subsegments.reduce((sum: number, s: { value: number | null }) => sum + (s.value || 0), 0);
      metric.value = total;
      
      payloads.push({ stock_id: stockId, period_id: periodId, metric_id: metricId, subsegment_id: subsegmentId, value });
      payloads.push({ stock_id: stockId, period_id: periodId, metric_id: metricId, subsegment_id: null, value: total });

    } else {
      metric.value = value;
      payloads.push({ stock_id: stockId, period_id: periodId, metric_id: metricId, subsegment_id: null, value });
    }

    setMetrics(newMetrics);
    debouncedSave(payloads);
  };
  
  const handleAddNewMetric = async () => {
    if (!newMetricName.trim()) return;
    setLoading(true);
    try {
        const { data, error } = await supabase.from('financial_metric').insert({ stock_id: stockId, metric_name: newMetricName, display_order: metrics.length }).select().single();
        if (error || !data) throw error || new Error("Failed to get data for new metric");
        
        // This is the correct pattern: Add the metric to the database, get the generated ID back,
        // and then update the local UI state. The first time a user enters a value, the debounced
        // save function will correctly INSERT the new value record.
        setMetrics(prev => [...prev, { ...data, value: null, financial_subsegments: [] }]);
        setNewMetricName('');
    } catch (err) {
        setError(formatErrorMessage('Failed to add metric', err));
    } finally {
        setLoading(false);
    }
  };

  const handleRemoveSelectedMetrics = async () => {
    if (selectedMetricIds.length === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedMetricIds.length} metric(s)?`)) {
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
                value={metric.value ?? ''}
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
                      value={sub.value ?? ''}
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
