import { supabase } from './supabaseClient';
import { formatErrorMessage } from '../utils/errorHandler';
import { FinancialPeriod, FinancialMetric, SavePayload } from '../types';

/**
 * Saves or updates a single financial value.
 */
export async function saveFinancialValue(payload: SavePayload) {
  const { stock_id, metric_id, period_id, subsegment_id, metric_value } = payload;

  let selectQuery = supabase
    .from('financial_values')
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
    const { error: updateError } = await supabase
      .from('financial_values')
      .update({
        metric_value,
        updated_at: new Date().toISOString(),
      })
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

/* ---------------- Period Creation Logic ---------------- */

interface EnsurePeriodParams {
  stockId: string;
  periodLabel: string;
  periodType: 'quarter' | 'annual';
  metrics: FinancialMetric[];
}

interface EnsurePeriodResult {
  ok: boolean;
  data?: FinancialPeriod;
  updatedMetrics?: FinancialMetric[];
  error?: { message: string };
}

const extractYearFromLabel = (label: string): number => {
  const match = label.match(/\b(\d{4})\b/);
  return match ? parseInt(match[1], 10) : new Date().getFullYear();
};

/**
 * Creates or ensures a period exists & links all existing metrics.
 */
export async function ensurePeriodExistsAndLink({
  stockId,
  periodLabel,
  periodType,
  metrics,
}: EnsurePeriodParams): Promise<EnsurePeriodResult> {
  try {
    if (!stockId || !periodLabel.trim()) {
      return { ok: false, error: { message: 'Missing stockId or periodLabel' } };
    }

    // ✅ Upsert using Supabase v2 syntax
    const { data: period, error: upsertError } = await supabase
      .from('financial_period')
      .upsert(
        {
          stock_id: stockId,
          period_label: periodLabel,
          period_type: periodType,
          display_order: extractYearFromLabel(periodLabel),
          updated_at: new Date().toISOString(),
        },
        { onConflict: ["stock_id", "period_label", "period_type"] }
      )
      .select()
      .single();

    if (upsertError) throw upsertError;
    if (!period) throw new Error('Upsert did not return a period row');

    // ✅ Create placeholder rows in batch
    await createPlaceholderValuesForPeriod(stockId, period.id, metrics);

    return { ok: true, data: period, updatedMetrics: metrics };
  } catch (err: any) {
    return {
      ok: false,
      error: { message: formatErrorMessage('Failed to add and link financial period', err) },
    };
  }
}

/**
 * Ensures placeholder values exist for all metrics/subsegments for new period.
 */
async function createPlaceholderValuesForPeriod(
  stockId: string,
  periodId: string,
  metrics: FinancialMetric[]
) {
  if (!metrics || metrics.length === 0) return;

  const placeholders = metrics.flatMap((metric) => {
    const hasSubsegments = metric.financial_subsegments?.length > 0;

    const placeholderRows = hasSubsegments
      ? metric.financial_subsegments.map((sub) => ({
          stock_id: stockId,
          metric_id: metric.id,
          period_id: periodId,
          subsegment_id: sub.id,
          metric_value: null,
        }))
      : [];

    // Always add base metric row even if has subsegments
    placeholderRows.push({
      stock_id: stockId,
      metric_id: metric.id,
      period_id: periodId,
      subsegment_id: null,
      metric_value: null,
    });

    return placeholderRows;
  });

  // ✅ Batch insert to prevent 50 sequential requests
  const { error } = await supabase.from('financial_values').insert(placeholders);

  if (error && !error.message.includes('duplicate')) {
    throw error;
  }
}
