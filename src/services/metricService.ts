import { supabase } from './supabaseClient';
import { formatErrorMessage } from '../utils/errorHandler';
import { createPlaceholderValues } from '../utils/dbHelpers';
import { FinancialMetric, FinancialPeriod } from '../types';

interface ServiceResult<T> {
    ok: boolean;
    data?: T;
    error?: { message: string };
}

interface AddMetricParams {
    stockId: string;
    metricName: string;
    displayOrder: number;
}

/**
 * Adds a new financial metric for a stock and links it to all existing periods
 * by creating placeholder financial values.
 *
 * @param params - The details of the new metric.
 * @returns A promise resolving to a service result with the new metric and placeholder count.
 */
export async function addMetricAndLinkPeriods({ stockId, metricName, displayOrder }: AddMetricParams): Promise<ServiceResult<{ metric: FinancialMetric; created_count: number }>> {
    try {
        if (!stockId || !metricName.trim()) {
            return { ok: false, error: { message: 'Invalid input: stockId and metricName are required.' } };
        }

        // 1. Insert the new metric definition.
        const { data: newMetric, error: insertError } = await supabase
            .from('financial_metric')
            .insert({
                stock_id: stockId,
                metric_name: metricName,
                display_order: displayOrder,
            })
            .select()
            .single();

        if (insertError) throw insertError;
        if (!newMetric) throw new Error("Insert operation did not return the new metric record.");

        // 2. Fetch all existing periods for this stock.
        const { data: periods, error: periodsError } = await supabase
            .from('financial_period')
            .select('id')
            .eq('stock_id', stockId);

        if (periodsError) throw periodsError;

        // 3. Create placeholder values for the new metric across all existing periods.
        const periodIds = (periods || []).map((p: Pick<FinancialPeriod, 'id'>) => p.id);
        const metricWithSubsegments = { ...newMetric, financial_subsegments: [] }; // Assume new metric has no subsegments initially
        const created_count = await createPlaceholderValues(stockId, periodIds, [metricWithSubsegments]);

        const metricResponse: FinancialMetric = {
            ...newMetric,
            financial_subsegments: [],
            financial_values: [], // Frontend will populate this on next fetch
        };
        
        return { ok: true, data: { metric: metricResponse, created_count } };

    } catch (err: unknown) {
        const errorMessage = formatErrorMessage('Failed to add metric and link periods', err);
        return { ok: false, error: { message: errorMessage } };
    }
}
