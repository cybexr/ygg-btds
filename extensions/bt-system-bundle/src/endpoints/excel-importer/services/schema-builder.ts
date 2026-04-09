/**
 * Schema Builder Service
 * 负责通过 Directus Schema API 动态创建集合和字段
 */

import { Knex } from 'knex';
import { FieldMapping, FieldType } from '../types';

/**
 * Directus 集合配置接口
 */
export interface CollectionConfig {
	collection: string;
	meta?: {
		hidden?: boolean;
		display_template?: string;
		icon?: string;
		note?: string;
		translation?: string;
		archive_field?: string;
		archive_app_filter?: boolean;
		archive_value?: string;
		unarchive_value?: string;
		sort_field?: string;
		accountability?: string;
		item_duplication_field?: string;
		collapse?: 'open' | 'closed' | 'locked';
	};
	schema: {
		name?: string;
		comment?: string;
	};
	fields: FieldConfig[];
}

/**
 * Directus 字段配置接口
 */
export interface FieldConfig {
	field: string;
	type: string;
	meta?: {
		hidden?: boolean;
		readonly?: boolean;
		interface?: string;
		options?: any;
		display?: string;
		display_options?: any;
		translation?: any;
		note?: string;
		conditions?: any;
		required?: boolean;
		group?: any;
		width?: string;
	};
	schema?: {
		is_primary_key?: boolean;
		nullable?: boolean;
		default_value?: any;
		max_length?: number;
		has_auto_increment?: boolean;
		foreign_key_table?: string;
		foreign_key_column?: string;
		on_update?: string;
		comment?: string;
	};
}

/**
 * Schema 构建器类
 */
export class SchemaBuilder {
	private database: Knex;

	constructor(database: Knex) {
		this.database = database;
	}

	/**
	 * 创建完整的集合（包含字段）
	 */
	async createCollection(
		collectionName: string,
		fieldMappings: FieldMapping[],
		options?: {
			displayName?: string;
			hidden?: boolean;
			note?: string;
			userId?: number;
		}
	): Promise<{ collection_name: string; fields_created: number }> {
		const trx = await this.database.transaction();

		try {
			// 验证集合名称
			this.validateCollectionName(collectionName);

			// 检查集合是否已存在
			const exists = await this.collectionExists(collectionName, trx);
			if (exists) {
				throw new Error(`Collection "${collectionName}" already exists`);
			}

			// 构建 Directus 集合配置
			const collectionConfig = this.buildCollectionConfig(
				collectionName,
				fieldMappings,
				options
			);

			// 创建集合表
			await this.createCollectionTable(collectionConfig, trx);

			// 在 Directus 系统表中注册集合
			await this.registerCollectionInDirectus(collectionConfig, trx);

			// 创建所有字段
			let fieldsCreated = 0;
			for (const field of collectionConfig.fields) {
				await this.createFieldInDirectus(collectionName, field, trx);
				fieldsCreated++;
			}

			// 提交事务
			await trx.commit();

			return {
				collection_name: collectionName,
				fields_created: fieldsCreated,
			};
		} catch (error) {
			// 回滚事务
			await trx.rollback();
			throw error;
		}
	}

	/**
	 * 验证集合名称格式
	 */
	private validateCollectionName(name: string): void {
		if (!name) {
			throw new Error('Collection name is required');
		}

		// 只允许字母、数字、下划线，且必须以字母开头
		const validPattern = /^[a-z][a-z0-9_]*$/;
		if (!validPattern.test(name)) {
			throw new Error(
				'Invalid collection name. Must start with a letter and contain only lowercase letters, numbers, and underscores'
			);
		}

		if (name.length > 64) {
			throw new Error('Collection name must not exceed 64 characters');
		}

		// 检查保留前缀
		if (name.startsWith('directus_')) {
			throw new Error('Collection name cannot start with "directus_"');
		}
	}

	/**
	 * 检查集合是否已存在
	 */
	private async collectionExists(
		collectionName: string,
		trx: Knex.Transaction
	): Promise<boolean> {
		const result = await trx
			.from('information_schema.tables')
			.where('table_name', '=', collectionName)
			.andWhere('table_schema', '=', 'public')
			.first();

		return !!result;
	}

	/**
	 * 构建 Directus 集合配置
	 */
	private buildCollectionConfig(
		collectionName: string,
		fieldMappings: FieldMapping[],
		options?: {
			displayName?: string;
			hidden?: boolean;
			note?: string;
			userId?: number;
		}
	): CollectionConfig {
		// 将 FieldMapping 转换为 Directus 字段配置
		const fields: FieldConfig[] = this.buildFieldConfigs(fieldMappings);

		// 添加主键字段（如果不存在）
		const hasPrimaryKey = fields.some((f) => f.schema?.is_primary_key);
		if (!hasPrimaryKey) {
			fields.unshift({
				field: 'id',
				type: 'integer',
				meta: {
					hidden: true,
					interface: 'input',
					readonly: true,
				},
				schema: {
					is_primary_key: true,
					has_auto_increment: true,
					nullable: false,
				},
			});
		}

		const config: CollectionConfig = {
			collection: collectionName,
			meta: {
				hidden: options?.hidden ?? true, // 默认隐藏，等待审核
				icon: 'box',
				note: options?.note,
				collapse: 'open',
			},
			schema: {
				name: collectionName,
				comment: options?.displayName || `Dynamically created collection: ${collectionName}`,
			},
			fields,
		};

		return config;
	}

