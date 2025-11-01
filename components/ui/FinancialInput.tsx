import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabaseClient';
import { debounce } from 'lodash';

type SaveStatus = 'idle' | 'saving' | 'error';

interface FinancialInputProps {
  stockId: string;
  metricId: string;
  periodId: string;
  subsegmentId?: string | null;
  defaultValue: number | null;
  className?: string;
  placeholder?: string;
}

/**
 * A reusable numeric input component that debounces user input and automatically
 * saves (upserts) the value to the 'financial_values' table in Supabase.
 */
const FinancialInput: React.FC<FinancialInputProps> = ({
  stockId,
  metricId,
  periodId,
  subsegmentId = null,
  defaultValue,
  className = '',
  placeholder = '0.00',
}) => {
  const [value, setValue] = useState<string>(defaultValue === null || defaultValue === undefined ? '' : String(defaultValue));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  // If the defaultValue prop changes from the parent, update the internal state.
  useEffect(() => {
    setValue(defaultValue === null || defaultValue === undefined ? '' : String(defaultValue));
  }, [defaultValue]);

  // Memoized save function to perform the Supabase upsert logic.
  const saveValue = useCallback(async (valueToSave: number | null) => {
    console.log('Attempting to save value:', valueToSave);
    setSaveStatus('saving');

    try {
      // 1. Check if a record already exists to determine if we need to INSERT or UPDATE.
      let selectQuery = supabase
        .from('financial_values')
        .select('id')
        .eq('stock_id', stockId)
        .eq('metric_id', metricId)
        .eq('period_id', periodId);

      if (subsegmentId) {
        selectQuery = selectQuery.eq('subsegment_id', subsegmentId);
      } else {
        selectQuery = selectQuery.is('subsegment_id', null);
      }

      const { data: existingRecord, error: checkError } = await selectQuery.maybeSingle();

      if (checkError) {
        throw new Error(`Database check failed: ${checkError.message}`);
      }

      const payload = {
        stock_id: stockId,
        metric_id: metricId,
        period_id: periodId,
        subsegment_id: subsegmentId,
        value: valueToSave,
        updated_at: new Date().toISOString(),
      };

      if (existingRecord) {
        // 2. UPDATE the existing record.
        console.log('Updating existing record:', existingRecord.id, payload);
        const { error: updateError } = await supabase
          .from('financial_values')
          .update({ value: valueToSave, updated_at: new Date().toISOString() })
          .eq('id', existingRecord.id);

        if (updateError) throw updateError;

      } else if (valueToSave !== null) {
        // 3. INSERT a new record, but only if there's a non-null value to save.
        console.log('Inserting new record:', payload);
        const { error: insertError } = await supabase
          .from('financial_values')
          .insert(payload);
        
        if (insertError) throw insertError;
      }
      
      console.log('Save successful for payload:', payload);
      setSaveStatus('idle');

    } catch (error) {
      console.error('Failed to save financial value:', error);
      setSaveStatus('error');
    }
  }, [stockId, metricId, periodId, subsegmentId]);

  // Create a debounced version of the save function.
  const debouncedSave = useCallback(debounce(saveValue, 500), [saveValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setValue(inputValue);
    
    // Convert to number or null for saving.
    const numericValue = inputValue === '' ? null : parseFloat(inputValue);

    // Basic validation: proceed if empty or a valid number.
    if (inputValue === '' || !isNaN(numericValue as number)) {
      debouncedSave(numericValue);
    }
  };

  const statusClasses = {
    idle: 'focus:ring-primary border-gray-600',
    saving: 'ring-2 ring-primary border-primary',
    error: 'ring-2 ring-danger border-danger',
  };

  return (
    <input
      type="number"
      step="any"
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      className={`w-full bg-transparent p-2 text-right rounded hover:bg-accent focus:bg-accent focus:outline-none transition-shadow duration-200 ${statusClasses[saveStatus]} ${className}`}
    />
  );
};

export default FinancialInput;
