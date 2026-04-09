/**
 * 导入任务运行器
 * 负责处理异步数据导入、任务状态跟踪、批处理和错误管理
 */

import { randomUUID } from 'crypto';
import { Knex } from 'knex';

/**
 * 生成符合 RFC 4122 的 UUID v4 任务标识符
 */
function generateUUID(): string {
	return randomUUID();
}

/**
 * 导入任务状态
 */
export enum ImportJobStatus {
	PENDING = 'pending',
	RUNNING = 'running',
	COMPLETED = 'completed',
	FAILED = 'failed',
	CANCELLED = 'cancelled',
	PAUSED = 'paused',
}

/**
 * 错误严重级别
 */
export enum ErrorSeverity {
	INFO = 'info',
	WARNING = 'warning',
	ERROR = 'error',
	CRITICAL = 'critical',
}

/**
 * 导入任务配置
 */
export interface ImportJobConfig {
	/**
	 * 可选的导入任务标识符，未传入时自动生成 UUID v4。
	 */
	jobIdentifier?: string;
	datasetRegistryId?: number;
	sourceFileName: string;
	fileSizeBytes: number;
	totalRows: number;
	batchSize?: number;
	importOptions?: Record<string, any>;
	createdUserId?: number;
}

/**
 * 批处理数据项
 */
export interface BatchDataItem {
	row_number: number;
	sheet_name?: string;
	data: Record<string, any>;
}

/**
 * 导入进度信息
 */
export interface ImportProgress {
	jobId: number;
	status: ImportJobStatus;
	totalRows: number;
	processedRows: number;
	successRows: number;
	failedRows: number;
	progress: number; // 0-100
	estimatedCompletionAt?: Date;
	errorSummary?: string;
}

/**
 * 进度回调函数类型
 */
export type ProgressCallback = (progress: ImportProgress) => void;

/**
 * 错误记录
 */
export interface ImportErrorRecord {
	row_number: number;
	sheet_name?: string;
	error_type: string;
	error_message: string;
	field_name?: string;
	row_data: Record<string, any>;
	severity: ErrorSeverity;
}

/**
 * 导入结果
 */
export interface ImportResult {
	jobId: number;
	status: ImportJobStatus;
	totalRows: number;
	processedRows: number;
	successRows: number;
	failedRows: number;
	duration: number; // 毫秒
	errors: ImportErrorRecord[];
}

/**
 * 任务队列项
 */
interface QueueItem {
	jobId: number;
	priority: number;
	queuedAt: Date;
	data: BatchDataItem[];
	targetCollection: string;
	onProgress?: ProgressCallback;
}

interface JobStatusCacheEntry {
	status: ImportJobStatus;
	expiresAt: number;
}

interface JobPerformanceMetrics {
	startTime: number;
	batchTimes: number[];
	cacheHits: number;
	cacheMisses: number;
	statusChecks: number;
	cacheCheckTimes: number[];
}

/**
 * 导入任务运行器类
 */
export class ImportJobRunner {
	private database: Knex;
	private activeJobs: Map<number, boolean> = new Map();
	private jobQueue: QueueItem[] = [];
	private maxConcurrentJobs: number = 3;
	private processingCount: number = 0;
	private taskStatusCache: Map<number, JobStatusCacheEntry> = new Map();
	private readonly cacheTtlMs: number = 5000;
	private readonly statusCheckIntervalBatches: number = 10;

	// 性能监控
	private performanceMetrics: Map<number, JobPerformanceMetrics> = new Map();

	constructor(database: Knex, maxConcurrentJobs?: number) {
		this.database = database;
		if (maxConcurrentJobs) {
			this.maxConcurrentJobs = maxConcurrentJobs;
		}
	}

	/**
	 * 创建新的导入任务
	 */
	async createImportJob(config: ImportJobConfig): Promise<number> {
		const jobIdentifier = config.jobIdentifier || generateUUID();

		const [job] = await this.database('bt_import_jobs')
			.insert({
				job_identifier: jobIdentifier,
				dataset_registry_id: config.datasetRegistryId,
				source_file_name: config.sourceFileName,
				file_size_bytes: config.fileSizeBytes,
				status: ImportJobStatus.PENDING,
				total_rows: config.totalRows,
				processed_rows: 0,
				failed_rows: 0,
				success_rows: 0,
				import_options: JSON.stringify(config.importOptions || {}),
				batch_size: config.batchSize || 1000,
				created_user_id: config.createdUserId,
			})
			.returning('id');

		const jobId = job.id;
		this.activeJobs.set(jobId, false);
		this.updateCachedJobStatus(jobId, ImportJobStatus.PENDING);

		return jobId;
	}

