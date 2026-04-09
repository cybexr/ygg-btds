export interface FileUploadConfig {
	maxFileSizeBytes: number;
	validationTimeoutMs: number;
	parserTimeoutMs: number;
	parserMaxCells: number;
	parserMaxSheets: number;
	enableVirusScan: boolean;
	virusScanTimeoutMs: number;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	if (!value) {
		return fallback;
	}

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (!value) {
		return fallback;
	}

	return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function loadFileUploadConfig(env: NodeJS.ProcessEnv = process.env): FileUploadConfig {
	return {
		maxFileSizeBytes: parsePositiveInt(env.EXCEL_UPLOAD_MAX_FILE_SIZE_BYTES, 10 * 1024 * 1024),
		validationTimeoutMs: parsePositiveInt(env.EXCEL_UPLOAD_VALIDATION_TIMEOUT_MS, 2_000),
		parserTimeoutMs: parsePositiveInt(env.EXCEL_PARSER_TIMEOUT_MS, 30_000),
		parserMaxCells: parsePositiveInt(env.EXCEL_PARSER_MAX_CELLS, 1_000_000),
		parserMaxSheets: parsePositiveInt(env.EXCEL_PARSER_MAX_SHEETS, 10),
		enableVirusScan: parseBoolean(env.EXCEL_UPLOAD_ENABLE_VIRUS_SCAN, false),
		virusScanTimeoutMs: parsePositiveInt(env.EXCEL_UPLOAD_VIRUS_SCAN_TIMEOUT_MS, 5_000),
	};
}

export const fileUploadConfig = loadFileUploadConfig();
