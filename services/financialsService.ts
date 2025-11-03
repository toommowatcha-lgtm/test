import { supabase } from './supabaseClient';
import { formatErrorMessage } from '../utils/errorHandler';

interface AddPeriodParams {
  metric_id: string;
  stock_id: string;
  period_id: string;
  metric_value: number | null;
}

interface AddPeriodResult {
  ok: boolean;
  error?: { message: string };
}

/**
 * Upserts a financial value for a given metric, stock, and period using an RPC function.
 * This function is designed for metrics that do not have sub-segments.
 * The RPC function handles the logic of inserting or updating the record.
 *
 * @param params - The details of the financial value to upsert.
 * @returns A promise that resolves to an object indicating success or failure.
 */
export async function addPeriod({
  metric_id,
  stock_id,
  period_id,
  metric_value,
}: AddPeriodParams): Promise<AddPeriodResult> {
  try {
    const { error } = await supabase.rpc("upsert_financial_value", {
      p_metric_id: metric_id,
      p_subsegment_id: null, // This function is for non-subsegment values
      p_stock_id: stock_id,
      p_period_id: period_id,
      p_value: metric_value,
    });

    if (error) {
      console.error('Supabase RPC error in addPeriod:', error);
      return { ok: false, error: { message: formatErrorMessage('Failed to save financial value', error) } };
    }

    return { ok: true };

  } catch (err) {
    const errorMessage = formatErrorMessage('An unexpected error occurred during save', err);
    return { ok: false, error: { message: errorMessage } };
  }
}
