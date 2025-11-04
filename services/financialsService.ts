
import { supabase } from './supabaseClient';
import { formatErrorMessage } from '../utils/errorHandler';
import { FinancialPeriod, FinancialMetric, SavePayload, FinancialValue } from '../types';

/**
 * Performs a manual "upsert" for a financial value. It first checks if a record
 * exists and then either updates it or inserts a new one. This circumvents issues
 * with database-level ON CONFLICT logic for nullable columns.
 * @param payload - The financial value data to save.
 */
export async function saveFinancialValue(payload: SavePayload) {
  const { stock_id, metric_id, period_id, subsegment_id, metric_value } = payload;

  let selectQuery = supabase.from('financial_values')
    .select('id')
    .eq('stock_id', stock_id)
    .eq('metric_id', metric_id)
    .eq('period_id', period_id);

  if (subsegment_id) {
    selectQuery = selectQuery.eq('subsegment_id', subsegment_id);
  } else {
    selectQuery = selectQuery.is('subsegment_id', null);
  }

  const { data: existing, error: selectError } = await selectQuery.maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    const { error: updateError } = await supabase.from('financial_values')
      .update({ metric_value: metric_value, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supabase.from('financial_values').insert({
      stock_id,
      metric_id,
      period_id,
      subsegment_id,
      metric_value,
    });
    if (insertError) throw insertError;
  }
}


interface EnsurePeriodParams {
    stockId: string;
    periodLabel: string;
    periodType: 'quarter' | 'annual';
    metrics: FinancialMetric[];
}

interface EnsurePeriodResult {
    ok: boolean;
    period?: FinancialPeriod;
    created_count?: number;
    error?: { message: string };
}

/**
 * Safely extracts a year from a period label string (e.g., "Q1 2024" or "2024").
 * @param label - The period label.
 * @returns The extracted year or the current year as a fallback.
 */
const getYearFromLabel = (label: string): number => {
    const match = label.match(/\b(\d{4})\b/);
    if (match) {
        return parseInt(match[1], 10);
    }
    // Fallback to current year if no year is found in the label
    return new Date().getFullYear();
};

/**
 * Creates or updates a financial period for a specific stock using a direct upsert operation.
 * It then links the stock's metrics to this period by creating placeholder financial values.
 * This function assumes the unique constraint on `(stock_id, period_label, period_type)` exists.
 *
 * @param params - The details of the financial period and context.
 * @returns A promise that resolves to an object containing the period data or an error.
 */
export async function ensurePeriodExistsAndLink({
    stockId,
    periodLabel,
    periodType,
    metrics,
}: EnsurePeriodParams): Promise<EnsurePeriodResult> {
    try {
        // Step 1: Validate inputs.
        if (!stockId || !periodLabel.trim() || !periodType) {
            return { ok: false, error: { message: 'Invalid input: stockId, periodLabel, and periodType are required.' } };
        }
        
        // Step 2: Directly upsert the period using the per-stock unique constraint.
        // We only provide the columns that define the record and its values, letting the DB handle defaults.
        const { data: period, error: upsertError } = await supabase
            .from('financial_period')
            .upsert(
                {
                    stock_id: stockId,
                    period_label: periodLabel,
                    period_type: periodType,
                    display_order: getYearFromLabel(periodLabel),
                },
                {
                    onConflict: 'stock_id, period_label, period_type',
                }
            )
            .select()
            .single();

        if (upsertError) throw upsertError;
        if (!period) throw new Error('Upsert operation did not return the period record.');

        // Step 3: Create placeholder values to link all metrics to this new/existing period.
        const created_count = await createPlaceholderValuesForPeriod(stockId, period.id, metrics);

        return { ok: true, period: period, created_count };

    } catch (err: any) {
        const errorMessage = formatErrorMessage('Failed to add and link financial period', err);
        return { ok: false, error: { message: errorMessage } };
    }
}

/**
 * Creates placeholder financial value rows for all existing metrics for a given period.
 * This ensures the UI has rows to populate, and subsequent saves will be updates.
 *
 * @param stockId - The ID of the stock.
 * @param periodId - The ID of the period to link.
 * @param metrics - The list of all metrics for the stock.
 * @returns The number of placeholder values created.
 */
async function createPlaceholderValuesForPeriod(stockId: string, periodId: string, metrics: FinancialMetric[]): Promise<number> {
    const newValuesToCreate = metrics.flatMap(metric => {
        const hasSubsegments = metric.financial_subsegments && metric.financial_subsegments.length > 0;
        const placeholders: Omit<SavePayload, 'id'>[] = hasSubsegments
            ? metric.financial_subsegments.map(sub => ({
                  stock_id: stockId,
                  metric_id: metric.id,
                  period_id: periodId,
                  subsegment_id: sub.id,
                  metric_value: null
              }))
            : [];
        
        // Always add a placeholder for the main metric (it will hold the total for subsegmented metrics)
        placeholders.push({
            stock_id: stockId,
            metric_id: metric.id,
            period_id: periodId,
            subsegment_id: null,
            metric_value: null
        });
        return placeholders;
    });

    if (newValuesToCreate.length > 0) {
        // Perform saves sequentially to avoid race conditions and ensure rows exist
        for (const val of newValuesToCreate) {
             await saveFinancialValue({ ...val, id: '' }); // ID is not used by saveFinancialValue
        }
    }
    return newValuesToCreate.length;
}
