/**
 * 导入审计日志器
 * 负责记录导入错误和审计日志到数据库
 */

import { Knex } from 'knex';

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
 * 错误类型分类
 */
export enum ErrorType {
	VALIDATION = 'validation',
	CONSTRAINT = 'constraint',
	FORMAT = 'format',
	DATABASE = 'database',
	PERMISSION = 'permission',
	SYSTEM = 'system',
}

/**
 * 错误统计信息
 */
export interface ErrorStatistics {
	total_errors: number;
	by_severity: Record<string, number>;
	by_type: Record<string, number>;
	resolved_errors: number;
	unresolved_errors: number;
}

/**
 * 导入错误记录
 */
export interface ImportErrorRecord {
	import_job_id: number;
	row_number: number;
	sheet_name?: string;
	error_type: string;
	error_message: string;
	field_name?: string;
	row_data?: Record<string, any>;
	severity: ErrorSeverity;
}

/**
 * 审计日志记录
 */
export interface AuditLogRecord {
	action_type: string;
	action_category: string;
	target_type?: string;
	target_id?: string;
	target_name?: string;
	operation_details?: Record<string, any>;
	changes_summary?: string;
	performed_by_user_id?: number | string;
	performed_by_role_id?: number | string;
	user_ip_address?: string;
	user_agent?: string;
	status: 'success' | 'failed' | 'partial';
	result_message?: string;
	risk_level: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * 缓存配置
 */
interface CacheConfig {
	maxSize: number;
	ttl: number; // Time to live in milliseconds
}

/**
 * 缓存条目
 */
interface CacheEntry<T> {
	value: T;
	timestamp: number;
}

/**
 * 导入审计日志器类
 */
export class ImportAuditLogger {
	private database: Knex;
	private errorCategoryCache: Map<string, CacheEntry<ErrorType>>;
	private errorSeverityCache: Map<string, CacheEntry<ErrorSeverity>>;
	private cacheConfig: CacheConfig;

	constructor(database: Knex, cacheConfig?: Partial<CacheConfig>) {
		this.database = database;
		this.cacheConfig = {
			maxSize: 1000,
			ttl: 300000, // 5 minutes
			...cacheConfig
		};
		this.errorCategoryCache = new Map();
		this.errorSeverityCache = new Map();
	}

	/**
	 * 记录导入错误
	 */
	async logImportError(errorRecord: ImportErrorRecord): Promise<number> {
		try {
			const [id] = await this.database('bt_import_errors').insert({
				import_job_id: errorRecord.import_job_id,
				row_number: errorRecord.row_number,
				sheet_name: errorRecord.sheet_name,
				error_type: errorRecord.error_type,
				error_message: errorRecord.error_message,
				field_name: errorRecord.field_name,
				row_data: errorRecord.row_data || {},
				severity: errorRecord.severity,
				is_resolved: false,
				created_at: new Date(),
			});

			return id as number;
		} catch (error) {
			console.error('[ImportAuditLogger] Failed to log import error:', error);
			throw error;
		}
	}

	/**
	 * 批量记录导入错误（优化版本）
	 */
	async logImportErrors(errorRecords: ImportErrorRecord[]): Promise<number[]> {
		if (errorRecords.length === 0) {
			return [];
		}

		try {
			// 预计算时间戳，避免在循环中重复创建
			const now = new Date();

			// 批量准备数据
			const records = errorRecords.map(record => ({
				import_job_id: record.import_job_id,
				row_number: record.row_number,
				sheet_name: record.sheet_name,
				error_type: record.error_type,
				error_message: record.error_message,
				field_name: record.field_name,
				row_data: record.row_data || {},
				severity: record.severity,
				is_resolved: false,
				created_at: now,
			}));

			// 单次批量插入
			const ids = await this.database('bt_import_errors').insert(records);
			return ids as number[];
		} catch (error) {
			console.error('[ImportAuditLogger] Failed to batch log import errors:', error);
			throw error;
		}
	}

