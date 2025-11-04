import { supabase } from './supabaseClient';
import { formatErrorMessage } from '../utils/errorHandler';
import { createPlaceholderValues } from '../utils/dbHelpers';
import { FinancialPeriod, SavePayload } from '../types';

interface ServiceResult<T> {
    ok: boolean;
    data?: T;
    error?: { message: string };
}

/**
 * Performs a robust manual "upsert" for a single financial value.
 * This approach is more reliable than a native upsert when dealing with nullable foreign keys
 * like `subsegment_id`.
 *
 * @param payload - The financial value data to save.
 * @returns A promise resolving to a service result with the saved data.
 */
export async function saveFinancialValue(payload: SavePayload): Promise<ServiceResult<SavePayload>> {
  try {
    const { stock_id, metric_id, period_id, subsegment_id, metric_value } = payload;

    // 1. SELECT to check for an existing row.
    let selectQuery = supabase.from('financial_values')
      .select('id')
      .eq('stock_id', stock_id)
      .eq('metric_id', metric_id)
      .eq('period_id', period_id);

    // Handle null-safe check for subsegment_id
    selectQuery = subsegment_id ? selectQuery.eq('subsegment_id', subsegment_id) : selectQuery.is('subsegment_id', null);

    const { data: existing, error: selectError } = await selectQuery.maybeSingle();
    if (selectError) throw selectError;

    // 2. Based on existence, UPDATE or INSERT.
    if (existing) {
      // UPDATE existing record
      const { error: updateError } = await supabase.from('financial_values')
        .update({ metric_value, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (updateError) throw updateError;
    } else {
      // INSERT new record
      const { error: insertError } = await supabase.from('financial_values').insert({
        stock_id,
        metric_id,
        period_id,
        subsegment_id,
        metric_value,
      });
      if (insertError) throw insertError;
    }

    return { ok: true, data: payload };

  } catch (err: unknown) {
    const message = formatErrorMessage('Failed to save financial value', err);
    return { ok: false, error: { message } };
  }
}

interface EnsurePeriodParams {
    stockId: string;
    periodLabel: string;
    periodType: 'quarter' | 'annual';
}

/**
 * Safely creates or finds a financial period.
 * It first checks for a potential global unique constraint violation before attempting an upsert.
 * After ensuring the period exists, it creates placeholder values for all metrics of the stock.
 *
 * @param params - The details of the financial period and context.
 * @returns A promise resolving to a service result with the period and placeholder count.
 */
export async function ensurePeriodExistsAndLink({ stockId, periodLabel, periodType }: EnsurePeriodParams): Promise<ServiceResult<{ period: FinancialPeriod; created_count: number }>> {
    try {
        if (!stockId || !periodLabel.trim() || !periodType) {
            return { ok: false, error: { message: 'Invalid input: stockId, periodLabel, and periodType are required.' } };
        }

        // 1. Check for global unique constraint violation to provide a better error message.
        const { data: globalConflict, error: conflictCheckError } = await supabase
            .from('financial_period')
            .select('stock_id')
            .eq('period_label', periodLabel)
            .eq('period_type', periodType)
            .neq('stock_id', stockId)
            .limit(1)
            .maybeSingle();

        if (conflictCheckError && conflictCheckError.code !== 'PGRST116') throw conflictCheckError; // Ignore "no rows" error
        if (globalConflict) {
            return { ok: false, error: { message: `A period with label "${periodLabel}" and type "${periodType}" already exists for another stock. Your database may have a global unique constraint on these fields. Please use a different label or update your database schema.` } };
        }

        // 2. Upsert the period for the current stock.
        const getYearFromLabel = (label: string): number => {
            const match = label.match(/\b(\d{4})\b/);
            return match ? parseInt(match[1], 10) : new Date().getFullYear();
        };

        const { data: period, error: upsertError } = await supabase
            .from('financial_period')
            .upsert({
                stock_id: stockId,
                period_label: periodLabel,
                period_type: periodType,
                display_order: getYearFromLabel(periodLabel),
            }, {
                onConflict: 'stock_id, period_label, period_type',
            })
            .select()
            .single();

        if (upsertError) throw upsertError;
        if (!period) throw new Error('Upsert operation did not return the period record.');

        // 3. Fetch all metrics for this stock to create placeholders.
        const { data: metrics, error: metricsError } = await supabase
            .from('financial_metric')
            .select('id, financial_subsegments(id)')
            .eq('stock_id', stockId);

        if (metricsError) throw metricsError;

        // 4. Create placeholder values to link all metrics to this new/existing period.
        const created_count = await createPlaceholderValues(stockId, [period.id], metrics || []);

        return { ok: true, data: { period, created_count } };

    } catch (err: unknown) {
        const errorMessage = formatErrorMessage('Failed to add and link financial period', err);
        return { ok: false, error: { message: errorMessage } };
    }
}
