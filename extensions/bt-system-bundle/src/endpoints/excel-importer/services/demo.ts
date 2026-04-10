/**
 * ImportJobRunner 演示脚本
 * 展示如何使用 ImportJobRunner 进行数据导入
 */

import { ImportJobRunner, ImportJobStatus } from './import-job-runner';
import { Knex } from 'knex';

/**
 * 简单演示：导入 100 条测试数据
 */
export async function demoSimpleImport(database: Knex): Promise<void> {
	console.log('========== ImportJobRunner 简单演示 ==========\n');

	const runner = new ImportJobRunner(database);

	// 1. 创建测试表
	const tableName = 'bt_demo_products';
	await database.schema.dropTableIfExists(tableName);
	await database.schema.createTable(tableName, (table) => {
		table.increments('id').primary();
		table.string('name', 255).notNullable();
		table.decimal('price', 10, 2);
		table.string('category', 100);
		table.text('description');
		table.boolean('in_stock').defaultTo(true);
	});

	console.log(`✅ 创建测试表: ${tableName}\n`);

	// 2. 准备测试数据
	// 注意：Math.random() 仅用于生成演示数据，不涉及安全敏感场景
	const testData = Array.from({ length: 100 }, (_, i) => ({
		row_number: i + 1,
		data: {
			name: `商品 ${i + 1}`,
			price: Math.floor(Math.random() * 10000) / 100,
			category: ['电子产品', '服装', '食品', '图书'][Math.floor(Math.random() * 4)],
			description: `这是商品 ${i + 1} 的详细描述`,
			in_stock: Math.random() > 0.2,
		},
	}));

	console.log(`✅ 准备测试数据: ${testData.length} 条\n`);

	// 3. 创建导入任务
	const config = {
		jobIdentifier: `demo_${Date.now()}`,
		sourceFileName: 'products.xlsx',
		fileSizeBytes: JSON.stringify(testData).length,
		totalRows: testData.length,
		batchSize: 25, // 每批 25 条，演示批处理
		createdUserId: 1,
	};

	const jobId = await runner.createImportJob(config);
	console.log(`✅ 创建导入任务: ID = ${jobId}\n`);

	// 4. 启动导入任务
	console.log('开始导入数据...\n');

	const result = await runner.startImportJob(jobId, testData, tableName, (progress) => {
		if (progress.progress % 25 === 0) {
			console.log(
				`  进度: ${progress.progress}% | ` +
					`已处理: ${progress.processedRows} | ` +
					`成功: ${progress.successRows} | ` +
					`失败: ${progress.failedRows}`
			);
		}
	});

	// 5. 显示结果
	console.log('\n========== 导入结果 ==========');
	console.log(`状态: ${result.status}`);
	console.log(`总行数: ${result.totalRows}`);
	console.log(`成功: ${result.successRows}`);
	console.log(`失败: ${result.failedRows}`);
	console.log(`耗时: ${result.duration}ms`);
	console.log(`平均速度: ${(result.totalRows / (result.duration / 1000)).toFixed(2)} 条/秒`);

	// 6. 验证数据
	const count = await database(tableName).count('id as count').first();
	console.log(`\n✅ 表中实际记录数: ${count?.count || 0}`);

	// 7. 查看性能指标
	const metrics = runner.getPerformanceMetrics(jobId);
	if (metrics) {
			console.log('\n========== 性能指标 ==========');
		console.log(`平均批处理时间: ${metrics.averageBatchTime}ms`);
		console.log(`总执行时间: ${metrics.totalDuration}ms`);
	}

	// 8. 清理
	await runner.cleanupJob(jobId);
	await database.schema.dropTableIfExists(tableName);
	console.log('\n✅ 清理完成');
}

/**
 * 错误处理演示：展示错误记录和恢复
 */
