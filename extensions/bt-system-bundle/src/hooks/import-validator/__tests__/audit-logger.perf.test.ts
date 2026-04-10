import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportAuditLogger, ErrorSeverity } from '../audit-logger';
import { performance } from 'perf_hooks';

describe('ImportAuditLogger Performance', () => {
    let mockKnex: any;
    let logger: ImportAuditLogger;

    beforeEach(() => {
        const mockInsert = vi.fn().mockResolvedValue([1]);
        const mockTable = vi.fn(() => ({
            insert: mockInsert
        }));
        
        mockKnex = mockTable;
        logger = new ImportAuditLogger(mockKnex as any);
    });

    it('logImportError should execute within 10ms', async () => {
        const record = {
            import_job_id: 1,
            row_number: 1,
            error_type: 'validation',
            error_message: 'Test error',
            severity: ErrorSeverity.ERROR
        };

        const start = performance.now();
        await logger.logImportError(record);
        const end = performance.now();
        
        const duration = end - start;
        expect(duration).toBeLessThan(10);
    });

    it('logAction should execute within 10ms', async () => {
        const record = {
            action_type: 'CREATE',
            action_category: 'IMPORT',
            status: 'success' as const,
            risk_level: 'low' as const
        };

        const start = performance.now();
        await logger.logAction(record);
        const end = performance.now();
        
        const duration = end - start;
        expect(duration).toBeLessThan(10);
    });

    it('logImportErrors batch insert should average less than 10ms per operation equivalent (or just test batch execution is fast)', async () => {
        const records = Array.from({ length: 100 }).map((_, i) => ({
            import_job_id: 1,
            row_number: i + 1,
            error_type: 'validation',
            error_message: 'Test error',
            severity: ErrorSeverity.ERROR
        }));

        const start = performance.now();
        await logger.logImportErrors(records);
        const end = performance.now();
        
        const duration = end - start;
        // Even for 100 records, the synchronous part of mock insert should be very fast.
        // The requirement says "do not exceed 10ms per operation". 
        // We ensure the whole batch mock call is under 10ms for safety, or at least under 10ms per record.
        expect(duration / records.length).toBeLessThan(10);
        // Let's also check total duration is reasonable
        expect(duration).toBeLessThan(50);
    });
});
