import { Router, Request, Response } from 'express';
import { UploadedFile } from 'express-fileupload';
import { fileUploadConfig, FileUploadConfig } from './config';
import { validateExcelFile } from './utils/file-validator';
import { VirusScanner, createVirusScanner } from './utils/virus-scanner';
import { PermissionChecker } from '../../../../src/shared/services/permission-checker';
import { PermissionAction, SystemRole } from '../../../../src/shared/constants/roles';
import { randomUUID } from 'crypto';
import { parseExcelFile } from './services/excel-parser';
import { SchemaBuilder } from './services/schema-builder';
import { ImportJobRunner } from './services/import-job-runner';
import { ExcelImportService } from './services/excel-import-service';

const excelService = new ExcelImportService();
const virusScanner = createVirusScanner();

interface UploadContext {
        buffer: Buffer;
        fileName: string;
        size: number;
        parseResult?: any;
        expiresAt: number;
}
export const uploadCache = new Map<string, UploadContext>();

setInterval(() => {
        const now = Date.now();
        for (const [taskId, ctx] of uploadCache.entries()) {
                if (now > ctx.expiresAt) {
                        uploadCache.delete(taskId);
                }
        }
}, 60000);

interface RouteDependencies {
        excelService?: Pick<ExcelImportService, 'createUploadTask'>;
        config: FileUploadConfig;
        virusScanner: VirusScanner;
}

const DEFAULT_ROUTE_DEPENDENCIES: RouteDependencies = {
        excelService,
        config: fileUploadConfig,
        virusScanner,
};

export function createUploadHandler(
        dependencies: RouteDependencies = DEFAULT_ROUTE_DEPENDENCIES
) {
        return async (req: Request, res: Response) => {
                try {
                        if (!req.files || !req.files.file) {
                                return res.status(400).json({
                                        error: 'FILE_MISSING',
                                        message: '未上传文件',
                                });
                        }

                        const uploadedFile = req.files.file as UploadedFile;

                        const allowedMimeTypes = [
                                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                'application/vnd.ms-excel',
                                'application/octet-stream',
                        ];

                        if (!allowedMimeTypes.includes(uploadedFile.mimetype)) {
                                return res.status(400).json({
                                        error: 'INVALID_FILE_TYPE',
                                        message: '只支持 .xlsx 和 .xls 格式的 Excel 文件',
                                });
                        }

                        const validationResult = await withTimeout(
                                () =>
                                        validateExcelFile(uploadedFile, {
                                                maxFileSizeBytes: dependencies.config.maxFileSizeBytes,
                                        }),
                                dependencies.config.validationTimeoutMs
                        );
                        if (!validationResult.valid) {
                                const issue = validationResult.issues[0];
                                console.warn('Rejected excel upload', {
                                        fileName: validationResult.sanitizedFileName,
                                        reason: issue?.code,
                                });
                                return res.status(400).json({
                                        error: issue?.code || 'INVALID_FILE',
                                        message: issue?.message || '文件安全校验失败',
                                });
                        }

                        if (dependencies.config.enableVirusScan) {
                                const scanResult = await withTimeout(
                                        () =>
                                                dependencies.virusScanner.scanFile(
                                                        validationResult.sanitizedFileName,
                                                        uploadedFile.data
                                                ),
                                        dependencies.config.virusScanTimeoutMs
                                );
                                if (!scanResult.clean) {
                                        return res.status(400).json({
                                                error: 'VIRUS_DETECTED',
                                                message: scanResult.threat || ' 文件未通过病毒扫描',
                                        });
                                }
                        }

                        let taskId;
                        if (dependencies.excelService) {
                                taskId = await dependencies.excelService.createUploadTask({
                                        ...uploadedFile,
                                        name: validationResult.sanitizedFileName,
                                });
                        } else {
                                taskId = `excel_${randomUUID()}`;
                        }
                        
                        uploadCache.set(taskId, {
                                buffer: uploadedFile.data,
                                fileName: validationResult.sanitizedFileName,
                                size: uploadedFile.size,
                                expiresAt: Date.now() + 60 * 60 * 1000,
                        });

                        return res.json({
                                success: true,
                                task_id: taskId,
                                message: '文件上传成功',
                        });
                } catch (error) {
                        console.error('Upload error:', error);
                        return res.status(500).json({
                                error: 'UPLOAD_FAILED',
                                message: '文件上传失败',
                                details: error instanceof Error ? error.message : '未知错误',
                        });
                }
        };
}