	/**
	 * 构建字段配置列表
	 */
	private buildFieldConfigs(fieldMappings: FieldMapping[]): FieldConfig[] {
		return fieldMappings.map((mapping) => this.buildFieldConfig(mapping));
	}

	/**
	 * 构建单个字段配置
	 */
	private buildFieldConfig(mapping: FieldMapping): FieldConfig {
		const directusType = this.mapFieldTypeToDirectus(mapping.type);

		const config: FieldConfig = {
			field: mapping.field_name,
			type: directusType,
			meta: {
				hidden: false,
				interface: this.getFieldInterface(mapping.type),
				display: mapping.display_name,
				required: !mapping.nullable && !mapping.default_value,
				options: {},
			},
			schema: {
				nullable: mapping.nullable,
				default_value: mapping.default_value,
				comment: mapping.display_name,
			},
		};

		// 设置主键
		if (mapping.primary_key) {
			config.schema!.is_primary_key = true;
			config.meta!.hidden = true;
		}

		// 设置唯一约束
		if (mapping.unique) {
			config.schema!.comment += ' (unique)';
		}

		// 设置最大长度（字符串类型）
		if (mapping.max_length && (mapping.type === FieldType.STRING || mapping.type === FieldType.TEXT)) {
			config.schema!.max_length = mapping.max_length;
		}

		return config;
	}

	/**
	 * 将自定义字段类型映射到 Directus 类型
	 */
	private mapFieldTypeToDirectus(fieldType: FieldType): string {
		const typeMap: Record<FieldType, string> = {
			[FieldType.STRING]: 'string',
			[FieldType.TEXT]: 'text',
			[FieldType.INTEGER]: 'integer',
			[FieldType.BIGINT]: 'bigInteger',
			[FieldType.FLOAT]: 'float',
			[FieldType.DECIMAL]: 'decimal',
			[FieldType.BOOLEAN]: 'boolean',
			[FieldType.DATETIME]: 'timestamp',
			[FieldType.DATE]: 'date',
			[FieldType.TIME]: 'time',
			[FieldType.JSON]: 'json',
			[FieldType.UUID]: 'uuid',
		};

		return typeMap[fieldType] || 'string';
	}

	/**
	 * 获取字段对应的 Directus interface
	 */
	private getFieldInterface(fieldType: FieldType): string {
		const interfaceMap: Record<FieldType, string> = {
			[FieldType.STRING]: 'input',
			[FieldType.TEXT]: 'input-multiline',
			[FieldType.INTEGER]: 'input',
			[FieldType.BIGINT]: 'input',
			[FieldType.FLOAT]: 'input',
			[FieldType.DECIMAL]: 'input',
			[FieldType.BOOLEAN]: 'boolean',
			[FieldType.DATETIME]: 'datetime',
			[FieldType.DATE]: 'date',
			[FieldType.TIME]: 'time',
			[FieldType.JSON]: 'input-json',
			[FieldType.UUID]: 'input',
		};

		return interfaceMap[fieldType] || 'input';
	}

	/**
	 * 创建数据库表
	 */
	private async createCollectionTable(
		config: CollectionConfig,
		trx: Knex.Transaction
	): Promise<void> {
		const hasPrimaryKey = config.fields.some((f) => f.schema?.is_primary_key);

		await trx.schema.createTable(config.collection, (table) => {
			// 主键字段
			if (hasPrimaryKey) {
				table.increments('id').primary();
			}

			// 创建所有字段
			for (const field of config.fields) {
				if (field.field === 'id') continue; // 跳过已创建的主键

				let column: any;

				switch (field.type) {
					case 'string':
						column = table.string(
							field.field,
							field.schema?.max_length || 255
						);
						break;
					case 'text':
						column = table.text(field.field);
						break;
					case 'integer':
						column = table.integer(field.field);
						break;
					case 'bigInteger':
						column = table.bigInteger(field.field);
						break;
					case 'float':
						column = table.float(field.field);
						break;
					case 'decimal':
						column = table.decimal(field.field, 10, 2);
						break;
					case 'boolean':
						column = table.boolean(field.field);
						break;
					case 'timestamp':
						column = table.timestamp(field.field, { useTz: true });
						break;
					case 'date':
						column = table.date(field.field);
						break;
					case 'time':
						column = table.time(field.field);
						break;
					case 'json':
						column = table.json(field.field);
						break;
					case 'uuid':
						column = table.uuid(field.field);
						break;
					default:
						column = table.string(field.field, 255);
				}

				// 设置可空性
				if (field.schema?.nullable === false) {
					column.notNullable();
				} else if (field.schema?.nullable === true) {
					column.nullable();
				}

				// 设置默认值
				if (field.schema?.default_value !== undefined) {
					column.defaultTo(field.schema.default_value);
				}

				// 设置唯一约束
				if (field.meta?.display?.includes('unique')) {
					column.unique();
				}

				// 添加注释
				if (field.schema?.comment) {
					column.comment(field.schema.comment);
				}
			}
		});
	}

