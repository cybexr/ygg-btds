/**
 * ImportJobRunner 性能测试
 * 用于验证 10,000 条数据的导入功能
 */

import { ImportJobRunner, ImportJobStatus, type BatchDataItem } from './import-job-runner';
import { Knex } from 'knex';

/**
 * 生成测试数据
 */
function generateTestData(rowCount: number): BatchDataItem[] {
	const data: BatchDataItem[] = [];

	for (let i = 0; i < rowCount; i++) {
		data.push({
			row_number: i + 1,
			sheet_name: 'Sheet1',
			data: {
				id: i + 1,
				name: `测试项目 ${i + 1}`,
				description: `这是第 ${i + 1} 条测试数据的描述`,
				value: Math.random() * 1000,
				category: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
				created_at: new Date().toISOString(),
				is_active: Math.random() > 0.5,
			},
		});
	}

	return data;
}

/**
 * 创建测试表
 */
async function createTestTable(database: Knex, tableName: string): Promise<void> {
	const hasTable = await database.schema.hasTable(tableName);

	if (!hasTable) {
		await database.schema.createTable(tableName, (table) => {
			table.increments('id').primary();
			table.string('name', 255).notNullable();
			table.text('description');
			table.decimal('value', 10, 2);
			table.string('category', 50);
			table.timestamp('created_at');
			table.boolean('is_active').defaultTo(true);
		});

		console.log(`测试表 ${tableName} 创建成功`);
	}
}

/**
 * 性能测试主函数
 */
