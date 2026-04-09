export interface VirusScanResult {
	clean: boolean;
	engine: string;
	threat?: string;
	skipped?: boolean;
}

export interface VirusScanner {
	scanFile(fileName: string, content: Buffer): Promise<VirusScanResult>;
}

export class NoOpVirusScanner implements VirusScanner {
	async scanFile(): Promise<VirusScanResult> {
		return {
			clean: true,
			engine: 'noop',
			skipped: true,
		};
	}
}

export class ClamAvLikeVirusScanner implements VirusScanner {
	constructor(private readonly endpoint: string) {}

	async scanFile(fileName: string, content: Buffer): Promise<VirusScanResult> {
		const response = await fetch(this.endpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/octet-stream',
				'x-file-name': fileName,
			},
			body: content,
		});

		if (!response.ok) {
			throw new Error(`病毒扫描失败: ${response.status}`);
		}

		const payload = (await response.json()) as {
			clean?: boolean;
			threat?: string;
			engine?: string;
		};

		return {
			clean: payload.clean !== false,
			threat: payload.threat,
			engine: payload.engine || 'clamav-http',
		};
	}
}

export function createVirusScanner(env: NodeJS.ProcessEnv = process.env): VirusScanner {
	if (!['1', 'true', 'yes', 'on'].includes((env.EXCEL_UPLOAD_ENABLE_VIRUS_SCAN || '').toLowerCase())) {
		return new NoOpVirusScanner();
	}

	if (env.EXCEL_UPLOAD_VIRUS_SCAN_ENDPOINT) {
		return new ClamAvLikeVirusScanner(env.EXCEL_UPLOAD_VIRUS_SCAN_ENDPOINT);
	}

	return new NoOpVirusScanner();
}