export async function demoErrorHandling(database: Knex): Promise<void> {
	console.log('\n========== 错误处理演示 ==========\n');

	const runner = new ImportJobRunner(database);

	// 1. 创建带约束的测试表
	const tableName = 'bt_demo_users';
	await database.schema.dropTableIfExists(tableName);
	await database.schema.createTable(tableName, (table) => {
		table.increments('id').primary();
		table.string('email', 255).notNullable().unique();
		table.string('username', 100).notNullable().unique();
		table.integer('age').unsigned();
	});

	console.log(`✅ 创建测试表: ${tableName} (带唯一约束)\n`);

	// 2. 准备包含错误的数据
	const testData = [
		{ row_number: 1, data: { email: 'user1@example.com', username: 'user1', age: 25 } },
		{ row_number: 2, data: { email: 'user2@example.com', username: 'user2', age: 30 } },
		{ row_number: 3, data: { email: 'user1@example.com', username: 'user1', age: 35 } }, // 重复
		{ row_number: 4, data: { email: 'user3@example.com', username: 'user3', age: -5 } }, // 年龄无效
		{ row_number: 5, data: { email: 'user4@example.com', username: 'user4', age: 28 } },
	];

	console.log(`✅ 准备测试数据: ${testData.length} 条 (包含重复和无效数据)\n`);

	// 3. 创建并运行导入任务
	const config = {
		jobIdentifier: `error_demo_${Date.now()}`,
		sourceFileName: 'users.xlsx',
		fileSizeBytes: JSON.stringify(testData).length,
		totalRows: testData.length,
		createdUserId: 1,
	};

	const jobId = await runner.createImportJob(config);
	console.log(`✅ 创建导入任务: ID = ${jobId}\n`);

	try {
		const result = await runner.startImportJob(jobId, testData, tableName);

		console.log('\n========== 导入结果 ==========');
		console.log(`总行数: ${result.totalRows}`);
		console.log(`成功: ${result.successRows}`);
		console.log(`失败: ${result.failedRows}`);

		if (result.errors.length > 0) {
			console.log('\n========== 错误详情 ==========');
			result.errors.forEach((error) => {
				console.log(`  行 ${error.row_number}: ${error.error_type}`);
				console.log(`    消息: ${error.error_message}`);
			});
		}
	} catch (error) {
		console.error('导入失败:', error);
	}

	// 4. 查询错误记录
	const errorRecords = await database('bt_import_errors')
		.where('import_job_id', jobId)
		.orderBy('row_number');

	if (errorRecords.length > 0) {
		console.log('\n========== 数据库错误记录 ==========');
		errorRecords.forEach((error) => {
			console.log(`  行 ${error.row_number}: ${error.error_type}`);
		});
	}

	// 5. 清理
	await runner.cleanupJob(jobId);
	await database.schema.dropTableIfExists(tableName);
	console.log('\n✅ 清理完成');
}

/**
 * 任务控制演示：展示暂停、恢复和取消
 */
export async function demoJobControl(database: Knex): Promise<void> {
	console.log('\n========== 任务控制演示 ==========\n');

	const runner = new ImportJobRunner(database);

	// 1. 创建测试表
	const tableName = 'bt_demo_orders';
	await database.schema.dropTableIfExists(tableName);
	await database.schema.createTable(tableName, (table) => {
		table.increments('id').primary();
		table.string('order_id', 50).notNullable();
		table.decimal('amount', 10, 2);
		table.string('status', 50);
	});

	console.log(`✅ 创建测试表: ${tableName}\n`);

	// 2. 准备大量数据
	// 注意：Math.random() 仅用于生成演示数据，不涉及安全敏感场景
	const testData = Array.from({ length: 500 }, (_, i) => ({
		row_number: i + 1,
		data: {
			order_id: `ORD${String(i + 1).padStart(4, '0')}`,
			amount: Math.floor(Math.random() * 10000) / 100,
			status: 'pending',
		},
	}));

	console.log(`✅ 准备测试数据: ${testData.length} 条\n`);

	// 3. 创建导入任务
	const config = {
		jobIdentifier: `control_demo_${Date.now()}`,
		sourceFileName: 'orders.xlsx',
		fileSizeBytes: JSON.stringify(testData).length,
		totalRows: testData.length,
		batchSize: 100,
		createdUserId: 1,
	};

	const jobId = await runner.createImportJob(config);
	console.log(`✅ 创建导入任务: ID = ${jobId}\n`);

	// 4. 启动任务并立即暂停
	console.log('启动任务并在 50% 时暂停...\n');

	let pauseTriggered = false;
	const result = await runner.startImportJob(jobId, testData, tableName, async (progress) => {
		console.log(`  进度: ${progress.progress}%`);

		// 在 50% 时暂停任务
		if (!pauseTriggered && progress.progress >= 50) {
			pauseTriggered = true;
			console.log('\n⏸️ 暂停任务...');
			await runner.pauseJob(jobId);
		}
	});

	console.log('\n========== 任务状态 ==========');
	const progress = await runner.getJobProgress(jobId);
	console.log(`状态: ${progress.status}`);
	console.log(`已处理: ${progress.processedRows}/${progress.totalRows}`);

	// 5. 恢复任务
	console.log('\n▶️ 恢复任务...\n');

	const remainingData = testData.slice(progress.processedRows);
	const finalResult = await runner.resumeJob(jobId, remainingData, tableName, (progress) => {
		console.log(`  进度: ${progress.progress}%`);
	});

	console.log('\n========== 最终结果 ==========');
	console.log(`状态: ${finalResult.status}`);
	console.log(`总行数: ${finalResult.totalRows}`);
	console.log(`成功: ${finalResult.successRows}`);
	console.log(`失败: ${finalResult.failedRows}`);

	// 6. 清理
	await runner.cleanupJob(jobId);
	await database.schema.dropTableIfExists(tableName);
	console.log('\n✅ 清理完成');
}

/**
 * 运行所有演示
 */
export async function runAllDemos(database: Knex): Promise<void> {
	try {
		await demoSimpleImport(database);
		await demoErrorHandling(database);
		await demoJobControl(database);
		console.log('\n========== 所有演示完成 ==========');
	} catch (error) {
		console.error('\n❌ 演示失败:', error);
		throw error;
	}
}