	/**
	 * 记录审计日志
	 */
	async logAction(auditRecord: AuditLogRecord): Promise<number> {
		try {
			const [id] = await this.database('bt_action_audit_logs').insert({
				action_type: auditRecord.action_type,
				action_category: auditRecord.action_category,
				target_type: auditRecord.target_type,
				target_id: auditRecord.target_id,
				target_name: auditRecord.target_name,
				operation_details: auditRecord.operation_details || {},
				changes_summary: auditRecord.changes_summary,
				performed_by_user_id: auditRecord.performed_by_user_id,
				performed_by_role_id: auditRecord.performed_by_role_id,
				user_ip_address: auditRecord.user_ip_address,
				user_agent: auditRecord.user_agent,
				status: auditRecord.status,
				result_message: auditRecord.result_message,
				risk_level: auditRecord.risk_level,
				requires_approval: false,
				created_at: new Date(),
			});

			return id as number;
		} catch (error) {
			console.error('[ImportAuditLogger] Failed to log audit action:', error);
			throw error;
		}
	}

	/**
	 * 获取错误统计信息
	 */
	async getErrorStatistics(importJobId: number): Promise<ErrorStatistics> {
		try {
			const errors = await this.database('bt_import_errors')
				.where('import_job_id', importJobId);

			const stats: ErrorStatistics = {
				total_errors: errors.length,
				by_severity: {} as Record<string, number>,
				by_type: {} as Record<string, number>,
				resolved_errors: 0,
				unresolved_errors: 0,
			};

			for (const error of errors) {
				// 按严重级别统计
				stats.by_severity[error.severity] = (stats.by_severity[error.severity] || 0) + 1;

				// 按错误类型统计
				stats.by_type[error.error_type] = (stats.by_type[error.error_type] || 0) + 1;

				// 按解决状态统计
				if (error.is_resolved) {
					stats.resolved_errors++;
				} else {
					stats.unresolved_errors++;
				}
			}

			return stats;
		} catch (error) {
			console.error('[ImportAuditLogger] Failed to get error statistics:', error);
			throw error;
		}
	}

	/**
	 * 清理旧的审计日志
	 */
	async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
		try {
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

			const deletedCount = await this.database('bt_action_audit_logs')
				.where('created_at', '<', cutoffDate)
				.where('risk_level', 'low')
				.delete();

			console.log(`[ImportAuditLogger] Cleaned up ${deletedCount} old low-risk audit logs`);
			return deletedCount;
		} catch (error) {
			console.error('[ImportAuditLogger] Failed to cleanup old logs:', error);
			throw error;
		}
	}

	/**
	 * 清理已解决的导入错误
	 */
	async cleanupResolvedErrors(daysToKeep: number = 30): Promise<number> {
		try {
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

			const deletedCount = await this.database('bt_import_errors')
				.where('is_resolved', true)
				.where('created_at', '<', cutoffDate)
				.delete();

			console.log(`[ImportAuditLogger] Cleaned up ${deletedCount} resolved import errors`);
			return deletedCount;
		} catch (error) {
			console.error('[ImportAuditLogger] Failed to cleanup resolved errors:', error);
			throw error;
		}
	}

	/**
	 * 清理过期的缓存条目
	 */
	private cleanupCache<T>(cache: Map<string, CacheEntry<T>>): void {
		const now = Date.now();
		const keysToDelete: string[] = [];

		for (const [key, entry] of cache.entries()) {
			if (now - entry.timestamp > this.cacheConfig.ttl) {
				keysToDelete.push(key);
			}
		}

		for (const key of keysToDelete) {
			cache.delete(key);
		}
	}

	/**
	 * 获取缓存值
	 */
	private getCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
		const entry = cache.get(key);
		if (!entry) {
			return null;
		}

		// 检查是否过期
		if (Date.now() - entry.timestamp > this.cacheConfig.ttl) {
			cache.delete(key);
			return null;
		}

