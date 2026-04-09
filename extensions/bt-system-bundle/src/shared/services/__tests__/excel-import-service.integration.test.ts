/**
 * Excel Import Service 集成测试
 * 测试完整的 Excel 导入流程，包括：
 * - 任务创建和管理
 * - Excel 文件解析
 * - 集合创建和数据导入
 * - 数据集操作（清空、更新记录数、删除）
 * - 错误处理和边界条件
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import knex from 'knex';
import { ExcelImportService } from '../excel-import-service';
import { TaskStatus, FieldMapping, FieldType } from '../../../endpoints/excel-importer/types';

describe('ExcelImportService 集成测试', () => {
	let db: knex.Knex;
	let excelImportService: ExcelImportService;
	let schema: any;

	// 测试数据库配置
	const testDbConfig = {
		client: 'sqlite3',
		connection: ':memory:',
		useNullAsDefault: true,
	};

	// 创建模拟的 schema 对象
	const createMockSchema = (database: knex.Knex) => {
		return {
			dropTableIfExists: async (tableName: string) => {
				await database.schema.dropTableIfExists(tableName);
			},
		};
	};

	beforeAll(async () => {
		db = knex(testDbConfig);
		schema = createMockSchema(db);

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

		excelImportService = new ExcelImportService();
	});

	afterAll(async () => {
		await db.destroy();
	});

	beforeEach(async () => {
		// 清空数据集注册表
		await db('bt_dataset_registry').truncate();
	});

	describe('任务管理流程', () => {
		it('应该成功创建上传任务', async () => {
			const mockFile = {
				name: 'test_data.xlsx',
				size: 1024,
			};

			const taskId = await excelImportService.createUploadTask(mockFile);

			// 验证任务 ID 格式
			expect(taskId).toMatch(/^excel_[a-f0-9-]{36}$/);

			// 验证任务状态
			const task = await excelImportService.getTaskStatus(taskId);
			expect(task).not.toBeNull();
			expect(task?.id).toBe(taskId);
			expect(task?.status).toBe(TaskStatus.PENDING);
			expect(task?.file_name).toBe('test_data.xlsx');
			expect(task?.file_size).toBe(1024);
		});

		it('应该能够获取任务状态', async () => {
			const mockFile = {
				name: 'status_test.xlsx',
				size: 2048,
			};

			const taskId = await excelImportService.createUploadTask(mockFile);
			const task = await excelImportService.getTaskStatus(taskId);

			expect(task).toBeDefined();
			expect(task?.id).toBe(taskId);
			expect(task?.file_name).toBe('status_test.xlsx');
			expect(task?.created_at).toBeDefined();
			expect(task?.updated_at).toBeDefined();
		});

		it('应该对不存在的任务返回 null', async () => {
			const task = await excelImportService.getTaskStatus('non_existent_task_id');
			expect(task).toBeNull();
		});

		it('每个任务应该有唯一的 ID', async () => {
			const mockFile = {
				name: 'unique_test.xlsx',
				size: 512,
			};

			const taskId1 = await excelImportService.createUploadTask(mockFile);
			const taskId2 = await excelImportService.createUploadTask(mockFile);

			expect(taskId1).not.toBe(taskId2);
		});
	});

	describe('Excel 解析流程', () => {
		it('应该成功解析 Excel 文件', async () => {
			const mockFile = {
				name: 'sample_data.xlsx',
				size: 4096,
			};

			const taskId = await excelImportService.createUploadTask(mockFile);
			const parseResult = await excelImportService.parseExcelFile(taskId);

			// 验证解析结果结构
			expect(parseResult).toBeDefined();
			expect(parseResult.file_name).toBe('sample_data.xlsx');
			expect(parseResult.sheet_count).toBeGreaterThanOrEqual(1);
			expect(parseResult.sheets).toBeDefined();
			expect(Array.isArray(parseResult.sheets)).toBe(true);

			// 验证任务状态更新
			const task = await excelImportService.getTaskStatus(taskId);
			expect(task?.status).toBe(TaskStatus.PARSED);
			expect(task?.parse_result).toBeDefined();
		});

		it('应该拒绝解析不存在的任务', async () => {
			await expect(
				excelImportService.parseExcelFile('invalid_task_id')
			).rejects.toThrow('任务不存在');
		});

		it('应该更新任务状态为 PARSING 然后 PARSED', async () => {
			const mockFile = {
				name: 'state_test.xlsx',
				size: 1024,
			};

			const taskId = await excelImportService.createUploadTask(mockFile);

			// 解析前状态应该是 PENDING
			let task = await excelImportService.getTaskStatus(taskId);
			expect(task?.status).toBe(TaskStatus.PENDING);

			// 开始解析
			const parsePromise = excelImportService.parseExcelFile(taskId);

			// 解析完成后状态应该是 PARSED
			await parsePromise;
			task = await excelImportService.getTaskStatus(taskId);
			expect(task?.status).toBe(TaskStatus.PARSED);
		});

		it('应该正确设置解析结果的工作表信息', async () => {
			const mockFile = {
				name: 'sheet_test.xlsx',
				size: 2048,
			};

			const taskId = await excelImportService.createUploadTask(mockFile);
			const parseResult = await excelImportService.parseExcelFile(taskId);

			// 验证工作表结构
			if (parseResult.sheets.length > 0) {
				const firstSheet = parseResult.sheets[0];
				expect(firstSheet).toHaveProperty('sheet_name');
				expect(firstSheet).toHaveProperty('row_count');
				expect(firstSheet).toHaveProperty('column_count');
				expect(firstSheet).toHaveProperty('headers');
				expect(firstSheet).toHaveProperty('fields');
				expect(firstSheet).toHaveProperty('preview_data');
				expect(Array.isArray(firstSheet.headers)).toBe(true);
				expect(Array.isArray(firstSheet.fields)).toBe(true);
				expect(Array.isArray(firstSheet.preview_data)).toBe(true);
			}
		});
	});

	describe('集合创建流程', () => {
		it('应该成功创建集合', async () => {
			const mockFile = {
				name: 'collection_test.xlsx',
				size: 3072,
			};

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
			];

			const taskId = await excelImportService.createUploadTask(mockFile);
			await excelImportService.parseExcelFile(taskId);

			const result = await excelImportService.createCollection(
				taskId,
				'bt_customers',
				fieldMappings
			);

			expect(result.collection_name).toBe('bt_customers');
			expect(result.fields_created).toBe(2);

			// 验证任务状态
			const task = await excelImportService.getTaskStatus(taskId);
			expect(task?.status).toBe(TaskStatus.COMPLETED);
			expect(task?.collection_name).toBe('bt_customers');
		});

		it('应该拒绝为不存在的任务创建集合', async () => {
			const fieldMappings: FieldMapping[] = [
				{
					field_name: 'test_field',
					display_name: '测试字段',
					type: FieldType.STRING,
					nullable: true,
					primary_key: false,
					unique: false,
				},
			];

			await expect(
				excelImportService.createCollection(
					'invalid_task_id',
					'bt_test',
					fieldMappings
				)
			).rejects.toThrow('任务不存在');
		});

		it('应该支持不同类型的字段', async () => {
			const mockFile = {
				name: 'field_types_test.xlsx',
				size: 2048,
			};

			const fieldMappings: FieldMapping[] = [
				{
					field_name: 'string_field',
					display_name: '字符串字段',
					type: FieldType.STRING,
					nullable: true,
					primary_key: false,
					unique: false,
				},
				{
					field_name: 'integer_field',
					display_name: '整数字段',
					type: FieldType.INTEGER,
					nullable: true,
					primary_key: false,
					unique: false,
				},
				{
					field_name: 'boolean_field',
					display_name: '布尔字段',
					type: FieldType.BOOLEAN,
					nullable: true,
					primary_key: false,
					unique: false,
				},
				{
					field_name: 'datetime_field',
					display_name: '日期时间字段',
					type: FieldType.DATETIME,
					nullable: true,
					primary_key: false,
					unique: false,
				},
			];

			const taskId = await excelImportService.createUploadTask(mockFile);
			await excelImportService.parseExcelFile(taskId);

			const result = await excelImportService.createCollection(
				taskId,
				'bt_field_types_test',
				fieldMappings
			);

			expect(result.fields_created).toBe(4);
		});

		it('应该更新任务状态为 CREATING_COLLECTION 然后 COMPLETED', async () => {
			const mockFile = {
				name: 'state_transition.xlsx',
				size: 1024,
			};

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

			const taskId = await excelImportService.createUploadTask(mockFile);
			await excelImportService.parseExcelFile(taskId);

			// 创建集合后状态应该是 COMPLETED
			await excelImportService.createCollection(
				taskId,
				'bt_state_test',
				fieldMappings
			);

			const task = await excelImportService.getTaskStatus(taskId);
			expect(task?.status).toBe(TaskStatus.COMPLETED);
		});
	});

	describe('数据集操作', () => {
		let testTableName: string;

		beforeEach(async () => {
			// 创建测试表
			testTableName = `bt_test_dataset_${Date.now()}`;
			await db.schema.createTable(testTableName, (table) => {
				table.increments('id').primary();
				table.string('name');
				table.string('email');
				table.timestamps(true, true);
			});

			// 插入测试数据
			await db(testTableName).insert([
				{ name: 'Test User 1', email: 'test1@example.com' },
				{ name: 'Test User 2', email: 'test2@example.com' },
				{ name: 'Test User 3', email: 'test3@example.com' },
			]);

			// 在注册表中创建记录
			await db('bt_dataset_registry').insert({
				collection_name: testTableName,
				display_name: 'Test Dataset',
				status: 'active',
				record_count: 3,
			});
		});

		describe('清空数据集', () => {
			it('应该成功清空数据集', async () => {
				// 验证初始数据
				let records = await db(testTableName).select('*');
				expect(records.length).toBe(3);

				// 清空数据集
				await excelImportService.truncateDataset(testTableName, db);

				// 验证数据已清空
				records = await db(testTableName).select('*');
				expect(records.length).toBe(0);
			});

			it('应该在数据库不可用时拒绝清空操作', async () => {
				await expect(
					excelImportService.truncateDataset(testTableName)
				).rejects.toThrow('数据库连接不可用');
			});

			it('应该拒绝清空不存在的表', async () => {
				await expect(
					excelImportService.truncateDataset('non_existent_table', db)
				).rejects.toThrow('数据集 non_existent_table 不存在');
			});
		});

		describe('更新数据集记录数', () => {
			it('应该成功更新记录数', async () => {
				const newRecordCount = 100;

				await excelImportService.updateDatasetRecordCount(
					testTableName,
					newRecordCount,
					db
				);

				// 验证更新
				const dataset = await db('bt_dataset_registry')
					.where('collection_name', testTableName)
					.first();

				expect(dataset.record_count).toBe(newRecordCount);
			});

			it('应该在数据库不可用时拒绝更新操作', async () => {
				await expect(
					excelImportService.updateDatasetRecordCount(testTableName, 100)
				).rejects.toThrow('数据库连接不可用');
			});
		});

		describe('删除数据集', () => {
			it('应该成功删除数据集（表结构和注册记录）', async () => {
				// 验证表和记录存在
				let tableExists = await db.schema.hasTable(testTableName);
				expect(tableExists).toBe(true);

				let datasetExists = await db('bt_dataset_registry')
					.where('collection_name', testTableName)
					.first();
				expect(datasetExists).toBeDefined();

				// 删除数据集
				await excelImportService.deleteDataset(testTableName, schema, db);

				// 验证表已删除
				tableExists = await db.schema.hasTable(testTableName);
				expect(tableExists).toBe(false);

				// 验证注册记录已删除
				datasetExists = await db('bt_dataset_registry')
					.where('collection_name', testTableName)
					.first();
				expect(datasetExists).toBeUndefined();
			});

			it('应该在数据库不可用时拒绝删除操作', async () => {
				await expect(
					excelImportService.deleteDataset(testTableName)
				).rejects.toThrow('数据库连接不可用');
			});

			it('应该拒绝删除不存在的表', async () => {
				await expect(
					excelImportService.deleteDataset('non_existent_table', schema, db)
				).rejects.toThrow('数据集 non_existent_table 不存在');
			});

			it('应该只删除指定的数据集，不影响其他数据集', async () => {
				// 创建另一个数据集
				const anotherTableName = `bt_another_dataset_${Date.now()}`;
				await db.schema.createTable(anotherTableName, (table) => {
					table.increments('id').primary();
					table.string('name');
				});

				await db('bt_dataset_registry').insert({
					collection_name: anotherTableName,
					display_name: 'Another Dataset',
					status: 'active',
				});

				// 删除第一个数据集
				await excelImportService.deleteDataset(testTableName, schema, db);

				// 验证第一个数据集已删除
				let firstTableExists = await db.schema.hasTable(testTableName);
				expect(firstTableExists).toBe(false);

				// 验证第二个数据集仍然存在
				let secondTableExists = await db.schema.hasTable(anotherTableName);
				expect(secondTableExists).toBe(true);

				let secondDatasetExists = await db('bt_dataset_registry')
					.where('collection_name', anotherTableName)
					.first();
				expect(secondDatasetExists).toBeDefined();

				// 清理
				await db.schema.dropTableIfExists(anotherTableName);
			});
		});
	});

	describe('完整导入流程', () => {
		it('应该完成端到端的导入流程', async () => {
			const mockFile = {
				name: 'e2e_test.xlsx',
				size: 5120,
			};

			const fieldMappings: FieldMapping[] = [
				{
					field_name: 'product_name',
					display_name: '产品名称',
					type: FieldType.STRING,
					nullable: false,
					primary_key: false,
					unique: false,
					max_length: 200,
				},
				{
					field_name: 'quantity',
					display_name: '数量',
					type: FieldType.INTEGER,
					nullable: true,
					primary_key: false,
					unique: false,
				},
				{
					field_name: 'price',
					display_name: '价格',
					type: FieldType.DECIMAL,
					nullable: true,
					primary_key: false,
					unique: false,
				},
			];

			// 1. 创建上传任务
			const taskId = await excelImportService.createUploadTask(mockFile);
			expect(taskId).toBeDefined();

			// 2. 解析 Excel 文件
			const parseResult = await excelImportService.parseExcelFile(taskId);
			expect(parseResult.file_name).toBe('e2e_test.xlsx');

			// 3. 创建集合
			const collectionResult = await excelImportService.createCollection(
				taskId,
				'bt_products_e2e',
				fieldMappings
			);
			expect(collectionResult.collection_name).toBe('bt_products_e2e');
			expect(collectionResult.fields_created).toBe(3);

			// 4. 验证最终状态
			const finalTask = await excelImportService.getTaskStatus(taskId);
			expect(finalTask?.status).toBe(TaskStatus.COMPLETED);
			expect(finalTask?.collection_name).toBe('bt_products_e2e');
		});

		it('应该处理包含大量字段的导入', async () => {
			const mockFile = {
				name: 'large_schema.xlsx',
				size: 10240,
			};

			// 创建大量字段映射
			const fieldMappings: FieldMapping[] = [];
			for (let i = 1; i <= 20; i++) {
				fieldMappings.push({
					field_name: `field_${i}`,
					display_name: `字段 ${i}`,
					type: FieldType.STRING,
					nullable: true,
					primary_key: false,
					unique: false,
					max_length: 100,
				});
			}

			const taskId = await excelImportService.createUploadTask(mockFile);
			await excelImportService.parseExcelFile(taskId);

			const result = await excelImportService.createCollection(
				taskId,
				'bt_large_schema',
				fieldMappings
			);

			expect(result.fields_created).toBe(20);
		});
	});

	describe('边界条件和错误处理', () => {
		it('应该处理空字段映射', async () => {
			const mockFile = {
				name: 'empty_fields.xlsx',
				size: 512,
			};

			const taskId = await excelImportService.createUploadTask(mockFile);
			await excelImportService.parseExcelFile(taskId);

			const result = await excelImportService.createCollection(
				taskId,
				'bt_empty_fields',
				[]
			);

			expect(result.fields_created).toBe(0);
		});

		it('应该处理特殊字符的集合名称', async () => {
			const mockFile = {
				name: 'special_chars.xlsx',
				size: 1024,
			};

			const fieldMappings: FieldMapping[] = [
				{
					field_name: 'test_field',
					display_name: '测试字段',
					type: FieldType.STRING,
					nullable: true,
					primary_key: false,
					unique: false,
				},
			];

			const taskId = await excelImportService.createUploadTask(mockFile);
			await excelImportService.parseExcelFile(taskId);

			// 集合名称可以包含下划线和数字
			const result = await excelImportService.createCollection(
				taskId,
				'bt_test_collection_2024_v1',
				fieldMappings
			);

			expect(result.collection_name).toBe('bt_test_collection_2024_v1');
		});

		it('应该处理零字节文件', async () => {
			const mockFile = {
				name: 'empty.xlsx',
				size: 0,
			};

			const taskId = await excelImportService.createUploadTask(mockFile);
			expect(taskId).toBeDefined();

			const task = await excelImportService.getTaskStatus(taskId);
			expect(task?.file_size).toBe(0);
		});

		it('应该处理非常长的文件名', async () => {
			const longFileName = 'a'.repeat(200) + '.xlsx';
			const mockFile = {
				name: longFileName,
				size: 1024,
			};

			const taskId = await excelImportService.createUploadTask(mockFile);
			const task = await excelImportService.getTaskStatus(taskId);

			expect(task?.file_name).toBe(longFileName);
		});
	});

	describe('任务状态转换', () => {
		it('应该遵循正确的状态转换流程', async () => {
			const mockFile = {
				name: 'state_flow.xlsx',
				size: 2048,
			};

			const fieldMappings: FieldMapping[] = [
				{
					field_name: 'data',
					display_name: '数据',
					type: FieldType.STRING,
					nullable: true,
					primary_key: false,
					unique: false,
				},
			];

			// 初始状态：PENDING
			const taskId = await excelImportService.createUploadTask(mockFile);
			let task = await excelImportService.getTaskStatus(taskId);
			expect(task?.status).toBe(TaskStatus.PENDING);

			// 解析后：PARSED
			await excelImportService.parseExcelFile(taskId);
			task = await excelImportService.getTaskStatus(taskId);
			expect(task?.status).toBe(TaskStatus.PARSED);

			// 创建集合后：COMPLETED
			await excelImportService.createCollection(
				taskId,
				'bt_state_flow',
				fieldMappings
			);
			task = await excelImportService.getTaskStatus(taskId);
			expect(task?.status).toBe(TaskStatus.COMPLETED);
		});

		it('应该正确更新时间戳', async () => {
			const mockFile = {
				name: 'timestamp_test.xlsx',
				size: 1024,
			};

			const taskId = await excelImportService.createUploadTask(mockFile);
			const task1 = await excelImportService.getTaskStatus(taskId);
			const createdAt1 = task1?.created_at;
			const updatedAt1 = task1?.updated_at;

			// 等待一小段时间确保时间戳不同
			await new Promise(resolve => setTimeout(resolve, 10));

			await excelImportService.parseExcelFile(taskId);
			const task2 = await excelImportService.getTaskStatus(taskId);
			const createdAt2 = task2?.created_at;
			const updatedAt2 = task2?.updated_at;

			// created_at 应该保持不变
			expect(createdAt1).toBe(createdAt2);

			// updated_at 应该已更新
			expect(updatedAt1).not.toBe(updatedAt2);
		});
	});

	describe('并发和性能', () => {
		it('应该能够处理多个并发任务', async () => {
			const tasks = Promise.all([
				excelImportService.createUploadTask({ name: 'file1.xlsx', size: 1024 }),
				excelImportService.createUploadTask({ name: 'file2.xlsx', size: 2048 }),
				excelImportService.createUploadTask({ name: 'file3.xlsx', size: 3072 }),
				excelImportService.createUploadTask({ name: 'file4.xlsx', size: 4096 }),
				excelImportService.createUploadTask({ name: 'file5.xlsx', size: 5120 }),
			]);

			const taskIds = await tasks;
			expect(taskIds).toHaveLength(5);

			// 验证所有任务 ID 都是唯一的
			const uniqueIds = new Set(taskIds);
			expect(uniqueIds.size).toBe(5);
		});

		it('应该快速查询任务状态', async () => {
			const mockFile = {
				name: 'performance_test.xlsx',
				size: 1024,
			};

			const taskId = await excelImportService.createUploadTask(mockFile);

			// 多次查询任务状态应该快速返回
			const startTime = Date.now();
			for (let i = 0; i < 100; i++) {
				await excelImportService.getTaskStatus(taskId);
			}
			const endTime = Date.now();

			// 100 次查询应该在合理时间内完成（例如 1 秒内）
			expect(endTime - startTime).toBeLessThan(1000);
		});
	});
});
