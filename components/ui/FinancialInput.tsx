import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabaseClient';
import { debounce } from 'lodash';
import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { formatErrorMessage } from '../../utils/errorHandler';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface FinancialInputProps {
  stockId: string;
  metricId: string;
  periodId: string;
  subsegmentId?: string | null;
  defaultValue: number | null;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  onSaveSuccess?: (newValue: number | null) => void;
}

const FinancialInput: React.FC<FinancialInputProps> = ({
  stockId,
  metricId,
  periodId,
  subsegmentId = null,
  defaultValue,
  disabled = false,
  className = '',
  placeholder = '-',
  onSaveSuccess,
}) => {
  const [value, setValue] = useState<string>(defaultValue === null || defaultValue === undefined ? '' : String(defaultValue));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  useEffect(() => {
    setValue(defaultValue === null || defaultValue === undefined ? '' : String(defaultValue));
  }, [defaultValue]);

  const saveValue = useCallback(async (valueToSave: number | null) => {
    setSaveStatus('saving');
    
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 200;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        let query = supabase
          .from('financial_values')
          .select('id')
          .eq('stock_id', stockId)
          .eq('metric_id', metricId)
          .eq('period_id', periodId);
        
        if (subsegmentId) {
          query = query.eq('subsegment_id', subsegmentId);
        } else {
          query = query.is('subsegment_id', null);
        }
        
        // FIX: Change from .maybeSingle() to a regular query to handle potential duplicate records.
        const { data: existingRecords, error: checkError } = await query;
        if (checkError) throw checkError;

        const payload = { stock_id: stockId, metric_id: metricId, period_id: periodId, subsegment_id: subsegmentId, value: valueToSave };
        
        if (existingRecords && existingRecords.length > 0) {
          // If duplicates exist, update all of them to resolve the inconsistency.
          if (existingRecords.length > 1) {
            console.warn(`Found ${existingRecords.length} duplicate records for metric ${metricId}. Updating all of them.`);
          }
          const updatePromises = existingRecords.map(record =>
            supabase.from('financial_values').update({ value: valueToSave }).eq('id', record.id)
          );
          const results = await Promise.all(updatePromises);
          const firstError = results.find(res => res.error);
          if (firstError) throw firstError.error;

        } else if (valueToSave !== null) {
          // No existing record, so insert a new one if there's a value.
          const { error: insertError } = await supabase.from('financial_values').insert(payload);
          if (insertError) throw insertError;
        }
        
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
        onSaveSuccess?.(valueToSave);
        return; // Success, exit retry loop

      } catch (error) {
        const errorMessage = formatErrorMessage(`Save attempt ${attempt} for metric ${metricId} failed`, error);
        console.error(errorMessage);
        if (attempt === MAX_RETRIES) {
          setSaveStatus('error');
        } else {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
      }
    }
  }, [stockId, metricId, periodId, subsegmentId, onSaveSuccess]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSave = useCallback(debounce(saveValue, 500), [saveValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setValue(inputValue);
    
    // Reset status on new input to provide immediate feedback
    if (saveStatus === 'error') {
        setSaveStatus('idle');
    }

    setSaveStatus('saving');
    const numericValue = inputValue === '' ? null : parseFloat(inputValue);

    if (inputValue === '' || !isNaN(numericValue as number)) {
      debouncedSave(numericValue);
    }
  };
  
  const getStatusIndicator = () => {
    switch(saveStatus) {
      case 'saving': return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case 'saved': return <CheckCircle className="w-4 h-4 text-success" />;
      case 'error': return <AlertTriangle className="w-4 h-4 text-danger" />;
      default: return null;
    }
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        type="number"
        step="any"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-transparent p-2 text-right rounded hover:bg-accent focus:bg-accent focus:outline-none disabled:cursor-not-allowed disabled:text-text-secondary"
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        {getStatusIndicator()}
      </div>
    </div>
  );
};

export default FinancialInput;