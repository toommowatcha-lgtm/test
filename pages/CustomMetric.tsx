import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const CustomMetric = ({ currentPeriod, currentStockId }) => {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);

  // Fetch metric list and their values
  const fetchMetrics = async () => {
    const { data: metricList } = await supabase
      .from("financial_metric")
      .select("id, metric_name, stock_id")
      .eq("stock_id", currentStockId);

    const { data: metricValues } = await supabase
      .from("financial_values")
      .select("metric_id, value")
      .eq("period", currentPeriod);

    const merged = metricList?.map(m => ({
      ...m,
      value: metricValues?.find(v => v.metric_id === m.id)?.value || 0
    })) || [];

    setMetrics(merged);
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  // Handle input change
  const handleInputChange = (metricId: string, value: number) => {
    setMetrics(prev =>
      prev.map(m => (m.id === metricId ? { ...m, value } : m))
    );

    // Save value to Supabase
    supabase
      .from("financial_values")
      .upsert({ metric_id: metricId, value, period: currentPeriod })
      .then(({ error }) => {
        if (error) console.error("Save failed:", error.message);
      });
  };

  // Remove selected metrics
  const handleRemove = async () => {
    if (selectedMetrics.length === 0) return alert("Select at least one metric.");
    if (!confirm(`Delete ${selectedMetrics.length} metrics?`)) return;

    const { error } = await supabase
      .from("financial_metric")
      .delete()
      .in("id", selectedMetrics);

    if (error) return alert("Delete failed: " + error.message);

    setSelectedMetrics([]);
    fetchMetrics();
  };

  const toggleSelect = (id: string) => {
    setSelectedMetrics(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div>
      <h2>Custom Metric</h2>
      <button onClick={handleRemove} className="bg-red-500 text-white px-3 py-1 rounded">
        Remove Selected
      </button>
      <ul>
        {metrics.map(m => (
          <li key={m.id}>
            <input
              type="checkbox"
              checked={selectedMetrics.includes(m.id)}
              onChange={() => toggleSelect(m.id)}
            />
            {m.metric_name}:{" "}
            <input
              type="number"
              value={m.value}
              onChange={e => handleInputChange(m.id, Number(e.target.value))}
            />
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CustomMetric;
