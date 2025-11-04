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

    const { data: existingPeriod, error: checkError } = await supabase
      .from('financial_period')
      .select('id, stock_id')
      .eq('period_label', periodLabel)
      .eq('period_type', periodType)
      .eq('stock_id', stockId)
      .maybeSingle();

    if (checkError) throw checkError;

    let period = existingPeriod;

    if (!existingPeriod) {
      const { data: inserted, error: insertError } = await supabase
        .from('financial_period')
        .insert({
          stock_id: stockId,
          period_label: periodLabel,
          period_type: periodType,
          display_order: extractYearFromLabel(periodLabel),
          updated_at: new Date().toISOString(),
        })
        .onConflict('stock_id,period_label,period_type')
        .select()
        .single();

      if (insertError) throw insertError;
      if (!inserted) throw new Error('Period insert returned no data');

      period = inserted;
    }

    await createPlaceholderValuesForPeriod(stockId, period.id, metrics);

    return { ok: true, data: period };
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

    placeholderRows.push({
      stock_id: stockId,
      metric_id: metric.id,
      period_id: periodId,
      subsegment_id: null,
      metric_value: null,
    });

    return placeholderRows;
  });

  for (const row of placeholders) {
    await saveFinancialValue({ ...row, id: '' });
  }
}
