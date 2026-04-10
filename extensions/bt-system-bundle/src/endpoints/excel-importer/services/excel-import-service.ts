/**
 * Excel 导入服务
 * 负责处理 Excel 文件上传、解析、集合创建和数据导入
 */

import { randomUUID } from 'crypto';
import {
	ExcelParseResult,
	FieldMapping,
	TaskInfo,
	TaskStatus,
} from '../types';

/** @deprecated 请使用 ImportJobRunner 和 parseExcelFile 代替 */
export class ExcelImportService {
	private tasks: Map<string, TaskInfo> = new Map();

	/**
	 * 创建上传任务
	 */
	async createUploadTask(file: any): Promise<string> {
		const taskId = this.generateTaskId();

		const task: TaskInfo = {
			id: taskId,
			status: TaskStatus.PENDING,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			file_name: file.name,
			file_size: file.size,
		};

		this.tasks.set(taskId, task);
		return taskId;
	}

	/**
	 * 解析 Excel 文件
	 */
	async parseExcelFile(taskId: string): Promise<ExcelParseResult> {
		const task = this.tasks.get(taskId);
		if (!task) {
			throw new Error('任务不存在');
		}

		// 更新任务状态
		task.status = TaskStatus.PARSING;
		task.updated_at = new Date().toISOString();

		// 注：Excel 解析逻辑已迁移到 import-job-runner 服务
		// 使用 TypeScript Excel Parser (SHEETJS) 进行解析
		// 参考：extensions/bt-system-bundle/src/endpoints/excel-importer/services/import-job-runner.ts

		const mockResult: ExcelParseResult = {
			file_name: task.file_name || '',
			sheet_count: 1,
			sheets: [
				{
					sheet_name: 'Sheet1',
					row_count: 0,
					column_count: 0,
					headers: [],
					fields: [],
					preview_data: [],
				},
			],
		};

		task.status = TaskStatus.PARSED;
		task.parse_result = mockResult;
		task.updated_at = new Date().toISOString();

		return mockResult;
	}

	/**
	 * 创建集合
	 */
	async createCollection(
		taskId: string,
		collectionName: string,
		fieldMappings: FieldMapping[],
		schema?: any,
		database?: any
	): Promise<{ collection_name: string; fields_created: number }> {
		const task = this.tasks.get(taskId);
		if (!task) {
			throw new Error('任务不存在');
		}

		// 更新任务状态
		task.status = TaskStatus.CREATING_COLLECTION;
		task.collection_name = collectionName;
		task.updated_at = new Date().toISOString();

		// 注：集合创建逻辑已迁移到 import-job-runner 服务
		// 使用 Directus Schema API 创建集合和字段
		// 参考：extensions/bt-system-bundle/src/endpoints/excel-importer/services/import-job-runner.ts

		task.status = TaskStatus.COMPLETED;
		task.updated_at = new Date().toISOString();

		return {
			collection_name: collectionName,
			fields_created: fieldMappings.length,
		};
	}

	/**
	 * 获取任务状态
	 */
	async getTaskStatus(taskId: string): Promise<TaskInfo | null> {
		return this.tasks.get(taskId) || null;
	}

	/**
	 * 清空数据集
	 */
	async truncateDataset(collectionName: string, database?: any): Promise<void> {
		if (!database) {
			throw new Error('数据库连接不可用');
		}

		// 检查表是否存在
		const tableExists = await database.schema.hasTable(collectionName);
		if (!tableExists) {
			throw new Error(`数据集 ${collectionName} 不存在`);
		}

		// 清空表数据
		await database(collectionName).truncate();
	}

	/**
	 * 更新数据集记录数
	 */
	async updateDatasetRecordCount(collectionName: string, recordCount: number, database?: any): Promise<void> {
		if (!database) {
			throw new Error('数据库连接不可用');
		}

		await database('bt_dataset_registry')
			.where('collection_name', collectionName)
			.update({
				record_count: recordCount,
				updated_at: new Date(),
			});
	}

	/**
	 * 删除数据集（包括表结构和注册记录）
	 */
	async deleteDataset(collectionName: string, schema?: any, database?: any): Promise<void> {
		if (!database || !schema) {
			throw new Error('数据库连接不可用');
		}

		// 检查表是否存在
		const tableExists = await database.schema.hasTable(collectionName);
		if (!tableExists) {
			throw new Error(`数据集 ${collectionName} 不存在`);
		}

		// 删除表结构
		await schema.dropTableIfExists(collectionName);

		// 删除注册记录
		await database('bt_dataset_registry')
			.where('collection_name', collectionName)
			.del();
	}

	/**
	 * 生成带业务前缀的 UUID v4 任务 ID
	 */
	private generateTaskId(): string {
		return `excel_${randomUUID()}`;
	}
}
