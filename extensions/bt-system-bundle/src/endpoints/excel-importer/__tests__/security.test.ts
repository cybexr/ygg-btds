import { describe, it, expect, vi } from 'vitest';
import { createVirusScanner, ClamAvHttpScanner, LocalClamAvScanner, NoOpVirusScanner } from '../utils/virus-scanner';

describe('VirusScanner', () => {
    it('should return NoOpScanner when disabled', () => {
        const scanner = createVirusScanner({ EXCEL_UPLOAD_ENABLE_VIRUS_SCAN: 'false' });
        expect(scanner).toBeInstanceOf(NoOpVirusScanner);
    });

    it('should return ClamAvHttpScanner when endpoint provided', () => {
        const scanner = createVirusScanner({ 
            EXCEL_UPLOAD_ENABLE_VIRUS_SCAN: 'true',
            EXCEL_UPLOAD_VIRUS_SCAN_ENDPOINT: 'http://localhost:3310/scan'
        });
        expect(scanner).toBeInstanceOf(ClamAvHttpScanner);
    });

    it('should return LocalClamAvScanner when local flag set', () => {
        const scanner = createVirusScanner({ 
            EXCEL_UPLOAD_ENABLE_VIRUS_SCAN: 'true',
            EXCEL_UPLOAD_VIRUS_SCAN_LOCAL: 'true'
        });
        expect(scanner).toBeInstanceOf(LocalClamAvScanner);
    });
});
