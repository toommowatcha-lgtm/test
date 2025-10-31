import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";
import { debounce } from "lodash";

interface Metric {
  id: string;
  metric_name: string;
  value: number;
  subsegments?: Subsegment[];
}

interface Subsegment {
  id: string;
  name: string;
  value: number;
}

interface Props {
  stockId: string;
  periodId: string;
}

const CustomMetric: React.FC<Props> = ({ stockId, periodId }) => {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [newMetricName, setNewMetricName] = useState("");

  // --- Fetch metrics + values ---
  const fetchMetrics = async () => {
    const { data: metricList } = await supabase
      .from("financial_metric")
      .select("id, metric_name")
      .eq("stock_id", stockId);

    const { data: metricValues } = await supabase
      .from("financial_values")
      .select("metric_id, subsegment_id, value")
      .eq("stock_id", stockId)
      .eq("period_id", periodId);

    const merged: Metric[] = metricList?.map(m => {
      const mainValue = metricValues?.find(
        v => v.metric_id === m.id && v.subsegment_id === null
      )?.value || 0;

      const subsegments = metricValues
        ?.filter(v => v.metric_id === m.id && v.subsegment_id !== null)
        .map(v => ({ id: v.subsegment_id!, name: "", value: v.value }));

      return { ...m, value: mainValue, subsegments };
    }) || [];

    setMetrics(merged);
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  // --- Debounced save functions ---
  const saveMainMetric = useCallback(
    debounce(async (metricId: string, value: number) => {
      const { error } = await supabase
        .from("financial_values")
        .upsert({
          stock_id: stockId,
          metric_id: metricId,
          subsegment_id: null,
          period_id: periodId,
          value,
        });
      if (error) console.error("Save main metric failed:", error.message);
    }, 300),
    [stockId, periodId]
  );

  const saveSubsegment = useCallback(
    debounce(async (metricId: string, subsegmentId: string, value: number) => {
      const { error } = await supabase
        .from("financial_values")
        .upsert({
          stock_id: stockId,
          metric_id: metricId,
          subsegment_id: subsegmentId,
          period_id: periodId,
          value,
        });
      if (error) console.error("Save subsegment failed:", error.message);
    }, 300),
    [stockId, periodId]
  );

  // --- Handlers ---
  const handleMainChange = (metricId: string, value: number) => {
    setMetrics(prev =>
      prev.map(m => (m.id === metricId ? { ...m, value } : m))
    );
    saveMainMetric(metricId, value);
  };

  const handleSubsegmentChange = (
    metricId: string,
    subsegmentId: string,
    value: number
  ) => {
    setMetrics(prev =>
      prev.map(m =>
        m.id === metricId
          ? {
              ...m,
              subsegments: m.subsegments?.map(s =>
                s.id === subsegmentId ? { ...s, value } : s
              ),
            }
          : m
      )
    );
    saveSubsegment(metricId, subsegmentId, value);
  };

  const toggleSelect = (id: string) => {
    setSelectedMetrics(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // --- Add new metric ---
  const handleAddMetric = async () => {
    if (!newMetricName.trim()) return alert("Enter metric name");

    const { data: newMetric, error } = await supabase
      .from("financial_metric")
      .insert([{ metric_name: newMetricName.trim(), stock_id: stockId }])
      .select()
      .single();

    if (error) return alert("Add metric failed: " + error.message);

    // Save initial value 0
    await supabase.from("financial_values").upsert([{
      stock_id: stockId,
      metric_id: newMetric.id,
      subsegment_id: null,
      period_id: periodId,
      value: 0
    }]);

    setNewMetricName("");
    fetchMetrics();
  };

  // --- Remove selected metrics ---
  const handleRemove = async () => {
    if (selectedMetrics.length === 0) return alert("Select metrics to delete.");
    if (!confirm(`Delete ${selectedMetrics.length} metrics?`)) return;

    const { error } = await supabase
      .from("financial_metric")
      .delete()
      .in("id", selectedMetrics);

    if (error) return alert("Delete failed: " + error.message);
    setSelectedMetrics([]);
    fetchMetrics();
  };

  return (
    <div>
      <h2>Custom Metric</h2>

      <div className="mb-2">
        <input
          type="text"
          placeholder="New metric name"
          value={newMetricName}
          onChange={e => setNewMetricName(e.target.value)}
          className="border p-1 mr-2"
        />
        <button
          onClick={handleAddMetric}
          className="bg-green-500 text-white px-3 py-1 rounded"
        >
          Add Metric
        </button>
      </div>

      <button
        onClick={handleRemove}
        className="bg-red-500 text-white px-3 py-1 rounded mb-2"
      >
        Remove Selected
      </button>

      <ul>
        {metrics.map(m => (
          <li key={m.id} className="mb-2">
            <input
              type="checkbox"
              checked={selectedMetrics.includes(m.id)}
              onChange={() => toggleSelect(m.id)}
            />
            {m.metric_name}:{" "}
            <input
              type="number"
              value={m.value}
              onChange={e => handleMainChange(m.id, Number(e.target.value))}
            />
            {m.subsegments?.map(s => (
              <div key={s.id} style={{ marginLeft: "20px" }}>
                Subsegment:{" "}
                <input
                  type="number"
                  value={s.value}
                  onChange={e =>
                    handleSubsegmentChange(m.id, s.id, Number(e.target.value))
                  }
                />
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CustomMetric;