export function registerRoutes(router: Router): void {
        const BASE_PATH = '/custom/excel';

        router.post(`${BASE_PATH}/upload`, createUploadHandler());

        router.post(
                `${BASE_PATH}/parse`,
                PermissionChecker.createPermissionMiddleware(PermissionAction.PARSE_FILE),
                async (req: Request, res: Response) => {
                try {
                        const { task_id } = req.body;

                        if (!task_id) {
                                return res.status(400).json({
                                        error: 'MISSING_TASK_ID',
                                        message: '缺少任务 ID',
                                });
                        }

                        const cacheItem = uploadCache.get(task_id);
                        if (!cacheItem) {
                                return res.status(404).json({
                                        error: 'TASK_NOT_FOUND',
                                        message: '任务不存在或已过期，请重新上传文件',
                                });
                        }

                        const parseResult = await parseExcelFile(cacheItem.buffer);
                        cacheItem.parseResult = parseResult;

                        res.json({
                                success: true,
                                data: parseResult,
                        });
                } catch (error) {
                        console.error('Parse error:', error);
                        res.status(500).json({
                                error: 'PARSE_FAILED',
                                message: '文件解析失败',
                                details: error instanceof Error ? error.message : '未知错误',
                        });
                }
        });

        router.post(
                `${BASE_PATH}/create-collection`,
                PermissionChecker.createPermissionMiddleware(PermissionAction.CREATE_COLLECTION),
                async (req: Request, res: Response) => {
                try {
                        const { task_id, collection_name, field_mappings } = req.body;

                        if (!task_id || !collection_name || !field_mappings) {
                                return res.status(400).json({
                                        error: 'MISSING_PARAMETERS',
                                        message: '缺少必要参数：task_id, collection_name, field_mappings',
                                });
                        }

                        if (!/^[a-z][a-z0-9_]*$/.test(collection_name)) {
                                return res.status(400).json({
                                        error: 'INVALID_COLLECTION_NAME',
                                        message: '集合名称必须以小写字母开头，只能包含小写字母、数字和下划线',
                                });
                        }

                        const database = req.context?.database;
                        if (!database) {
                                throw new Error('Database context not found');
                        }

                        const schemaBuilder = new SchemaBuilder(database);
                        const collectionResult = await schemaBuilder.createCollection(
                                collection_name,
                                field_mappings,
                                {
                                        displayName: collection_name,
                                        userId: req.accountability?.user
                                }
                        );

                        res.json({
                                success: true,
                                data: collectionResult,
                                message: '集合创建成功',
                        });
                } catch (error) {
                        console.error('Create collection error:', error);
                        res.status(500).json({
                                error: 'CREATE_COLLECTION_FAILED',
                                message: '集合创建失败',
                                details: error instanceof Error ? error.message : '未知错误',
                        });
                }
        });

        router.post(
                `${BASE_PATH}/import-data`,
                PermissionChecker.createPermissionMiddleware(PermissionAction.IMPORT_DATA),
                async (req: Request, res: Response) => {
                try {
                        const { task_id, collection_name, data: clientData, batch_size = 1000 } = req.body;

                        if (!task_id || !collection_name) {
                                return res.status(400).json({
                                        error: 'MISSING_PARAMETERS',
                                        message: '缺少必要参数: task_id, collection_name',
                                });
                        }

                        const database = req.context?.database;
                        if (!database) {
                                throw new Error('Database context not found');
                        }

                        let dataToImport = clientData;
                        let fileName = 'client_upload.xlsx';
                        let fileSizeBytes = 0;

                        if (!dataToImport) {
                                const cacheItem = uploadCache.get(task_id);
                                if (!cacheItem) {
                                        return res.status(404).json({
                                                error: 'TASK_NOT_FOUND',
                                                message: '任务不存在或已过期，且未提供导入数据',
                                        });
                                }
                                
                                fileName = cacheItem.fileName;
                                fileSizeBytes = cacheItem.size;
                                
                                const workbook = await parseExcelFile(cacheItem.buffer, { max_preview_rows: Number.MAX_SAFE_INTEGER });
                                if (!workbook.sheets.length || !workbook.sheets[0].preview_data) {
                                        throw new Error('未能从文件中提取数据');
                                }
                                dataToImport = workbook.sheets[0].preview_data;
                        } else {
                                fileSizeBytes = JSON.stringify(dataToImport).length;
                        }

                        const runner = new ImportJobRunner(database);

                        const config = {
                                jobIdentifier: randomUUID(),
                                sourceFileName: fileName,
                                fileSizeBytes: fileSizeBytes,
                                totalRows: dataToImport.length,
                                batchSize: batch_size,
                                createdUserId: req.accountability?.user,
                        };

                        const jobId = await runner.createImportJob(config);

                        const batchData = dataToImport.map((row: any, index: number) => ({
                                row_number: index + 1,
                                data: row,
                        }));

                        setImmediate(() => {
                                runner.startImportJob(jobId, batchData, collection_name)
                                        .catch(err => console.error(`Task ${jobId} failed:`, err));
                        });

                        res.json({
                                success: true,
                                data: {
                                        job_id: jobId,
                                        message: '导入任务已启动',
                                },
                        });
                } catch (error) {
                        console.error('Import data error:', error);
                        res.status(500).json({
                                error: 'IMPORT_FAILED',
                                message: '启动导入任务失败',
                                details: error instanceof Error ? error.message : '未知错误',
                        });
                }
        });

        router.get(`${BASE_PATH}/task/:id`, async (req: Request, res: Response) => {
                try {
                        const { id } = req.params;

                        if (!id) {
                                return res.status(400).json({
                                        error: 'MISSING_TASK_ID',
                                        message: '缺少任务 ID',
                                });
                        }

                        if (id.startsWith('excel_')) {
                                const cacheItem = uploadCache.get(id);
                                if (cacheItem) {
                                        return res.json({
                                                success: true,
                                                data: {
                                                        id,
                                                        status: cacheItem.parseResult ? 'completed' : 'processing',
                                                        file_name: cacheItem.fileName,
                                                        file_size: cacheItem.size
                                                }
                                        });
                                }
                        }

                        const database = req.context?.database;
                        if (database) {
                                const runner = new ImportJobRunner(database);
                                const numericId = parseInt(id, 10);
                                if (!isNaN(numericId)) {
                                        const progress = await runner.getJobProgress(numericId);
                                        return res.json({
                                                success: true,
                                                data: progress
                                        });
                                }
                        }

                        res.status(404).json({
                                error: 'TASK_NOT_FOUND',
                                message: '任务不存在',
                        });
                } catch (error) {
                        console.error('Get task status error:', error);
                        res.status(500).json({
                                error: 'GET_TASK_STATUS_FAILED',
                                message: '获取任务状态失败',
                                details: error instanceof Error ? error.message : '未知错误',
                        });
                }
        });

        router.post(`${BASE_PATH}/truncate/:collection_name`, async (req: Request, res: Response) => {
                try {
                        const { collection_name } = req.params;

                        if (!collection_name) {
                                return res.status(400).json({
                                        error: 'MISSING_COLLECTION_NAME',
                                        message: '缺少集合名称',
                                });
                        }

                        const userContext = PermissionChecker.extractUserContext(req);
                        const permissionResult = PermissionChecker.hasPermission(
                                userContext,
                                PermissionAction.TRUNCATE_DATASET
                        );

                        if (!permissionResult.granted) {
                                return res.status(
                                        permissionResult.errorCode === 'UNAUTHORIZED' ? 401 : 403
                                ).json({
                                        error: permissionResult.errorCode,
                                        message: permissionResult.errorMessage,
                                });
                        }

                        const database = req.context?.database;
                        if (!database) {
                                throw new Error('Database context not found');
                        }

                        await database(collection_name).truncate();

                        await database('bt_dataset_registry')
                                .where('collection_name', collection_name)
                                .update({
                                        record_count: 0,
                                        updated_at: new Date(),
                                });

                        res.json({
                                success: true,
                                message: '数据集已清空',
                        });
                } catch (error) {
                        console.error('Truncate dataset error:', error);
                        res.status(500).json({
                                error: 'TRUNCATE_FAILED',
                                message: '清空数据集失败',
                                details: error instanceof Error ? error.message : '未知错误',
                        });
                }
        });

        router.delete(`${BASE_PATH}/dataset/:collection_name`, async (req: Request, res: Response) => {
                try {
                        const { collection_name } = req.params;

                        if (!collection_name) {
                                return res.status(400).json({
                                        error: 'MISSING_COLLECTION_NAME',
                                        message: '缺少集合名称',
                                });
                        }

                        const userContext = PermissionChecker.extractUserContext(req);
                        const permissionResult = PermissionChecker.hasPermission(
                                userContext,
                                PermissionAction.DELETE_COLLECTION
                        );

                        if (!permissionResult.granted) {
                                return res.status(
                                        permissionResult.errorCode === 'UNAUTHORIZED' ? 401 : 403
                                ).json({
                                        error: permissionResult.errorCode,
                                        message: permissionResult.errorMessage,
                                });
                        }

                        const database = req.context?.database;
                        const schema = req.context?.schema;
                        if (!database || !schema) {
                                throw new Error('Database or schema context not found');
                        }

                        const schemaBuilder = new SchemaBuilder(database);
                        await schemaBuilder.dropCollection(collection_name);

                        await database('bt_dataset_registry')
                                .where('collection_name', collection_name)
                                .del();

                        res.json({
                                success: true,
                                message: '数据集已删除',
                        });
                } catch (error) {
                        console.error('Delete dataset error:', error);
                        res.status(500).json({
                                error: 'DELETE_FAILED',
                                message: '删除数据集失败',
                                details: error instanceof Error ? error.message : '未知错误',
                        });
                }
        });
}

async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

        try {
                return await Promise.race([
                        operation(),
                        new Promise<T>((_, reject) => {
                                timeoutHandle = setTimeout(() => {
                                        reject(new Error(`处理超时（>${timeoutMs}ms）`));
                                }, timeoutMs);
                        }),
                ]);
        } finally {
                if (timeoutHandle) {
                        clearTimeout(timeoutHandle);
                }
        }
}