	/**
	 * 启动导入任务
	 */
	async startImportJob(
		jobId: number,
		data: BatchDataItem[],
		targetCollection: string,
		onProgress?: ProgressCallback
	): Promise<ImportResult> {
		const job = await this.database('bt_import_jobs')
			.where('id', jobId)
			.first();

		if (!job) {
			throw new Error(`任务不存在: ${jobId}`);
		}

		if (job.status !== ImportJobStatus.PENDING && job.status !== ImportJobStatus.PAUSED) {
			throw new Error(`任务状态不正确，当前状态: ${job.status}`);
		}

		// 初始化性能监控
		this.performanceMetrics.set(jobId, this.createPerformanceMetrics());

		// 更新任务状态为运行中
		await this.updateJobStatus(jobId, ImportJobStatus.RUNNING);
		this.activeJobs.set(jobId, true);

		const batchSize = job.batch_size || 1000;
		const totalRows = data.length;
		let processedRows = 0;
		let successRows = 0;
		let failedRows = 0;
		const errors: ImportErrorRecord[] = [];
		let finalStatus: ImportJobStatus = ImportJobStatus.RUNNING;
		const sheetName = job.sheet_name || undefined;

		try {
			// 分批处理数据
			for (let i = 0, batchIndex = 0; i < data.length; i += batchSize, batchIndex++) {
				const shouldRefreshStatus =
					batchIndex === 0 || batchIndex % this.statusCheckIntervalBatches === 0;
				const currentStatus = await this.getCachedJobStatus(jobId, shouldRefreshStatus);

				if (currentStatus === ImportJobStatus.CANCELLED) {
					finalStatus = ImportJobStatus.CANCELLED;
					this.activeJobs.set(jobId, false);
					break;
				}

				if (currentStatus === ImportJobStatus.PAUSED) {
					finalStatus = ImportJobStatus.PAUSED;
					this.activeJobs.set(jobId, false);
					break;
				}

				const batch = data.slice(i, Math.min(i + batchSize, data.length));
				const batchStartTime = Date.now();

				// 处理当前批次
				const batchResult = await this.processBatch(
					jobId,
					batch,
					targetCollection,
					sheetName
				);

				const batchTime = Date.now() - batchStartTime;
				const metrics = this.performanceMetrics.get(jobId);
				if (metrics) {
					metrics.batchTimes.push(batchTime);
				}

				// 更新统计
				processedRows += batch.length;
				successRows += batchResult.successCount;
				failedRows += batchResult.failureCount;
				errors.push(...batchResult.errors);

				// 更新任务进度
				const progress = processedRows / totalRows;
				const estimatedTimeRemaining = this.calculateEstimatedTime(jobId, progress, totalRows);

				await this.database('bt_import_jobs')
					.where('id', jobId)
					.update({
						processed_rows: processedRows,
						success_rows: successRows,
						failed_rows: failedRows,
						has_errors: failedRows > 0,
						estimated_completion_at: estimatedTimeRemaining,
					});

				// 触发进度回调
				if (onProgress) {
					onProgress({
						jobId,
						status: finalStatus,
						totalRows,
						processedRows,
						successRows,
						failedRows,
						progress: Math.round(progress * 100),
						estimatedCompletionAt: estimatedTimeRemaining,
						errorSummary: errors.length > 0 ? `发现 ${errors.length} 个错误` : undefined,
					});
				}
			}

			if (finalStatus === ImportJobStatus.CANCELLED || finalStatus === ImportJobStatus.PAUSED) {
				this.logCachePerformanceReport(jobId);

				return {
					jobId,
					status: finalStatus,
					totalRows,
					processedRows,
					successRows,
					failedRows,
					duration: Date.now() - this.getPerformanceMetricsBase(jobId).startTime,
					errors,
				};
			}

			// 任务完成
			finalStatus = ImportJobStatus.COMPLETED;
			await this.updateJobStatus(jobId, finalStatus);
			await this.markJobCompleted(jobId);

			// 记录审计日志
			await this.recordAuditLog(jobId, targetCollection, successRows, failedRows);

			// 获取性能指标
			const metrics = this.performanceMetrics.get(jobId);
			const duration = metrics ? Date.now() - metrics.startTime : 0;

			this.activeJobs.set(jobId, false);
			this.logCachePerformanceReport(jobId);

			return {
				jobId,
				status: finalStatus,
				totalRows,
				processedRows,
				successRows,
				failedRows,
				duration,
				errors,
			};
		} catch (error) {
			// 任务失败
			await this.updateJobStatus(jobId, ImportJobStatus.FAILED);
			await this.markJobFailed(jobId, error instanceof Error ? error.message : '未知错误');

			this.activeJobs.set(jobId, false);
			this.logCachePerformanceReport(jobId);

			throw error;
		}
	}