		return entry.value;
	}

	/**
	 * 设置缓存值
	 */
	private setCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
		// 如果缓存已满，清理过期条目
		if (cache.size >= this.cacheConfig.maxSize) {
			this.cleanupCache(cache);
		}

		// 如果清理后仍然满了，删除最旧的条目
		if (cache.size >= this.cacheConfig.maxSize) {
			const firstKey = cache.keys().next().value;
			if (firstKey) {
				cache.delete(firstKey);
			}
		}

		cache.set(key, {
			value,
			timestamp: Date.now()
		});
	}

	/**
	 * 清空所有缓存
	 */
	clearCache(): void {
		this.errorCategoryCache.clear();
		this.errorSeverityCache.clear();
	}

	/**
	 * 标记错误为已解决
	 */
	async markErrorAsResolved(errorId: number, resolutionNotes?: string): Promise<boolean> {
		try {
			const updatedCount = await this.database('bt_import_errors')
				.where('id', errorId)
				.update({
					is_resolved: true,
					resolution_notes: resolutionNotes,
				});

			return updatedCount > 0;
		} catch (error) {
			console.error('[ImportAuditLogger] Failed to mark error as resolved:', error);
			throw error;
		}
	}

	/**
	 * 分析错误严重级别（带缓存）
	 */
	analyzeErrorSeverity(error: any, context?: any): ErrorSeverity {
		// 生成缓存键
		const cacheKey = `${error.code || ''}:${error.message || ''}`;

		// 尝试从缓存获取
		const cached = this.getCachedValue(this.errorSeverityCache, cacheKey);
		if (cached !== null) {
			return cached;
		}

		// 计算严重级别
		let severity: ErrorSeverity;

		// 数据库约束违反
		if (error.code === '23505' || error.code === '23503' || error.code === '23502') {
			severity = ErrorSeverity.ERROR;
		}
		// 权限错误
		else if (error.message?.includes('permission') || error.message?.includes('unauthorized')) {
			severity = ErrorSeverity.CRITICAL;
		}
		// 系统错误
		else if (error.code?.startsWith('50') || error.code?.startsWith('59')) {
			severity = ErrorSeverity.CRITICAL;
		}
		// 验证错误
		else if (error.message?.includes('validation') || error.message?.includes('invalid')) {
			severity = ErrorSeverity.WARNING;
		}
		// 默认为错误级别
		else {
			severity = ErrorSeverity.ERROR;
		}

		// 缓存结果
		this.setCachedValue(this.errorSeverityCache, cacheKey, severity);

		return severity;
	}

	/**
	 * 分类错误类型（带缓存）
	 */
	categorizeError(error: any): ErrorType {
		// 生成缓存键
		const errorMessage = error.message?.toLowerCase() || '';
		const errorCode = error.code || '';
		const cacheKey = `${errorCode}:${errorMessage}`;

		// 尝试从缓存获取
		const cached = this.getCachedValue(this.errorCategoryCache, cacheKey);
		if (cached !== null) {
			return cached;
		}

		// 分类错误类型
		let errorType: ErrorType;

		if (errorMessage.includes('validation') || errorMessage.includes('valid')) {
			errorType = ErrorType.VALIDATION;
		} else if (errorMessage.includes('constraint') || errorMessage.includes('unique') || errorMessage.includes('foreign key')) {
			errorType = ErrorType.CONSTRAINT;
		} else if (errorMessage.includes('format') || errorMessage.includes('type') || errorMessage.includes('parse')) {
			errorType = ErrorType.FORMAT;
		} else if (errorMessage.includes('permission') || errorMessage.includes('unauthorized') || errorMessage.includes('forbidden')) {
			errorType = ErrorType.PERMISSION;
		} else if (errorCode?.startsWith('50') || errorCode?.startsWith('59') || errorMessage.includes('database')) {
			errorType = ErrorType.DATABASE;
		} else {
			errorType = ErrorType.SYSTEM;
		}

		// 缓存结果
		this.setCachedValue(this.errorCategoryCache, cacheKey, errorType);

		return errorType;
	}
}

/**
 * 性能监控装饰器
 */
export function measurePerformance(target: any, propertyName: string, descriptor: PropertyDescriptor) {
	const method = descriptor.value;

	descriptor.value = async function (...args: any[]) {
		const start = Date.now();
		const className = target.constructor.name;

		try {
			const result = await method.apply(this, args);
			const duration = Date.now() - start;

			if (duration > 1000) {
				console.warn(`[Performance] ${className}.${propertyName} took ${duration}ms`);
			}

			return result;
		} catch (error) {
			const duration = Date.now() - start;
			console.error(`[Performance] ${className}.${propertyName} failed after ${duration}ms`, error);
			throw error;
		}
	};

	return descriptor;
}