export async function runPerformanceTest(database: Knex): Promise<void> {
	console.log('开始 ImportJobRunner 性能测试...\n');

	const runner = new ImportJobRunner(database, 3);
	const testTableName = 'bt_test_performance';
	const testDataSize = 10000;

	try {
		// 创建测试表
		await createTestTable(database, testTableName);

		// 生成测试数据
		console.log(`生成 ${testDataSize} 条测试数据...`);
		const testData = generateTestData(testDataSize);
		console.log('测试数据生成完成\n');

		// 创建导入任务
		const config = {
			jobIdentifier: `perf_test_${Date.now()}`,
			sourceFileName: 'performance_test_data.xlsx',
			fileSizeBytes: JSON.stringify(testData).length,
			totalRows: testDataSize,
			batchSize: 1000,
			createdUserId: 1,
		};

		console.log('创建导入任务...');
		const jobId = await runner.createImportJob(config);
		console.log(`任务创建成功，ID: ${jobId}\n`);

		// 进度跟踪
		const progressUpdates: Array<{
			timestamp: Date;
			progress: number;
			processedRows: number;
		}> = [];

		// 启动导入任务
		console.log('开始导入数据...');
		const startTime = Date.now();

		const result = await runner.startImportJob(
			jobId,
			testData,
			testTableName,
			async (progress) => {
				progressUpdates.push({
					timestamp: new Date(),
					progress: progress.progress,
					processedRows: progress.processedRows,
				});

				// 每 10% 输出一次进度
				if (progress.progress % 10 === 0) {
					console.log(
						`进度: ${progress.progress}% | ` +
							`已处理: ${progress.processedRows}/${progress.totalRows} | ` +
							`成功: ${progress.successRows} | ` +
							`失败: ${progress.failedRows}`
					);
				}
			}
		);

		const endTime = Date.now();
		const duration = endTime - startTime;

		// 输出结果
		console.log('\n========== 测试结果 ==========');
		console.log(`任务 ID: ${result.jobId}`);
		console.log(`状态: ${result.status}`);
		console.log(`总行数: ${result.totalRows}`);
		console.log(`已处理: ${result.processedRows}`);
		console.log(`成功: ${result.successRows}`);
		console.log(`失败: ${result.failedRows}`);
		console.log(`耗时: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
		console.log(`平均速度: ${(testDataSize / (duration / 1000)).toFixed(2)} 条/秒`);

		// 性能指标
		const metrics = runner.getPerformanceMetrics(jobId);
		if (metrics) {
			console.log('\n========== 性能指标 ==========');
			console.log(`平均批处理时间: ${metrics.averageBatchTime}ms`);
			console.log(`总执行时间: ${metrics.totalDuration}ms`);
		}

		// 进度更新统计
		console.log('\n========== 进度更新 ==========');
		console.log(`总更新次数: ${progressUpdates.length}`);
		if (progressUpdates.length > 1) {
			const avgInterval =
				progressUpdates[progressUpdates.length - 1].timestamp.getTime() -
				progressUpdates[0].timestamp.getTime() / progressUpdates.length;
			console.log(`平均更新间隔: ${avgInterval.toFixed(2)}ms`);
		}

		// 验证数据
		console.log('\n========== 数据验证 ==========');
		const insertedCount = await database(testTableName).count('id as count').first();
		console.log(`表中实际记录数: ${insertedCount?.count || 0}`);

		// 清理
		console.log('\n========== 清理 ==========');
		await runner.cleanupJob(jobId);
		await database.schema.dropTableIfExists(testTableName);
		console.log('测试完成，资源已清理');

		// 测试结果评估
		console.log('\n========== 测试评估 ==========');
		if (result.status === ImportJobStatus.COMPLETED && result.failedRows === 0) {
			console.log('✅ 测试通过：所有数据成功导入');
		} else if (result.status === ImportJobStatus.COMPLETED && result.failedRows > 0) {
			console.log(`⚠️ 部分成功：${result.successRows} 条成功，${result.failedRows} 条失败`);
		} else {
			console.log('❌ 测试失败');
		}

		// 性能评估
		const rowsPerSecond = testDataSize / (duration / 1000);
		if (rowsPerSecond > 1000) {
			console.log('✅ 性能优秀：超过 1000 条/秒');
		} else if (rowsPerSecond > 500) {
			console.log('✅ 性能良好：超过 500 条/秒');
		} else {
			console.log('⚠️ 性能一般：低于 500 条/秒');
		}
	} catch (error) {
		console.error('\n❌ 测试失败:', error);
		throw error;
	}
}

/**
 * 批量任务测试
 */
export async function runBatchJobTest(database: Knex): Promise<void> {
	console.log('开始批量任务测试...\n');

	const runner = new ImportJobRunner(database, 2); // 限制为 2 个并发
	const testTableName = 'bt_test_batch';
	const jobCount = 5;
	const rowsPerJob = 2000;

	try {
		// 创建测试表
		await createTestTable(database, testTableName);

		const jobs: Array<{ jobId: number; testData: BatchDataItem[] }> = [];

		// 创建多个任务
		for (let i = 0; i < jobCount; i++) {
			const config = {
				jobIdentifier: `batch_test_${Date.now()}_${i}`,
				sourceFileName: `batch_test_${i}.xlsx`,
				fileSizeBytes: 0,
				totalRows: rowsPerJob,
				batchSize: 500,
				createdUserId: 1,
			};

			const jobId = await runner.createImportJob(config);
			const testData = generateTestData(rowsPerJob);

			jobs.push({ jobId, testData });

			console.log(`任务 ${i + 1} 创建成功，ID: ${jobId}`);
		}

		console.log('\n开始并发处理任务...\n');

		// 将任务添加到队列
		const results: any[] = [];
		for (let i = 0; i < jobs.length; i++) {
			const { jobId, testData } = jobs[i];

			const promise = runner
				.startImportJob(jobId, testData, testTableName, async (progress) => {
					console.log(`任务 ${i + 1} 进度: ${progress.progress}%`);
				})
				.then((result) => {
					console.log(`任务 ${i + 1} 完成: ${result.status}`);
					return result;
				})
				.catch((error) => {
					console.error(`任务 ${i + 1} 失败:`, error.message);
					throw error;
				});

			results.push(promise);
		}

		// 等待所有任务完成
		const allResults = await Promise.all(results);

		console.log('\n========== 批量任务测试结果 ==========');
		console.log(`总任务数: ${allResults.length}`);
		console.log(`成功任务数: ${allResults.filter((r) => r.status === ImportJobStatus.COMPLETED).length}`);
		console.log(`失败任务数: ${allResults.filter((r) => r.status === ImportJobStatus.FAILED).length}`);

		const totalRows = allResults.reduce((sum, r) => sum + r.totalRows, 0);
		const totalSuccess = allResults.reduce((sum, r) => sum + r.successRows, 0);
		const totalFailed = allResults.reduce((sum, r) => sum + r.failedRows, 0);

		console.log(`总行数: ${totalRows}`);
		console.log(`成功: ${totalSuccess}`);
		console.log(`失败: ${totalFailed}`);

		// 清理
		for (const job of jobs) {
			await runner.cleanupJob(job.jobId);
		}
		await database.schema.dropTableIfExists(testTableName);
		console.log('\n批量任务测试完成，资源已清理');
	} catch (error) {
		console.error('\n❌ 批量任务测试失败:', error);
		throw error;
	}
}

/**
 * 错误处理测试
 */
export async function runErrorHandlingTest(database: Knex): Promise<void> {
	console.log('开始错误处理测试...\n');

	const runner = new ImportJobRunner(database, 1);
	const testTableName = 'bt_test_errors';

	try {
		// 创建测试表（带唯一约束）
		const hasTable = await database.schema.hasTable(testTableName);
		if (!hasTable) {
			await database.schema.createTable(testTableName, (table) => {
				table.increments('id').primary();
				table.string('email', 255).notNullable().unique();
				table.string('name', 255);
			});
		}

		// 生成包含重复数据的测试数据
		const testData: BatchDataItem[] = [];
		for (let i = 0; i < 100; i++) {
			testData.push({
				row_number: i + 1,
				data: {
					email: `user${i % 10}@example.com`, // 故意创建重复
					name: `用户 ${i + 1}`,
				},
			});
		}

		const config = {
			jobIdentifier: `error_test_${Date.now()}`,
			sourceFileName: 'error_test.xlsx',
			fileSizeBytes: JSON.stringify(testData).length,
			totalRows: testData.length,
			batchSize: 50,
			createdUserId: 1,
		};

		const jobId = await runner.createImportJob(config);

		console.log('开始导入包含错误的数据...');
		const result = await runner.startImportJob(jobId, testData, testTableName);

		console.log('\n========== 错误处理测试结果 ==========');
		console.log(`总行数: ${result.totalRows}`);
		console.log(`成功: ${result.successRows}`);
		console.log(`失败: ${result.failedRows}`);
		console.log(`错误率: ${((result.failedRows / result.totalRows) * 100).toFixed(2)}%`);

		// 检查错误记录
		const errorRecords = await database('bt_import_errors')
			.where('import_job_id', jobId)
			.orderBy('row_number')
			.limit(10);

		console.log('\n========== 错误记录示例 ==========');
		for (const error of errorRecords.slice(0, 5)) {
			console.log(
				`行 ${error.row_number}: ${error.error_type} - ${error.error_message}`
			);
		}

		// 验证错误分类
		const errorTypes = new Map<string, number>();
		for (const error of result.errors) {
			const count = errorTypes.get(error.error_type) || 0;
			errorTypes.set(error.error_type, count + 1);
		}

		console.log('\n========== 错误类型统计 ==========');
		Array.from(errorTypes.entries()).forEach(([type, count]) => {
			console.log(`${type}: ${count}`);
		});

		// 清理
		await runner.cleanupJob(jobId);
		await database.schema.dropTableIfExists(testTableName);
		console.log('\n错误处理测试完成，资源已清理');
	} catch (error) {
		console.error('\n❌ 错误处理测试失败:', error);
		throw error;
	}
}