	/**
	 * 处理单个批次
	 */
	private async processBatch(
		jobId: number,
		batch: BatchDataItem[],
		targetCollection: string,
		sheetName?: string
	): Promise<{ successCount: number; failureCount: number; errors: ImportErrorRecord[] }> {
		const errors: ImportErrorRecord[] = [];
		let successCount = 0;
		let failureCount = 0;

		// 使用事务处理批次
		try {
			await this.database.transaction(async (trx) => {
				for (const item of batch) {
					try {
						// 插入数据到目标集合
						await trx(targetCollection).insert(item.data);
						successCount++;
					} catch (error) {
						failureCount++;

						// 记录错误
						const errorRecord: ImportErrorRecord = {
							row_number: item.row_number,
							sheet_name: sheetName,
							error_type: this.getErrorType(error),
							error_message: error instanceof Error ? error.message : '未知错误',
							field_name: this.getFieldNameFromError(error),
							row_data: item.data,
							severity: this.getErrorSeverity(error),
						};

						errors.push(errorRecord);

						// 保存错误到数据库
						await this.saveError(jobId, errorRecord, trx);
					}
				}

				// 如果有错误，更新任务的错误摘要
				if (errors.length > 0) {
					const errorSummary = this.generateErrorSummary(errors);
					await this.database('bt_import_jobs')
						.where('id', jobId)
						.update({
							error_summary: errorSummary,
							has_errors: true,
						});
				}
			});
		} catch (transactionError) {
			// 事务失败，记录错误
			console.error('批处理事务失败:', transactionError);
			throw transactionError;
		}

		return { successCount, failureCount, errors };
	}

	/**
	 * 保存错误记录
	 */
	private async saveError(jobId: number, errorRecord: ImportErrorRecord, trx?: Knex): Promise<void> {
		const db = trx || this.database;

		await db('bt_import_errors').insert({
			import_job_id: jobId,
			row_number: errorRecord.row_number,
			sheet_name: errorRecord.sheet_name,
			error_type: errorRecord.error_type,
			error_message: errorRecord.error_message,
			field_name: errorRecord.field_name,
			row_data: JSON.stringify(errorRecord.row_data),
			severity: errorRecord.severity,
		});
	}

	/**
	 * 更新任务状态
	 */
	private async updateJobStatus(jobId: number, status: ImportJobStatus): Promise<void> {
		const updateData: any = { status };

		if (status === ImportJobStatus.RUNNING) {
			updateData.started_at = new Date();
		}

		await this.database('bt_import_jobs')
			.where('id', jobId)
			.update(updateData);

		this.updateCachedJobStatus(jobId, status);
	}

	/**
	 * 标记任务完成
	 */
	private async markJobCompleted(jobId: number): Promise<void> {
		await this.database('bt_import_jobs')
			.where('id', jobId)
			.update({
				completed_at: new Date(),
			});
	}

	/**
	 * 标记任务失败
	 */
	private async markJobFailed(jobId: number, errorMessage: string): Promise<void> {
		await this.database('bt_import_jobs')
			.where('id', jobId)
			.update({
				completed_at: new Date(),
				error_summary: errorMessage,
				has_errors: true,
			});
	}

