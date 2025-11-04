import { supabase } from '../services/supabaseClient';
import { FinancialMetric, FinancialValue } from '../types';

/**
 * Creates placeholder financial value rows for a given set of metrics and periods.
 * This ensures the UI has rows to populate, and subsequent saves will be updates.
 * It performs a bulk upsert to be efficient and avoid creating duplicates.
 *
 * @param stockId - The ID of the stock.
 * @param periodIds - An array of period IDs to link.
 * @param metrics - The list of all metrics for the stock, including subsegments.
 * @returns The number of placeholder values created.
 */
export async function createPlaceholderValues(
    stockId: string,
    periodIds: string[],
    metrics: Pick<FinancialMetric, 'id' | 'financial_subsegments'>[]
): Promise<number> {
    if (!periodIds.length || !metrics.length) {
        return 0;
    }

    const newValuesToCreate: Omit<FinancialValue, 'id' | 'created_at' | 'updated_at'>[] = [];

    for (const periodId of periodIds) {
        for (const metric of metrics) {
            const hasSubsegments = metric.financial_subsegments && metric.financial_subsegments.length > 0;

            // Always add a placeholder for the main metric (it holds the total for subsegmented metrics)
            newValuesToCreate.push({
                stock_id: stockId,
                metric_id: metric.id,
                period_id: periodId,
                subsegment_id: null,
                metric_value: null
            });

            if (hasSubsegments) {
                for (const sub of metric.financial_subsegments) {
                    newValuesToCreate.push({
                        stock_id: stockId,
                        metric_id: metric.id,
                        period_id: periodId,
                        subsegment_id: sub.id,
                        metric_value: null
                    });
                }
            }
        }
    }
    
    if (newValuesToCreate.length > 0) {
        // Use upsert with `ignoreDuplicates: true`. This is safer than a complex `onConflict` clause
        // and efficiently handles cases where some placeholders might already exist.
        const { error } = await supabase
            .from('financial_values')
            .upsert(newValuesToCreate, { ignoreDuplicates: true });

        if (error) {
            console.error("Bulk placeholder creation failed:", error);
            throw error;
        }
    }
    
    return newValuesToCreate.length;
}
