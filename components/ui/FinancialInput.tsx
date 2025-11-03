import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useMetricSaveQueue } from '../../hooks/useMetricSaveQueue';
import { SaveStatus } from '../../types';

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
  const { addToQueue, getSaveStatus } = useMetricSaveQueue();
  const uniqueId = `${stockId}-${metricId}-${periodId}-${subsegmentId || 'null'}`;

  // Sync with defaultValue prop when it changes from parent
  useEffect(() => {
    setValue(defaultValue === null || defaultValue === undefined ? '' : String(defaultValue));
  }, [defaultValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setValue(inputValue);

    const numericValue = inputValue === '' ? null : parseFloat(inputValue);

    // Only queue valid numbers or empty string (for clearing)
    if (inputValue === '' || !isNaN(numericValue as number)) {
      addToQueue(
        {
          id: uniqueId,
          stock_id: stockId,
          metric_id: metricId,
          period_id: periodId,
          subsegment_id: subsegmentId,
          metric_value: numericValue,
        },
        onSaveSuccess
      );
    }
  };
  
  const statusInfo = getSaveStatus(uniqueId);

  const getStatusIndicator = () => {
    switch(statusInfo.status) {
      case 'queued':
      case 'saving': 
        return <Loader2 className="w-4 h-4 text-primary animate-spin" title="Saving..." />;
      case 'saved': 
        return <CheckCircle className="w-4 h-4 text-success" title="Saved" />;
      case 'retrying':
        return <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" title={statusInfo.error || "Retrying..."} />;
      case 'error': 
        return <AlertTriangle className="w-4 h-4 text-danger" title={statusInfo.error || "Save failed"} />;
      default: 
        return null;
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