	/**
	 * 取消任务
	 */
	async cancelJob(jobId: number): Promise<void> {
		const job = await this.database('bt_import_jobs')
			.where('id', jobId)
			.first();

		if (!job) {
			throw new Error(`任务不存在: ${jobId}`);
		}

		if (job.status === ImportJobStatus.COMPLETED || job.status === ImportJobStatus.FAILED) {
			throw new Error('任务已完成或失败，无法取消');
		}

		await this.updateJobStatus(jobId, ImportJobStatus.CANCELLED);
		this.activeJobs.set(jobId, false);
	}

	/**
	 * 暂停任务
	 */
	async pauseJob(jobId: number): Promise<void> {
		const job = await this.database('bt_import_jobs')
			.where('id', jobId)
			.first();

		if (!job) {
			throw new Error(`任务不存在: ${jobId}`);
		}

		if (job.status !== ImportJobStatus.RUNNING) {
			throw new Error('只能暂停正在运行的任务');
		}

		await this.updateJobStatus(jobId, ImportJobStatus.PAUSED);
		this.activeJobs.set(jobId, false);
	}

	/**
	 * 恢复任务
	 */
	async resumeJob(
		jobId: number,
		data: BatchDataItem[],
		targetCollection: string,
		onProgress?: ProgressCallback
	): Promise<ImportResult> {
		const job = await this.database('bt_import_jobs')
			.where('id', jobId)
			.first();

		if (!job) {
			throw new Error(`任务不存在: ${jobId}`);
		}

		if (job.status !== ImportJobStatus.PAUSED) {
			throw new Error('只能恢复已暂停的任务');
		}

		// 从已处理的行数开始继续处理
		const startIndex = job.processed_rows || 0;
		const remainingData = data.slice(startIndex);

		return this.startImportJob(jobId, remainingData, targetCollection, onProgress);
	}

	/**
	 * 获取任务进度
	 */
	async getJobProgress(jobId: number): Promise<ImportProgress> {
		const job = await this.database('bt_import_jobs')
			.where('id', jobId)
			.first();

		if (!job) {
			throw new Error(`任务不存在: ${jobId}`);
		}

		const totalRows = job.total_rows || 0;
		const processedRows = job.processed_rows || 0;
		const progress = totalRows > 0 ? (processedRows / totalRows) * 100 : 0;

		return {
			jobId,
			status: job.status as ImportJobStatus,
			totalRows,
			processedRows,
			successRows: job.success_rows || 0,
			failedRows: job.failed_rows || 0,
			progress: Math.round(progress),
			estimatedCompletionAt: job.estimated_completion_at,
			errorSummary: job.error_summary || undefined,
		};
	}

	/**
	 * 添加任务到队列
	 */
	async enqueueJob(
		jobId: number,
		data: BatchDataItem[],
		targetCollection: string,
		onProgress?: ProgressCallback,
		priority: number = 0
	): Promise<void> {
		const queueItem: QueueItem = {
			jobId,
			priority,
			queuedAt: new Date(),
			data,
			targetCollection,
			onProgress,
		};

		this.jobQueue.push(queueItem);
		this.jobQueue.sort((a, b) => b.priority - a.priority); // 按优先级排序

		// 尝试处理队列
		this.processQueue();
	}

	/**
	 * 处理任务队列
	 */
	private async processQueue(): Promise<void> {
		while (this.jobQueue.length > 0 && this.processingCount < this.maxConcurrentJobs) {
			const queueItem = this.jobQueue.shift();
			if (!queueItem) break;

			this.processingCount++;

			// 异步处理任务
			this.startImportJob(
				queueItem.jobId,
				queueItem.data,
				queueItem.targetCollection,
				queueItem.onProgress
			)
				.finally(() => {
					this.processingCount--;
					this.processQueue(); // 继续处理队列
				});
		}
	}

