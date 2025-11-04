// services/financialService.ts (v3)
import { supabase } from './supabaseClient';
import { formatErrorMessage } from '../utils/errorHandler';
import { FinancialMetric, FinancialPeriod } from '../types';

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

const extractYear = (label: string): number => {
  const m = label.match(/\b(\d{4})\b/);
  return m ? parseInt(m[1], 10) : new Date().getFullYear();
};

/**
 * Ensure period exists (per-stock upsert) and create placeholders for metric values.
 * Uses Supabase JS v2 upsert with onConflict string.
 */
export async function ensurePeriodExistsAndLinkV3({
  stockId,
  periodLabel,
  periodType,
  metrics,
}: EnsurePeriodParams): Promise<EnsurePeriodResult> {
  try {
    if (!stockId || !periodLabel || !periodType) {
      return { ok: false, error: { message: 'Missing required params' } };
    }

    // Optional: quick check to catch global-constraint cross-stock collisions and
    // return clearer message to UI (helps avoid cryptic DB errors)
    const { data: existingPeriod, error: checkErr } = await supabase
      .from('financial_period')
      .select('id,stock_id')
      .eq('period_label', periodLabel)
      .eq('period_type', periodType)
      .maybeSingle();

    if (checkErr) {
      // continue - we'll still try upsert, but surface reason
      console.warn('checkErr', checkErr);
    } else if (existingPeriod && existingPeriod.stock_id !== stockId) {
      return {
        ok: false,
        error: {
          message:
            'A period with this name already exists for another stock. Please use a unique period name or rename the period.',
        },
      };
    }

    // Upsert the period using per-stock conflict columns (string form)
    const payload = {
      stock_id: stockId,
      period_label: periodLabel,
      period_type: periodType,
      display_order: extractYear(periodLabel),
      updated_at: new Date().toISOString(),
    };

    const { data: period, error: upsertErr } = await supabase
      .from('financial_period')
      .upsert(payload, { onConflict: 'stock_id,period_label,period_type' })
      .select()
      .single();

    if (upsertErr) throw upsertErr;
    if (!period) throw new Error('Upsert did not return period row');

    const periodId = period.id as string;

    // Build placeholder rows for batch insert
    const placeholders: any[] = [];
    if (Array.isArray(metrics) && metrics.length > 0) {
      for (const m of metrics) {
        const subs = (m.financial_subsegments ?? []);
        if (Array.isArray(subs) && subs.length > 0) {
          for (const s of subs) {
            placeholders.push({
              stock_id: stockId,
              metric_id: m.id,
              period_id: periodId,
              subsegment_id: s.id,
              metric_value: null,
            });
          }
        }
        // base row
        placeholders.push({
          stock_id: stockId,
          metric_id: m.id,
          period_id: periodId,
          subsegment_id: null,
          metric_value: null,
        });
      }
    }

    let created_count = 0;
    if (placeholders.length > 0) {
      // Perform batch insert. If duplicates exist, Supabase may return an error.
      // We'll tolerate duplicate-key errors and treat as success—rows already present.
      const { error: insertErr } = await supabase.from('financial_values').insert(placeholders);
      if (insertErr) {
        const msg = insertErr.message || '';
        if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('violates unique')) {
          // ignore duplicate unique violations (placeholders already exist)
          created_count = 0;
        } else {
          throw insertErr;
        }
      } else {
        created_count = placeholders.length;
      }
    }

    return { ok: true, period, created_count };
  } catch (err: any) {
    return { ok: false, error: { message: formatErrorMessage('Failed to add and link financial period', err) } };
  }
}
