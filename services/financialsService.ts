import { supabase } from './supabaseClient';
import { formatErrorMessage } from '../utils/errorHandler';
import { FinancialPeriod, FinancialMetric, SavePayload } from '../types';

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
    data?: FinancialPeriod;
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
 * Creates or updates a financial period for a specific stock. It proactively checks for potential
 * global unique constraint violations before attempting an upsert, providing clearer error messages.
 * Then, it links the stock's metrics to this period by creating placeholder financial values.
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

        // Step 2: Proactively check for the global unique constraint violation.
        // This is the root cause of the cryptic error that leads to '[object Object]'.
        const { data: existingPeriod, error: checkError } = await supabase
            .from('financial_period')
            .select('id, stock_id')
            .eq('period_label', periodLabel)
            .eq('period_type', periodType)
            .maybeSingle();
        
        if (checkError) {
            throw checkError;
        }

        // If a period exists but belongs to a DIFFERENT stock, we throw a clear, custom error
        // that will be properly formatted instead of causing a cryptic database error.
        if (existingPeriod && existingPeriod.stock_id !== stockId) {
            throw new Error(
                'A period with this name already exists for another stock. This is due to a global unique constraint in your database (financial_period_unique_label_type). Please use a unique period name, or remove the global constraint to allow per-stock periods.'
            );
        }

        // Step 3: It's now safe to perform the upsert. This will only handle the per-stock case
        // as intended, creating a period if it doesn't exist for this stock or updating it if it does.
        const { data: period, error: upsertError } = await supabase
            .from('financial_period')
            .upsert(
                {
                    stock_id: stockId,
                    period_label: periodLabel,
                    period_type: periodType,
                    display_order: getYearFromLabel(periodLabel),
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: ['stock_id, period_label, period_type'], // Per-stock unique constraint
                }
            )
            .select()
            .single();

        if (upsertError) throw upsertError;
        if (!period) throw new Error('Upsert operation did not return the period record.');

        // Step 4: Create placeholder values to "link" this stock's metrics to the new/existing period.
        await createPlaceholderValuesForPeriod(stockId, period.id, metrics);

        return { ok: true, data: period };

    } catch (err: any) {
        // Our custom error from Step 2 will be caught here and formatted correctly.
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
 */
async function createPlaceholderValuesForPeriod(stockId: string, periodId: string, metrics: FinancialMetric[]): Promise<void> {
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
}