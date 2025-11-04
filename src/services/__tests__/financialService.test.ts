// Fix: Explicitly import Jest globals to resolve type definition errors.
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock the entire supabase client to isolate service logic.
const mockUpsert = jest.fn();
const mockSelect = jest.fn();
const mockUpdate = jest.fn();
const mockInsert = jest.fn();
const mockNeq = jest.fn();
const mockIs = jest.fn();
const mockMaybeSingle = jest.fn();
const mockSingle = jest.fn();
const mockFrom = jest.fn();

jest.mock('../supabaseClient', () => ({
  supabase: {
    from: mockFrom,
  },
}));

import { saveFinancialValue, ensurePeriodExistsAndLink } from '../financialService';
import { addMetricAndLinkPeriods } from '../metricService';
import * as dbHelpers from '../../utils/dbHelpers';

// Spy on and mock the dbHelpers module to test interactions.
const createPlaceholderValuesSpy = jest.spyOn(dbHelpers, 'createPlaceholderValues').mockResolvedValue(4); // Mock a return value of 4 created placeholders.

describe('Financial Services Layer', () => {
    
  beforeEach(() => {
    // Reset all mocks before each test to ensure isolation.
    jest.clearAllMocks();
    
    // Set up the default mock chain for Supabase calls.
    mockFrom.mockImplementation(() => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      upsert: mockUpsert,
    }));
    mockSelect.mockImplementation(() => ({
      eq: jest.fn().mockReturnThis(),
      neq: mockNeq.mockReturnThis(),
      is: mockIs.mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: mockMaybeSingle,
      single: mockSingle,
    }));
  });

  describe('ensurePeriodExistsAndLink', () => {
    const params = {
      stockId: 'stock-123',
      periodLabel: 'Q1 2025',
      periodType: 'quarter' as const,
    };

    it('should successfully add a period and create placeholders', async () => {
      // Arrange:
      // 1. Global conflict check returns no conflicting row.
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
      // 2. Period upsert returns the new period's data.
      mockSingle.mockResolvedValueOnce({ data: { id: 'new-period-id' }, error: null });
      // 3. Metric fetch returns existing metrics for the stock.
      mockSelect.mockResolvedValueOnce({ data: [{ id: 'metric-1' }, { id: 'metric-2' }], error: null });

      // Act
      const result = await ensurePeriodExistsAndLink(params);

      // Assert
      expect(result.ok).toBe(true);
      expect(result.data?.period.id).toBe('new-period-id');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          stock_id: params.stockId,
          period_label: params.periodLabel,
        }),
        { onConflict: 'stock_id, period_label, period_type' }
      );
      expect(createPlaceholderValuesSpy).toHaveBeenCalledWith(
        params.stockId,
        ['new-period-id'],
        [{ id: 'metric-1' }, { id: 'metric-2' }]
      );
      expect(result.data?.created_count).toBe(4); // From our mocked return value
    });

    it('should return a user-friendly error if a global conflict is detected', async () => {
      // Arrange: Global conflict check finds a period for a different stock.
      mockMaybeSingle.mockResolvedValueOnce({ data: { stock_id: 'other-stock-456' }, error: null });

      // Act
      const result = await ensurePeriodExistsAndLink(params);
      
      // Assert
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('already exists for another stock');
      expect(mockUpsert).not.toHaveBeenCalled();
      expect(createPlaceholderValuesSpy).not.toHaveBeenCalled();
    });
  });

  describe('addMetricAndLinkPeriods', () => {
    it('should add a new metric and create placeholders for all existing periods', async () => {
        // Arrange:
        // 1. Metric insert returns the new metric's data.
        mockSingle.mockResolvedValueOnce({ data: { id: 'new-metric-id' }, error: null });
        // 2. Period fetch returns existing periods for the stock.
        mockSelect.mockResolvedValueOnce({ data: [{ id: 'period-1' }, { id: 'period-2' }], error: null });
        
        // Act
        const result = await addMetricAndLinkPeriods({
            stockId: 'stock-123',
            metricName: 'New Test Metric',
            displayOrder: 5,
        });

        // Assert
        expect(result.ok).toBe(true);
        expect(result.data?.metric.id).toBe('new-metric-id');
        expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ metric_name: 'New Test Metric' }));
        expect(createPlaceholderValuesSpy).toHaveBeenCalledWith(
            'stock-123',
            ['period-1', 'period-2'],
            [expect.objectContaining({ id: 'new-metric-id' })]
        );
        expect(result.data?.created_count).toBe(4);
    });
  });

  describe('saveFinancialValue (Manual Upsert)', () => {
      const payload = {
          id: 'unique-id',
          stock_id: 'stock-123',
          metric_id: 'metric-1',
          period_id: 'period-1',
          subsegment_id: null,
          metric_value: 100,
      };

      it('should INSERT a new value when none exists', async () => {
          // Arrange: SELECT returns no existing row.
          mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
          mockInsert.mockResolvedValueOnce({ error: null });

          // Act
          const result = await saveFinancialValue(payload);

          // Assert
          expect(result.ok).toBe(true);
          expect(mockIs).toHaveBeenCalledWith('subsegment_id', null);
          expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ metric_value: 100 }));
          expect(mockUpdate).not.toHaveBeenCalled();
      });

      it('should UPDATE an existing value when one is found', async () => {
          // Arrange: SELECT returns an existing row ID.
          mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'existing-value-id-abc' }, error: null });
          mockUpdate.mockImplementation(() => ({
            eq: jest.fn().mockResolvedValue({ error: null })
          }));

          // Act
          const result = await saveFinancialValue(payload);

          // Assert
          expect(result.ok).toBe(true);
          expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ metric_value: 100 }));
          expect(mockInsert).not.toHaveBeenCalled();
      });
  });
});
