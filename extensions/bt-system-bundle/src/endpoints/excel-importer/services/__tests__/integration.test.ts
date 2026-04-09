/**
 * 集成测试：Schema Builder 和 Registry Service
 * 测试动态建表与数据集注册的完整流程
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import knex from 'knex';
import { SchemaBuilder } from '../schema-builder';
import { RegistryService, DatasetRegistration } from '../registry-service';
import { FieldMapping, FieldType } from '../../types';

describe('Schema Builder & Registry Service Integration', () => {
	let db: knex.Knex;
	let schemaBuilder: SchemaBuilder;
	let registryService: RegistryService;

	// 测试数据库配置
	const testDbConfig = {
		client: 'sqlite3',
		connection: ':memory:',
		useNullAsDefault: true,
	};

	beforeAll(async () => {
		db = knex(testDbConfig);

		// 创建 Directus 系统表
		await db.schema.createTable('directus_collections', (table) => {
			table.string('collection').primary();
			table.string('icon');
			table.boolean('hidden');
			table.string('note');
			table.string('collapse');
			table.timestamps(true, true);
		});

		await db.schema.createTable('directus_fields', (table) => {
			table.increments('id').primary();
			table.string('collection');
			table.string('field');
			table.string('interface');
			table.boolean('readonly');
			table.boolean('hidden');
			table.boolean('required');
			table.string('display');
			table.text('options');
			table.text('display_options');
			table.timestamps(true, true);
		});

		// 创建数据集注册表
		await db.schema.createTable('bt_dataset_registry', (table) => {
			table.increments('id').primary();
			table.string('collection_name').unique().notNullable();
			table.string('display_name').notNullable();
			table.string('status').notNullable().defaultTo('draft');
			table.string('source_file_name');
			table.integer('record_count').defaultTo(0);
			table.text('field_schema_json');
			table.integer('last_import_job_id');
			table.integer('created_user_id');
			table.integer('updated_user_id');
			table.timestamp('created_at').defaultTo(db.fn.now());
			table.timestamp('updated_at').defaultTo(db.fn.now());
			table.text('description');
			table.text('tags');
		});

		schemaBuilder = new SchemaBuilder(db);
		registryService = new RegistryService(db);
	});

	afterAll(async () => {
		await db.destroy();
	});

	describe('完整的数据集创建流程', () => {
		it('应该成功创建集合并登记到注册表', async () => {
			// 1. 定义字段映射
			const fieldMappings: FieldMapping[] = [
				{
					field_name: 'customer_name',
					display_name: '客户名称',
					type: FieldType.STRING,
					nullable: false,
					primary_key: false,
					unique: false,
					max_length: 100,
				},
				{
					field_name: 'email',
					display_name: '邮箱',
					type: FieldType.STRING,
					nullable: true,
					primary_key: false,
					unique: true,
					max_length: 255,
				},
				{
					field_name: 'phone',
					display_name: '电话',
					type: FieldType.STRING,
					nullable: true,
					primary_key: false,
					unique: false,
					max_length: 20,
				},
				{
					field_name: 'created_at',
					display_name: '创建时间',
					type: FieldType.DATETIME,
					nullable: true,
					primary_key: false,
					unique: false,
				},
			];

			const collectionName = 'bt_customer_data_2024';
			const displayName = '2024年客户数据';
			const fileName = 'customers_2024.xlsx';

			// 2. 验证字段配置
			const validation = schemaBuilder.validateFieldMappings(fieldMappings);
			expect(validation.valid).toBe(true);
			expect(validation.errors).toHaveLength(0);

			// 3. 验证集合名称唯一性
			const nameValidation = await registryService.validateCollectionNameUniqueness(
				collectionName
			);
			expect(nameValidation.valid).toBe(true);

			// 4. 使用事务创建集合并登记
			const registration: DatasetRegistration = {
				collection_name: collectionName,
				display_name: displayName,
				status: 'draft',
				source_file_name: fileName,
				record_count: 0,
				field_schema_json: RegistryService.buildFieldSchemaJson(fieldMappings),
				description: '从 Excel 导入的客户数据',
				tags: ['客户', '2024年数据'],
				created_user_id: 1,
			};

			const dataset = await registryService.createDatasetWithTransaction(
				registration,
				async () => {
					await schemaBuilder.createCollection(
						collectionName,
						fieldMappings,
						{
							displayName: displayName,
							hidden: true,
							note: registration.description,
						}
					);
				}
			);

			// 5. 验证结果
			expect(dataset.collection_name).toBe(collectionName);
			expect(dataset.display_name).toBe(displayName);
			expect(dataset.status).toBe('draft');
			expect(dataset.source_file_name).toBe(fileName);
			expect(dataset.tags).toEqual(['客户', '2024年数据']);

			// 6. 验证表已创建
			const tableExists = await db.schema.hasTable(collectionName);
			expect(tableExists).toBe(true);

			// 7. 验证字段已创建
			const columns = await db(collectionName).columnInfo();
			expect(columns.customer_name).toBeDefined();
			expect(columns.email).toBeDefined();
			expect(columns.phone).toBeDefined();
			expect(columns.created_at).toBeDefined();

			// 8. 验证可以插入数据
			await db(collectionName).insert({
				customer_name: '测试客户',
				email: 'test@example.com',
				phone: '13800138000',
			});

			const records = await db(collectionName).select('*');
			expect(records.length).toBe(1);
			expect(records[0].customer_name).toBe('测试客户');

			// 9. 更新记录数量
			await registryService.updateRecordCount(collectionName, 1);
			const updatedDataset = await registryService.getDatasetByCollectionName(
				collectionName
			);
			expect(updatedDataset?.record_count).toBe(1);

			// 10. 更新状态为 active
			await registryService.updateDatasetStatus(collectionName, 'active', 1);
			const activeDataset = await registryService.getDatasetByCollectionName(
				collectionName
			);
			expect(activeDataset?.status).toBe('active');
		});

		it('应该能够搜索和过滤数据集', async () => {
			// 创建多个数据集
			const datasets = [
				{
					collection_name: 'bt_orders_2024',
					display_name: '2024年订单数据',
					status: 'active' as const,
					tags: ['订单', '2024'],
				},
				{
					collection_name: 'bt_products_2024',
					display_name: '2024年产品数据',
					status: 'active' as const,
					tags: ['产品', '2024'],
				},
				{
					collection_name: 'bt_draft_dataset',
					display_name: '草稿数据集',
					status: 'draft' as const,
					tags: ['草稿'],
				},
			];

			for (const ds of datasets) {
				await registryService.registerDataset({
					...ds,
					field_schema_json: [],
				});
			}

			// 搜索功能
			const orderResults = await registryService.searchDatasets('订单');
			expect(orderResults.length).toBeGreaterThan(0);
			expect(orderResults[0].collection_name).toBe('bt_orders_2024');

			// 标签过滤
			const taggedResults = await registryService.getDatasetsByTags(['2024']);
			expect(taggedResults.length).toBeGreaterThanOrEqual(2);

			// 状态过滤
			const activeResults = await registryService.getAllDatasets({ status: 'active' });
			expect(activeResults.length).toBeGreaterThanOrEqual(2);

			const draftResults = await registryService.getAllDatasets({ status: 'draft' });
			expect(draftResults.length).toBeGreaterThanOrEqual(1);
		});

		it('应该能够获取正确的统计数据', async () => {
			const stats = await registryService.getStatistics();

			expect(stats.total_datasets).toBeGreaterThan(0);
			expect(stats.active_datasets).toBeGreaterThanOrEqual(0);
			expect(stats.draft_datasets).toBeGreaterThanOrEqual(0);
			expect(stats.hidden_datasets).toBeGreaterThanOrEqual(0);
			expect(stats.total_records).toBeGreaterThanOrEqual(0);
		});

		it('应该能够删除数据集', async () => {
			const collectionName = 'bt_temp_dataset';
			const fieldMappings: FieldMapping[] = [
				{
					field_name: 'name',
					display_name: '名称',
					type: FieldType.STRING,
					nullable: false,
					primary_key: false,
					unique: false,
				},
			];

			// 创建数据集
			await schemaBuilder.createCollection(collectionName, fieldMappings);
			await registryService.registerDataset({
				collection_name: collectionName,
				display_name: '临时数据集',
				status: 'draft',
				field_schema_json: RegistryService.buildFieldSchemaJson(fieldMappings),
			});

			// 验证存在
			let exists = await registryService.isCollectionRegistered(collectionName);
			expect(exists).toBe(true);

			let tableExists = await db.schema.hasTable(collectionName);
			expect(tableExists).toBe(true);

			// 删除集合
			await schemaBuilder.dropCollection(collectionName);

			// 验证已删除
			exists = await registryService.isCollectionRegistered(collectionName);
			expect(exists).toBe(false);

			tableExists = await db.schema.hasTable(collectionName);
			expect(tableExists).toBe(false);
		});

		it('应该正确处理字段冲突', async () => {
			const conflicts = await schemaBuilder.checkFieldConflicts(
				'bt_test',
				['id', 'custom_field', 'created_at', 'updated_at']
			);

			expect(conflicts).toContain('id');
			expect(conflicts).toContain('created_at');
			expect(conflicts).toContain('updated_at');
			expect(conflicts).not.toContain('custom_field');
		});

		it('应该正确验证字段类型', () => {
			const allTypes: FieldMapping[] = Object.values(FieldType).map((type) => ({
				field_name: `field_${type}`,
				display_name: `Field ${type}`,
				type: type as FieldType,
				nullable: true,
				primary_key: false,
				unique: false,
			}));

			const result = schemaBuilder.validateFieldMappings(allTypes);
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('应该正确拒绝无效的字段配置', () => {
			const invalidFields: FieldMapping[] = [
				{
					field_name: 'Invalid-Field-Name',
					display_name: '无效字段',
					type: FieldType.STRING,
					nullable: false,
					primary_key: false,
					unique: false,
				},
				{
					field_name: 'another_invalid_field',
					display_name: '', // 空显示名称
					type: 'invalid_type' as FieldType,
					nullable: false,
					primary_key: false,
					unique: false,
				},
			];

			const result = schemaBuilder.validateFieldMappings(invalidFields);
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});
	});

	describe('事务回滚测试', () => {
		it('应该在创建失败时回滚', async () => {
			const collectionName = 'bt_rollback_test';
			const fieldMappings: FieldMapping[] = [
				{
					field_name: 'name',
					display_name: '名称',
					type: FieldType.STRING,
					nullable: false,
					primary_key: false,
					unique: false,
				},
			];

			const registration: DatasetRegistration = {
				collection_name: collectionName,
				display_name: '回滚测试',
				status: 'active',
				field_schema_json: RegistryService.buildFieldSchemaJson(fieldMappings),
			};

			// 模拟创建失败
			await expect(
				registryService.createDatasetWithTransaction(registration, async () => {
					await schemaBuilder.createCollection(collectionName, fieldMappings);
					throw new Error('模拟创建失败');
				})
			).rejects.toThrow();

			// 验证已回滚，没有登记到注册表
			const exists = await registryService.isCollectionRegistered(collectionName);
			expect(exists).toBe(false);
		});
	});
});
