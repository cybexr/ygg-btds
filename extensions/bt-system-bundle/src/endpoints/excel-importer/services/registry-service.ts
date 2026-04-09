/**
 * Registry Service
 * 负责在 bt_dataset_registry 表中登记和管理数据集元数据
 */

import { Knex } from 'knex';
import { FieldMapping, FieldType } from '../types';

/**
 * 数据集注册信息
 */
export interface DatasetRegistration {
	collection_name: string;
	display_name: string;
	status: 'draft' | 'active' | 'hidden';
	source_file_name?: string;
	record_count?: number;
	field_schema_json?: Record<string, any>[];
	description?: string;
	tags?: string[];
	created_user_id?: number;
	updated_user_id?: number;
}

/**
 * 数据集元数据
 */
export interface DatasetMetadata {
	id: number;
	collection_name: string;
	display_name: string;
	status: string;
	source_file_name: string | null;
	record_count: number;
	field_schema_json: Record<string, any> | null;
	last_import_job_id: number | null;
	created_user_id: number | null;
	updated_user_id: number | null;
	created_at: Date;
	updated_at: Date;
	description: string | null;
	tags: string[];
}

/**
 * 注册表服务类
 */
export class RegistryService {
	private database: Knex;

	constructor(database: Knex) {
		this.database = database;
	}

	/**
	 * 登记新数据集
	 */
	async registerDataset(
		registration: DatasetRegistration
	): Promise<DatasetMetadata> {
		const now = new Date();

		const [id] = await this.database('bt_dataset_registry').insert({
			collection_name: registration.collection_name,
			display_name: registration.display_name,
			status: registration.status || 'draft',
			source_file_name: registration.source_file_name || null,
			record_count: registration.record_count || 0,
			field_schema_json: JSON.stringify(registration.field_schema_json || []),
			last_import_job_id: null,
			created_user_id: registration.created_user_id || null,
			updated_user_id: registration.updated_user_id || null,
			created_at: now,
			updated_at: now,
			description: registration.description || null,
			tags: JSON.stringify(registration.tags || []),
		});

		const dataset = await this.getDatasetById(id);
		if (!dataset) {
			throw new Error('Failed to retrieve registered dataset');
		}

		return dataset;
	}

	/**
	 * 根据 ID 获取数据集
	 */
	async getDatasetById(id: number): Promise<DatasetMetadata | null> {
		const result = await this.database('bt_dataset_registry')
			.where('id', id)
			.first();

		return result ? this.mapToDatasetMetadata(result) : null;
	}

	/**
	 * 根据集合名称获取数据集
	 */
	async getDatasetByCollectionName(
		collectionName: string
	): Promise<DatasetMetadata | null> {
		const result = await this.database('bt_dataset_registry')
			.where('collection_name', collectionName)
			.first();

		return result ? this.mapToDatasetMetadata(result) : null;
	}

	/**
	 * 更新数据集状态
	 */
	async updateDatasetStatus(
		collectionName: string,
		status: 'draft' | 'active' | 'hidden',
		userId?: number
	): Promise<boolean> {
		const updateData: any = {
			status,
			updated_at: new Date(),
		};

		if (userId) {
			updateData.updated_user_id = userId;
		}

		const count = await this.database('bt_dataset_registry')
			.where('collection_name', collectionName)
			.update(updateData);

		return count > 0;
	}

	/**
	 * 更新记录数量
	 */
	async updateRecordCount(
		collectionName: string,
		recordCount: number
	): Promise<boolean> {
		const count = await this.database('bt_dataset_registry')
			.where('collection_name', collectionName)
			.update({
				record_count: recordCount,
				updated_at: new Date(),
			});

		return count > 0;
	}

	/**
	 * 更新导入任务 ID
	 */
	async updateImportJobId(
		collectionName: string,
		jobId: number
	): Promise<boolean> {
		const count = await this.database('bt_dataset_registry')
			.where('collection_name', collectionName)
			.update({
				last_import_job_id: jobId,
				updated_at: new Date(),
			});

		return count > 0;
	}

