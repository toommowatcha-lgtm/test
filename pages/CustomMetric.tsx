import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const CustomMetric = () => {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);

  // Fetch metrics from Supabase
  const fetchMetrics = async () => {
    const { data, error } = await supabase
      .from("financial_metric")
      .select("id, metric_name");
    if (error) {
      console.error("Error fetching metrics:", error);
    } else {
      setMetrics(data || []);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  // Remove selected metrics
  const handleRemove = async () => {
    if (selectedMetrics.length === 0) {
      alert("Please select at least one metric to remove.");
      return;
    }

    const confirmDelete = confirm(
      `Are you sure you want to delete ${selectedMetrics.length} metric(s)?`
    );
    if (!confirmDelete) return;

    try {
      const { error } = await supabase
        .from("financial_metric")
        .delete()
        .in("id", selectedMetrics);

      if (error) {
        console.error("Error deleting metrics:", error);
        alert("❌ Delete failed: " + error.message);
      } else {
        alert("✅ Metrics deleted successfully!");
        setSelectedMetrics([]);
        fetchMetrics(); // Refresh the list
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      alert("⚠️ Unexpected error occurred.");
    }
  };

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div>
      <h2>Custom Metric</h2>
      <button onClick={handleRemove} className="bg-red-500 text-white px-3 py-1 rounded">
        Remove Selected
      </button>
      <ul>
        {metrics.map((metric) => (
          <li key={metric.id}>
            <input
              type="checkbox"
              checked={selectedMetrics.includes(metric.id)}
              onChange={() => toggleSelect(metric.id)}
            />{" "}
            {metric.metric_name}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CustomMetric;
