import React, { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { supabase } from '../services/supabaseClient';
import { debounce } from 'lodash';
import { SavePayload, QueueItem, SaveStatus, SaveStatusInfo } from '../types';
import { formatErrorMessage } from '../utils/errorHandler';

const QUEUE_STORAGE_KEY = 'financialsSaveQueue';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

interface MetricSaveQueueContextType {
  addToQueue: (payload: SavePayload, onSaveSuccess?: (newValue: number | null) => void) => void;
  getSaveStatus: (id: string) => SaveStatusInfo;
}

const MetricSaveQueueContext = createContext<MetricSaveQueueContextType | undefined>(undefined);

// FIX: Explicitly type MetricSaveProvider as a React.FC to help TypeScript's JSX parser.
export const MetricSaveProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [statuses, setStatuses] = useState<Record<string, SaveStatusInfo>>({});
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const isProcessing = useRef(false);
  const debounceMap = useRef<Record<string, ReturnType<typeof debounce>>>({}).current;

  // Load queue from localStorage on initial mount
  useEffect(() => {
    try {
      const savedQueue = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (savedQueue) {
        const parsedQueue: QueueItem[] = JSON.parse(savedQueue);
        if (Array.isArray(parsedQueue) && parsedQueue.length > 0) {
          setQueue(parsedQueue);
          // Mark all loaded items as 'queued'
          const initialStatuses: Record<string, SaveStatusInfo> = {};
          parsedQueue.forEach(item => {
            initialStatuses[item.payload.id] = { status: 'queued' };
          });
          setStatuses(prev => ({ ...prev, ...initialStatuses }));
        }
      }
    } catch (error) {
      console.error("Failed to load save queue from localStorage", error);
    }
  }, []);

  // Persist queue to localStorage whenever it changes
  useEffect(() => {
    try {
      // We only store the payload and retries, not the callback function
      const queueToStore = queue.map(({ payload, retries }) => ({ payload, retries }));
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queueToStore));
    } catch (error) {
      console.error("Failed to save queue to localStorage", error);
    }
  }, [queue]);

  // Listen to online/offline status changes
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const processQueue = useCallback(async () => {
    if (isProcessing.current || queue.length === 0 || !isOnline) {
      return;
    }
    isProcessing.current = true;

    const item = queue[0];
    const { payload, retries, onSaveSuccess } = item;

    setStatuses(prev => ({ ...prev, [payload.id]: { status: retries > 0 ? 'retrying' : 'saving' } }));

    try {
      const { error } = await supabase.rpc("upsert_financial_value", {
        p_stock_id: payload.stock_id,
        p_metric_id: payload.metric_id,
        p_period_id: payload.period_id,
        p_subsegment_id: payload.subsegment_id,
        p_value: payload.metric_value,
      });

      if (error) throw error;
      
      // Success
      setStatuses(prev => ({ ...prev, [payload.id]: { status: 'saved' } }));
      setTimeout(() => {
        setStatuses(prev => {
          const newStatuses = { ...prev };
          if (newStatuses[payload.id]?.status === 'saved') {
            delete newStatuses[payload.id];
          }
          return newStatuses;
        });
      }, 2000);

      onSaveSuccess?.(payload.metric_value);
      setQueue(prev => prev.slice(1));

    } catch (error) {
      // Failure
      const errorMessage = formatErrorMessage('Save failed', error);
      console.error(`Attempt ${retries + 1} failed for ${payload.id}:`, errorMessage);

      if (retries < MAX_RETRIES) {
        // Retry
        const updatedItem = { ...item, retries: retries + 1 };
        setQueue(prev => [updatedItem, ...prev.slice(1)]);
        setStatuses(prev => ({ ...prev, [payload.id]: { status: 'retrying', error: `Retrying... (${retries + 1}/${MAX_RETRIES})` } }));
        setTimeout(() => {
            isProcessing.current = false;
            processQueue();
        }, RETRY_DELAY_MS * Math.pow(2, retries)); // Exponential backoff
        return; // Return early to avoid setting isProcessing to false immediately
      } else {
        // Max retries reached
        console.error(`Max retries reached for ${payload.id}. Item will remain in queue.`);
        setStatuses(prev => ({ ...prev, [payload.id]: { status: 'error', error: errorMessage } }));
        // Move to back of the queue to not block others
        setQueue(prev => [...prev.slice(1), item]);
      }
    }

    isProcessing.current = false;
  }, [queue, isOnline]);

  // Effect to trigger queue processing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (queue.length > 0 && isOnline && !isProcessing.current) {
        processQueue();
      }
    }, 100); // Small delay to batch updates
    return () => clearTimeout(timer);
  }, [queue, isOnline, processQueue]);

  const addToQueue = useCallback((payload: SavePayload, onSaveSuccess?: (newValue: number | null) => void) => {
    setStatuses(prev => ({ ...prev, [payload.id]: { status: 'queued' } }));

    if (debounceMap[payload.id]) {
      debounceMap[payload.id].cancel();
    }

    debounceMap[payload.id] = debounce(() => {
      setQueue(prevQueue => {
        const newItem: QueueItem = { payload, retries: 0, onSaveSuccess };
        const existingIndex = prevQueue.findIndex(item => item.payload.id === payload.id);
        
        if (existingIndex > -1) {
          // Replace existing item for the same input to only save the latest value
          const newQueue = [...prevQueue];
          newQueue[existingIndex] = newItem;
          return newQueue;
        } else {
          return [...prevQueue, newItem];
        }
      });
    }, 500);

    debounceMap[payload.id]();
  }, [debounceMap]);

  const getSaveStatus = useCallback((id: string): SaveStatusInfo => {
    return statuses[id] || { status: 'idle' };
  }, [statuses]);

  const contextValue = { addToQueue, getSaveStatus };

  // FIX: Replaced JSX with React.createElement to avoid syntax errors in a .ts file.
  return React.createElement(
    MetricSaveQueueContext.Provider,
    { value: contextValue },
    children
  );
};

export const useMetricSaveQueue = (): MetricSaveQueueContextType => {
  const context = useContext(MetricSaveQueueContext);
  if (context === undefined) {
    throw new Error('useMetricSaveQueue must be used within a MetricSaveProvider');
  }
  return context;
};