	/**
	 * 更新字段 Schema
	 */
	async updateFieldSchema(
		collectionName: string,
		fieldSchema: Record<string, any>[]
	): Promise<boolean> {
		const count = await this.database('bt_dataset_registry')
			.where('collection_name', collectionName)
			.update({
				field_schema_json: JSON.stringify(fieldSchema),
				updated_at: new Date(),
			});

		return count > 0;
	}

	/**
	 * 删除数据集登记
	 */
	async unregisterDataset(collectionName: string): Promise<boolean> {
		const count = await this.database('bt_dataset_registry')
			.where('collection_name', collectionName)
			.del();

		return count > 0;
	}

	/**
	 * 获取所有数据集列表
	 */
	async getAllDatasets(options?: {
		status?: 'draft' | 'active' | 'hidden';
		userId?: number;
		limit?: number;
		offset?: number;
	}): Promise<DatasetMetadata[]> {
		let query = this.database('bt_dataset_registry').select('*');

		if (options?.status) {
			query = query.where('status', options.status);
		}

		if (options?.userId) {
			query = query.where('created_user_id', options.userId);
		}

		if (options?.limit) {
			query = query.limit(options.limit);
		}

		if (options?.offset) {
			query = query.offset(options.offset);
		}

		query = query.orderBy('created_at', 'desc');

		const results = await query;
		return results.map((r) => this.mapToDatasetMetadata(r));
	}

	/**
	 * 搜索数据集
	 */
	async searchDatasets(searchTerm: string): Promise<DatasetMetadata[]> {
		const results = await this.database('bt_dataset_registry')
			.where('display_name', 'ilike', `%${searchTerm}%`)
			.orWhere('description', 'ilike', `%${searchTerm}%`)
			.orWhere('collection_name', 'ilike', `%${searchTerm}%`)
			.orderBy('created_at', 'desc');

		return results.map((r) => this.mapToDatasetMetadata(r));
	}

	/**
	 * 根据标签获取数据集
	 */
	async getDatasetsByTags(tags: string[]): Promise<DatasetMetadata[]> {
		const results = await this.database('bt_dataset_registry')
			.select('*')
			.where(function () {
				for (const tag of tags) {
					this.orWhere('tags', '@>', JSON.stringify([tag]));
				}
			})
			.orderBy('created_at', 'desc');

		return results.map((r) => this.mapToDatasetMetadata(r));
	}

	/**
	 * 检查集合是否已登记
	 */
	async isCollectionRegistered(collectionName: string): Promise<boolean> {
		const result = await this.database('bt_dataset_registry')
			.where('collection_name', collectionName)
			.first();

		return !!result;
	}

	/**
	 * 获取统计数据
	 */
	async getStatistics(): Promise<{
		total_datasets: number;
		active_datasets: number;
		draft_datasets: number;
		hidden_datasets: number;
		total_records: number;
	}> {
		const [stats] = await this.database('bt_dataset_registry')
			.select(
				this.database.raw('COUNT(*) as total_datasets'),
				this.database.raw(
					"COUNT(*) FILTER (WHERE status = 'active') as active_datasets"
				),
				this.database.raw(
					"COUNT(*) FILTER (WHERE status = 'draft') as draft_datasets"
				),
				this.database.raw(
					"COUNT(*) FILTER (WHERE status = 'hidden') as hidden_datasets"
				),
				this.database.raw('COALESCE(SUM(record_count), 0) as total_records')
			);

		return stats as any;
	}

