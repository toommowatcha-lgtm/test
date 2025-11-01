import { createClient } from '@supabase/supabase-js';
import { useState, useEffect } from 'react';

// Supabase client
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Debounce hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// Main component
export default function FinancialInput({ stock_id, metric_id, period_id, subset_id = null }) {
  const [inputValue, setInputValue] = useState('');
  const debouncedValue = useDebounce(inputValue, 500); // 0.5 วิ

  useEffect(() => {
    if (debouncedValue === '') return;

    async function saveValue() {
      const { data, error } = await supabase
        .from('financial_values')
        .upsert({
          stock_id,
          metric_id,
          period_id,
          subset_id,
          value: parseFloat(debouncedValue),
          updated_at: new Date().toISOString()
        }, {
          onConflict: ['stock_id', 'metric_id', 'period_id', 'subset_id']
        });

      if (error) console.error('Save error:', error);
      else console.log('Saved:', data);
    }

    saveValue();
  }, [debouncedValue, stock_id, metric_id, period_id, subset_id]);

  return (
    <input
      type="number"
      value={inputValue}
      onChange={e => setInputValue(e.target.value)}
      placeholder="กรอกค่า financial metric"
      style={{ width: '100px', padding: '4px' }}
    />
  );
}