	/**
	 * 记录审计日志
	 */
	private async recordAuditLog(
		jobId: number,
		targetCollection: string,
		successRows: number,
		failedRows: number
	): Promise<void> {
		const job = await this.database('bt_import_jobs')
			.where('id', jobId)
			.first();

		if (!job) return;

		const status = failedRows === 0 ? 'success' : successRows > 0 ? 'partial' : 'failed';

		await this.database('bt_action_audit_logs').insert({
			action_type: 'dataset_import',
			action_category: 'dataset_import',
			target_type: 'collection',
			target_id: targetCollection,
			target_name: targetCollection,
			operation_details: JSON.stringify({
				job_id: jobId,
				job_identifier: job.job_identifier,
				source_file: job.source_file_name,
				total_rows: job.total_rows,
				success_rows: successRows,
				failed_rows: failedRows,
			}),
			changes_summary: `导入数据到集合 ${targetCollection}，成功 ${successRows} 条，失败 ${failedRows} 条`,
			performed_by_user_id: job.created_user_id,
			status,
			result_message: `数据导入${status === 'success' ? '成功' : status === 'partial' ? '部分成功' : '失败'}`,
			risk_level: failedRows > 0 ? 'medium' : 'low',
		});
	}

	/**
	 * 计算预计完成时间
	 */
	private calculateEstimatedTime(jobId: number, progress: number, totalRows: number): Date | undefined {
		const metrics = this.performanceMetrics.get(jobId);
		if (!metrics || metrics.batchTimes.length === 0 || progress <= 0) {
			return undefined;
		}

		const elapsed = Date.now() - metrics.startTime;
		const estimatedTotal = elapsed / progress;
		const remaining = estimatedTotal - elapsed;

		return new Date(Date.now() + remaining);
	}

	/**
	 * 生成错误摘要
	 */
	private generateErrorSummary(errors: ImportErrorRecord[]): string {
		const errorTypes = new Map<string, number>();

		for (const error of errors) {
			const count = errorTypes.get(error.error_type) || 0;
			errorTypes.set(error.error_type, count + 1);
		}

		const summaryParts = Array.from(errorTypes.entries())
			.map(([type, count]) => `${type}: ${count}`)
			.join(', ');

		return `错误统计: ${summaryParts}，总计 ${errors.length} 个错误`;
	}

	/**
	 * 获取错误类型
	 */
	private getErrorType(error: unknown): string {
		if (error instanceof Error) {
			const message = error.message.toLowerCase();

			if (message.includes('unique') || message.includes('duplicate')) {
				return 'constraint_violation';
			}
			if (message.includes('null') || message.includes('not null')) {
				return 'null_violation';
			}
			if (message.includes('foreign key') || message.includes('fk')) {
				return 'foreign_key_violation';
			}
			if (message.includes('invalid') || message.includes('format')) {
				return 'format_error';
			}
			if (message.includes('truncate') || message.includes('too long')) {
				return 'length_violation';
			}
		}

		return 'unknown_error';
	}

	/**
	 * 从错误中提取字段名
	 */
	private getFieldNameFromError(error: unknown): string | undefined {
		if (error instanceof Error) {
			const message = error.message;

			// 尝试从错误消息中提取字段名
			const fieldMatch = message.match(/column["\s]+(\w+)/i) || message.match(/field["\s]+(\w+)/i);
			if (fieldMatch && fieldMatch[1]) {
				return fieldMatch[1];
			}
		}

		return undefined;
	}

	/**
	 * 获取错误严重级别
	 */
	private getErrorSeverity(error: unknown): ErrorSeverity {
		if (error instanceof Error) {
			const message = error.message.toLowerCase();

			if (message.includes('critical') || message.includes('fatal')) {
				return ErrorSeverity.CRITICAL;
			}
			if (message.includes('warning')) {
				return ErrorSeverity.WARNING;
			}
		}

		return ErrorSeverity.ERROR;
	}

	/**
	 * 获取性能指标
	 */
	getPerformanceMetrics(jobId: number): { averageBatchTime: number; totalDuration: number } | undefined {
		const metrics = this.performanceMetrics.get(jobId);
		if (!metrics || metrics.batchTimes.length === 0) {
			return undefined;
		}

		const averageBatchTime =
			metrics.batchTimes.reduce((sum, time) => sum + time, 0) / metrics.batchTimes.length;
		const totalDuration = Date.now() - metrics.startTime;

		return {
			averageBatchTime: Math.round(averageBatchTime),
			totalDuration,
		};
	}