	/**
	 * 事务性创建数据集（先登记再更新状态）
	 */
	async createDatasetWithTransaction(
		registration: DatasetRegistration,
		createCollectionFn: () => Promise<void>
	): Promise<DatasetMetadata> {
		const trx = await this.database.transaction();

		try {
			// 第一步：登记到注册表（状态为 draft）
			const [id] = await trx('bt_dataset_registry').insert({
				collection_name: registration.collection_name,
				display_name: registration.display_name,
				status: 'draft',
				source_file_name: registration.source_file_name || null,
				record_count: 0,
				field_schema_json: JSON.stringify(registration.field_schema_json || []),
				last_import_job_id: null,
				created_user_id: registration.created_user_id || null,
				updated_user_id: null,
				created_at: new Date(),
				updated_at: new Date(),
				description: registration.description || null,
				tags: JSON.stringify(registration.tags || []),
			});

			// 第二步：执行集合创建操作
			await createCollectionFn();

			// 第三步：更新状态为 active 或保持 draft
			await trx('bt_dataset_registry')
				.where('id', id)
				.update({
					status: registration.status || 'draft',
					updated_at: new Date(),
				});

			// 提交事务
			await trx.commit();

			// 获取并返回完整的数据集信息
			const dataset = await this.getDatasetById(id);
			if (!dataset) {
				throw new Error('Failed to retrieve created dataset');
			}

			return dataset;
		} catch (error) {
			// 回滚事务
			await trx.rollback();
			throw error;
		}
	}

	/**
	 * 将 FieldMapping 转换为字段 Schema JSON 格式
	 */
	static buildFieldSchemaJson(fieldMappings: FieldMapping[]): Record<string, any>[] {
		return fieldMappings.map((field) => ({
			field_name: field.field_name,
			display_name: field.display_name,
			type: field.type,
			nullable: field.nullable,
			primary_key: field.primary_key,
			unique: field.unique,
			default_value: field.default_value,
			max_length: field.max_length,
		}));
	}

	/**
	 * 将数据库行映射为 DatasetMetadata 对象
	 */
	private mapToDatasetMetadata(row: any): DatasetMetadata {
		return {
			id: row.id,
			collection_name: row.collection_name,
			display_name: row.display_name,
			status: row.status,
			source_file_name: row.source_file_name,
			record_count: row.record_count || 0,
			field_schema_json: this.safeParseJson(
				row.field_schema_json,
				[],
				'field_schema_json'
			),
			last_import_job_id: row.last_import_job_id,
			created_user_id: row.created_user_id,
			updated_user_id: row.updated_user_id,
			created_at: row.created_at,
			updated_at: row.updated_at,
			description: row.description,
			tags: this.safeParseJson(row.tags, [], 'tags'),
		};
	}

	private safeParseJson<T>(
		value: T | string | null | undefined,
		fallback: T,
		fieldName: string
	): T {
		if (typeof value !== 'string') {
			return value ?? fallback;
		}

		try {
			return JSON.parse(value) as T;
		} catch (error) {
			console.warn(
				`[RegistryService] Failed to parse ${fieldName}, using fallback value.`,
				error
			);
			return fallback;
		}
	}

	/**
	 * 批量更新数据集状态
	 */
	async batchUpdateStatus(
		collectionNames: string[],
		status: 'draft' | 'active' | 'hidden',
		userId?: number
	): Promise<number> {
		const updateData: any = {
			status,
			updated_at: new Date(),
		};

		if (userId) {
			updateData.updated_user_id = userId;
		}

		return await this.database('bt_dataset_registry')
			.whereIn('collection_name', collectionNames)
			.update(updateData);
	}

	/**
	 * 清理孤儿数据集（在注册表中有但实际表不存在的）
	 */
	async cleanupOrphanDatasets(): Promise<number> {
		// 获取所有登记的集合名称
		const registered = await this.database('bt_dataset_registry')
			.select('collection_name');

		const orphans: string[] = [];

		for (const record of registered) {
			const exists = await this.database.schema.hasTable(record.collection_name);
			if (!exists) {
				orphans.push(record.collection_name);
			}
		}

		if (orphans.length > 0) {
			await this.database('bt_dataset_registry')
				.whereIn('collection_name', orphans)
				.del();
		}

		return orphans.length;
	}

	/**
	 * 验证集合名称唯一性
	 */
	async validateCollectionNameUniqueness(
		collectionName: string
	): Promise<{ valid: boolean; error?: string }> {
		const exists = await this.isCollectionRegistered(collectionName);

		if (exists) {
			return {
				valid: false,
				error: `Collection name "${collectionName}" is already registered`,
			};
		}

		return { valid: true };
	}
}