	/**
	 * 在 Directus 系统表中注册集合
	 */
	private async registerCollectionInDirectus(
		config: CollectionConfig,
		trx: Knex.Transaction
	): Promise<void> {
		const now = new Date().toISOString();

		// 插入到 directus_collections
		await trx('directus_collections').insert({
			collection: config.collection,
			icon: config.meta?.icon || 'box',
			hidden: config.meta?.hidden ?? true,
			translation: null,
			note: config.meta?.note || null,
			display_template: null,
			archive_field: null,
			archive_app_filter: false,
			archive_value: null,
			unarchive_value: null,
			sort_field: null,
			accountability: 'all',
			item_duplication_field: null,
			collapse: config.meta?.collapse || 'open',
			created_at: now,
			updated_at: now,
		});

		// 插入到 directus_fields (元数据字段)
		await trx('directus_fields').insert({
			collection: config.collection,
			field: 'id',
			special: null,
			interface: 'input',
			options: null,
			display: null,
			display_options: null,
			readonly: true,
			hidden: true,
			sort: null,
			width: 'half',
			translation: null,
			note: null,
			conditions: null,
			required: false,
			group: null,
			created_at: now,
			updated_at: now,
		});
	}

	/**
	 * 在 Directus 系统表中注册字段
	 */
	private async createFieldInDirectus(
		collectionName: string,
		field: FieldConfig,
		trx: Knex.Transaction
	): Promise<void> {
		if (field.field === 'id') return; // 主键已在注册集合时处理

		const now = new Date().toISOString();

		await trx('directus_fields').insert({
			collection: collectionName,
			field: field.field,
			special: null,
			interface: field.meta?.interface || 'input',
			options: JSON.stringify(field.meta?.options || {}),
			display: field.meta?.display || null,
			display_options: JSON.stringify(field.meta?.display_options || {}),
			readonly: field.meta?.readonly || false,
			hidden: field.meta?.hidden || false,
			sort: null,
			width: 'half',
			translation: null,
			note: field.meta?.note || null,
			conditions: JSON.stringify(field.meta?.conditions || []),
			required: field.meta?.required || false,
			group: null,
			created_at: now,
			updated_at: now,
		});
	}

	/**
	 * 删除集合（包括所有数据和元数据）
	 */
	async dropCollection(collectionName: string): Promise<boolean> {
		const trx = await this.database.transaction();

		try {
			// 删除 Directus 元数据
			await trx('directus_fields').where({ collection: collectionName }).del();
			await trx('directus_collections').where({ collection: collectionName }).del();

			// 删除数据库表
			await trx.schema.dropTableIfExists(collectionName);

			await trx.commit();
			return true;
		} catch (error) {
			await trx.rollback();
			throw error;
		}
	}

	/**
	 * 检查字段名称冲突
	 */
	async checkFieldConflicts(
		collectionName: string,
		fieldNames: string[]
	): Promise<string[]> {
		// Directus 保留字段名
		const reservedFields = [
			'id',
			'sort',
			'created_at',
			'updated_at',
			'created_by',
			'updated_by',
		];

		const conflicts: string[] = [];

		for (const fieldName of fieldNames) {
			if (reservedFields.includes(fieldName)) {
				conflicts.push(fieldName);
			}
		}

		return conflicts;
	}

	/**
	 * 验证字段配置
	 */
	validateFieldMappings(fieldMappings: FieldMapping[]): {
		valid: boolean;
		errors: string[];
	} {
		const errors: string[] = [];

		for (const field of fieldMappings) {
			// 验证字段名
			if (!field.field_name) {
				errors.push('Field name is required');
				continue;
			}

			if (!/^[a-z][a-z0-9_]*$/.test(field.field_name)) {
				errors.push(
					`Invalid field name "${field.field_name}". Must start with a letter and contain only lowercase letters, numbers, and underscores`
				);
			}

			// 验证字段类型
			if (!Object.values(FieldType).includes(field.type)) {
				errors.push(`Invalid field type "${field.type}" for field "${field.field_name}"`);
			}

			// 验证显示名称
			if (!field.display_name) {
				errors.push(`Display name is required for field "${field.field_name}"`);
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}
}