	getCacheMetrics(
		jobId: number
	): { hitRate: number; hits: number; misses: number; averageLookupTime: number; statusChecks: number } | undefined {
		const metrics = this.performanceMetrics.get(jobId);
		if (!metrics) {
			return undefined;
		}

		const lookups = metrics.cacheHits + metrics.cacheMisses;
		const averageLookupTime =
			metrics.cacheCheckTimes.length > 0
				? metrics.cacheCheckTimes.reduce((sum, time) => sum + time, 0) / metrics.cacheCheckTimes.length
				: 0;

		return {
			hitRate: lookups > 0 ? metrics.cacheHits / lookups : 0,
			hits: metrics.cacheHits,
			misses: metrics.cacheMisses,
			averageLookupTime: Math.round(averageLookupTime),
			statusChecks: metrics.statusChecks,
		};
	}

	/**
	 * 清理完成的任务
	 */
	async cleanupJob(jobId: number): Promise<void> {
		this.activeJobs.delete(jobId);
		this.performanceMetrics.delete(jobId);
		this.clearJobStatusCache(jobId);
	}

	/**
	 * 获取活动任务数量
	 */
	getActiveJobCount(): number {
		return Array.from(this.activeJobs.values()).filter((active) => active).length;
	}

	/**
	 * 获取队列中的任务数量
	 */
	getQueueLength(): number {
		return this.jobQueue.length;
	}

	private createPerformanceMetrics(): JobPerformanceMetrics {
		return {
			startTime: Date.now(),
			batchTimes: [],
			cacheHits: 0,
			cacheMisses: 0,
			statusChecks: 0,
			cacheCheckTimes: [],
		};
	}

	private getPerformanceMetricsBase(jobId: number): JobPerformanceMetrics {
		const metrics = this.performanceMetrics.get(jobId);
		if (metrics) {
			return metrics;
		}

		const initialMetrics = this.createPerformanceMetrics();
		this.performanceMetrics.set(jobId, initialMetrics);
		return initialMetrics;
	}

	private async getCachedJobStatus(jobId: number, forceRefresh: boolean = false): Promise<ImportJobStatus> {
		const metrics = this.getPerformanceMetricsBase(jobId);
		const lookupStartedAt = Date.now();
		const cachedStatus = this.taskStatusCache.get(jobId);
		const now = Date.now();

		if (!forceRefresh && cachedStatus && cachedStatus.expiresAt > now) {
			metrics.cacheHits++;
			metrics.cacheCheckTimes.push(Date.now() - lookupStartedAt);
			return cachedStatus.status;
		}

		metrics.cacheMisses++;
		metrics.statusChecks++;

		const job = await this.database('bt_import_jobs')
			.where('id', jobId)
			.first();

		if (!job) {
			throw new Error(`任务不存在: ${jobId}`);
		}

		const status = job.status as ImportJobStatus;
		this.updateCachedJobStatus(jobId, status);
		metrics.cacheCheckTimes.push(Date.now() - lookupStartedAt);

		return status;
	}

	private updateCachedJobStatus(jobId: number, status: ImportJobStatus): void {
		this.taskStatusCache.set(jobId, {
			status,
			expiresAt: Date.now() + this.cacheTtlMs,
		});
	}

	private clearJobStatusCache(jobId: number): void {
		this.taskStatusCache.delete(jobId);
	}

	private logCachePerformanceReport(jobId: number): void {
		const cacheMetrics = this.getCacheMetrics(jobId);
		if (!cacheMetrics) {
			return;
		}

		if (cacheMetrics.statusChecks > 0) {
			console.info(
				`[ImportJobRunner] job=${jobId} cache hit rate=${Math.round(cacheMetrics.hitRate * 100)}% ` +
					`hits=${cacheMetrics.hits} misses=${cacheMetrics.misses} statusChecks=${cacheMetrics.statusChecks}`
			);
		}

		if (cacheMetrics.statusChecks > 0 && cacheMetrics.hitRate < 0.5) {
			console.warn(
				`[ImportJobRunner] job=${jobId} cache hit rate is below expectation: ${Math.round(
					cacheMetrics.hitRate * 100
				)}%`
			);
		}
	}
}
