import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const execAsync = promisify(exec);

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

export class ClamAvHttpScanner implements VirusScanner {
        constructor(private readonly endpoint: string) {}

        async scanFile(fileName: string, content: Buffer): Promise<VirusScanResult> {
                const response = await fetch(this.endpoint, {
                        method: 'POST',
                        headers: {
                                'content-type': 'application/octet-stream',
                                'x-file-name': encodeURIComponent(fileName),
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

export class LocalClamAvScanner implements VirusScanner {
        constructor(private readonly binPath: string = 'clamdscan') {}

        async scanFile(fileName: string, content: Buffer): Promise<VirusScanResult> {
                const tempFile = path.join(os.tmpdir(), `scan_${crypto.randomUUID()}`);
                await fs.writeFile(tempFile, content);

                try {
                        // clamdscan will return exit code 1 if virus found
                        const { stdout } = await execAsync(`${this.binPath} --fdpass "${tempFile}"`);
                        return {
                                clean: true,
                                engine: 'clamav-local',
                        };
                } catch (error: any) {
                        if (error.code === 1 && error.stdout) {
                                // Virus found
                                const threatMatch = error.stdout.match(/:\s+([^\s]+)\s+FOUND/);
                                return {
                                        clean: false,
                                        threat: threatMatch ? threatMatch[1] : 'Unknown Virus',
                                        engine: 'clamav-local',
                                };
                        }
                        throw new Error(`Local virus scan failed: ${error.message || String(error)}`);
                } finally {
                        await fs.unlink(tempFile).catch(() => {});
                }
        }
}

export function createVirusScanner(env: NodeJS.ProcessEnv = process.env): VirusScanner {
        if (!['1', 'true', 'yes', 'on'].includes((env.EXCEL_UPLOAD_ENABLE_VIRUS_SCAN || '').toLowerCase())) {
                return new NoOpVirusScanner();
        }

        if (env.EXCEL_UPLOAD_VIRUS_SCAN_ENDPOINT) {
                return new ClamAvHttpScanner(env.EXCEL_UPLOAD_VIRUS_SCAN_ENDPOINT);
        }

        if (env.EXCEL_UPLOAD_VIRUS_SCAN_LOCAL === '1' || env.EXCEL_UPLOAD_VIRUS_SCAN_LOCAL === 'true') {
                return new LocalClamAvScanner(env.EXCEL_UPLOAD_VIRUS_SCAN_BIN || 'clamdscan');
        }

        // 默认回退为 NoOp
        console.warn('Virus scan enabled but no endpoint or local scanner configured. Falling back to NoOp scanner.');
        return new NoOpVirusScanner();
}
