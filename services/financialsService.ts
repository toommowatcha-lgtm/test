import { supabase } from './supabaseClient';
import { formatErrorMessage } from '../utils/errorHandler';
import { FinancialPeriod, FinancialMetric, SavePayload } from '../types';

/**
 * Save or update a single financial value row.
 * Manual upsert logic (v2 no longer supports `.onConflict()` on insert)
 */
export async function saveFinancialValue(payload: SavePayload) {
  const { stock_id, metric_id, period_id, subsegment_id, metric_value } = payload;

  let query = supabase
    .from('financial_values')
    .select('id')
    .eq('stock_id', stock_id)
    .eq('metric_id', metric_id)
    .eq('period_id', period_id);

  if (subsegment_id) query = query.eq('subsegment_id', subsegment_id);
  else query = query.is('subsegment_id', null);

  const { data: existing, error: selectError } = await query.maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    const { error } = await supabase
      .from('financial_values')
      .update({ metric_value, updated_at: new Date().toISOString() })
      .eq('id', existing.id);

    if (error) throw error;
  } else {
    const { error } = await supabase.from('financial_values').insert({
      stock_id,
      metric_id,
      period_id,
      subsegment_id,
      metric_value,
    });

    if (error) throw error;
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

const getYear = (label: string): number => {
  const match = label.match(/\b(\d{4})\b/);
  return match ? parseInt(match[1], 10) : new Date().getFullYear();
};

/**
 * Creates or updates a period safely, then links all metrics.
 * ✅ Fully compatible with Supabase JS v2
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
      .maybeSingle();

    if (checkError) throw checkError;

    if (existingPeriod && existingPeriod.stock_id !== stockId) {
      return {
        ok: false,
        error: {
          message:
            'A period with this name already exists for another stock. Due to DB unique constraint, rename period or change DB schema.',
        },
      };
    }

    const { data: period, error: upsertError } = await supabase
      .from('financial_period')
      .upsert(
        {
          stock_id: stockId,
          period_label: periodLabel,
          period_type: periodType,
          display_order: getYear(periodLabel),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'stock_id,period_label,period_type',
        }
      )
      .select()
      .single();

    if (upsertError) throw upsertError;
    if (!period) throw new Error('Upsert did not return a row');

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
 * Auto create placeholder values for new period.
 */
async function createPlaceholderValuesForPeriod(
  stockId: string,
  periodId: string,
  metrics: FinancialMetric[]
) {
  if (!metrics?.length) return;

  const rows = metrics.flatMap((m) => {
    const subRows = m.financial_subsegments?.length
      ? m.financial_subsegments.map((s) => ({
          stock_id: stockId,
          metric_id: m.id,
          period_id: periodId,
          subsegment_id: s.id,
          metric_value: null,
        }))
      : [];

    return [
      ...subRows,
      {
        stock_id: stockId,
        metric_id: m.id,
        period_id: periodId,
        subsegment_id: null,
        metric_value: null,
      },
    ];
  });

  for (const row of rows) {
    await saveFinancialValue({ ...row, id: '' });
  }
}
