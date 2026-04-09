/**
 * Excel 导入快速入门示例
 *
 * 这个示例展示了如何使用 Excel 导入服务的基本功能
 */

import {
	parseExcelFile,
	validateExcelFile,
	getFileInfo,
	sanitizeData,
	removeEmptyRows,
} from '../../services/excel-parser';
import {
	createFieldMappings,
	adjustFieldMapping,
	FieldType,
} from '../../services/type-inference';
import type { ExcelParseResult, FieldMapping } from '../../types';

/**
 * 示例 1: 基本文件解析
 */
async function example1_BasicParsing(file: File) {
	console.log('=== 示例 1: 基本文件解析 ===\n');

	// 步骤 1: 验证文件
	console.log('1. 验证文件格式...');
	const validation = validateExcelFile(file);
	if (!validation.valid) {
		console.error('❌ 文件验证失败:', validation.error);
		return;
	}
	console.log('✓ 文件格式有效\n');

	// 步骤 2: 获取文件信息
	console.log('2. 获取文件信息...');
	const fileInfo = getFileInfo(file);
	console.log(`  文件名: ${fileInfo.name}`);
	console.log(`  文件大小: ${fileInfo.size_mb.toFixed(2)} MB\n`);

	// 步骤 3: 解析文件
	console.log('3. 解析 Excel 文件...');
	const result = await parseExcelFile(file);
	console.log(`✓ 解析完成`);
	console.log(`  工作表数量: ${result.sheet_count}`);
	console.log(`  第一个工作表: ${result.sheets[0].sheet_name}\n`);

	// 步骤 4: 查看解析结果
	const sheet = result.sheets[0];
	console.log('4. 解析结果:');
	console.log(`  表头: ${sheet.headers.join(', ')}`);
	console.log(`  行数: ${sheet.row_count}`);
	console.log(`  列数: ${sheet.column_count}`);
	console.log(`  字段数量: ${sheet.fields.length}\n`);

	return result;
}

/**
 * 示例 2: 类型推断和字段映射
 */
async function example2_TypeInference(file: File) {
	console.log('\n=== 示例 2: 类型推断和字段映射 ===\n');

	// 解析文件
	const result = await parseExcelFile(file);
	const sheet = result.sheets[0];

	console.log('1. 自动推断的字段类型:');
	sheet.fields.forEach((field, index) => {
		console.log(`  ${index + 1}. ${field.display_name} (${field.field_name})`);
		console.log(`     类型: ${field.type}`);
		console.log(`     可空: ${field.nullable}`);
		console.log(`     主键: ${field.primary_key}`);
	});

	// 步骤 2: 人工调整字段映射
	console.log('\n2. 人工调整字段映射...');
	const adjustedFields = sheet.fields.map((field, index) => {
		// 示例: 将第一列设为必填
		if (index === 0) {
			return adjustFieldMapping(field, {
				nullable: false,
				unique: true,
			});
		}
		return field;
	});

	console.log('✓ 字段映射已调整\n');

	return adjustedFields;
}

/**
 * 示例 3: 数据清理
 */
async function example3_DataCleaning(file: File) {
	console.log('\n=== 示例 3: 数据清理 ===\n');

	// 解析文件
	const result = await parseExcelFile(file);
	const sheet = result.sheets[0];

	console.log('1. 原始数据:');
	console.log(`  总行数: ${sheet.row_count}`);
	console.log(`  预览数据:`, sheet.preview_data[0]);

	// 步骤 2: 清理数据
	console.log('\n2. 清理数据...');
	const cleanedData = sanitizeData(sheet.preview_data);
	console.log('✓ 数据已清理');

	// 步骤 3: 移除空行
	console.log('\n3. 移除空行...');
	const dataWithoutEmptyRows = removeEmptyRows(cleanedData);
	console.log(`✓ 移除前: ${cleanedData.length} 行`);
	console.log(`✓ 移除后: ${dataWithoutEmptyRows.length} 行\n`);

	return dataWithoutEmptyRows;
}

/**
 * 示例 4: 自定义配置
 */
async function example4_CustomConfig(file: File) {
	console.log('\n=== 示例 4: 自定义配置 ===\n');

	// 使用自定义配置解析文件
	const result = await parseExcelFile(
		file,
		{
			max_preview_rows: 20, // 增加预览行数
			max_sheets: 3, // 最多处理 3 个工作表
			skip_empty_rows: true, // 跳过空行
			header_row: 1, // 使用第二行作为表头
			type_inference: {
				max_sample_size: 200, // 增加样本数量
				confidence_threshold: 0.8, // 提高置信度阈值
			},
		},
		{
			sheetIndex: 0, // 只处理第一个工作表
		}
	);

	console.log('✓ 使用自定义配置解析完成');
	console.log(`  工作表: ${result.sheets[0].sheet_name}`);
	console.log(`  表头: ${result.sheets[0].headers.join(', ')}`);
	console.log(`  预览行数: ${result.sheets[0].preview_data.length}\n`);

	return result;
}

/**
 * 示例 5: 完整工作流程
 */
async function example5_CompleteWorkflow(file: File) {
	console.log('\n=== 示例 5: 完整工作流程 ===\n');

	try {
		// 步骤 1: 验证文件
		console.log('步骤 1: 验证文件...');
		const validation = validateExcelFile(file);
		if (!validation.valid) {
			throw new Error(validation.error);
		}
		console.log('✓ 文件有效\n');

		// 步骤 2: 解析文件
		console.log('步骤 2: 解析文件...');
		const parseResult = await parseExcelFile(file, {
			max_preview_rows: 10,
			type_inference: {
				confidence_threshold: 0.7,
			},
		});
		console.log('✓ 解析完成\n');

		// 步骤 3: 分析字段
		console.log('步骤 3: 分析字段...');
		const sheet = parseResult.sheets[0];
		console.log(`  检测到 ${sheet.fields.length} 个字段:`);
		sheet.fields.forEach((field) => {
			console.log(`    - ${field.display_name} (${field.type})`);
		});
		console.log();

		// 步骤 4: 清理数据
		console.log('步骤 4: 清理数据...');
		const cleanedData = sanitizeData(sheet.preview_data);
		const finalData = removeEmptyRows(cleanedData);
		console.log(`✓ 清理完成，保留 ${finalData.length} 行数据\n`);

		// 步骤 5: 准备创建集合
		console.log('步骤 5: 准备创建集合...');
		const collectionConfig = {
			name: 'imported_data',
			fields: sheet.fields,
			data: finalData,
		};
		console.log('✓ 集合配置准备完成\n');

		// 返回配置，可以用于创建 Directus 集合
		return collectionConfig;
	} catch (error) {
		console.error('❌ 工作流程失败:', error);
		throw error;
	}
}

/**
 * 主函数 - 运行所有示例
 */
export async function runExamples(file: File) {
	console.log('Excel 导入服务 - 快速入门示例\n');
	console.log('='.repeat(60) + '\n');

	try {
		// 运行示例 1
		await example1_BasicParsing(file);

		// 运行示例 2
		await example2_TypeInference(file);

		// 运行示例 3
		await example3_DataCleaning(file);

		// 运行示例 4
		await example4_CustomConfig(file);

		// 运行示例 5
		const config = await example5_CompleteWorkflow(file);

		console.log('='.repeat(60));
		console.log('\n✓ 所有示例运行完成！');
		console.log('\n接下来可以:');
		console.log('  1. 使用配置创建 Directus 集合');
		console.log('  2. 导入数据到集合');
		console.log('  3. 设置数据验证规则');
		console.log('  4. 配置用户权限\n');

		return config;
	} catch (error) {
		console.error('\n❌ 示例运行失败:', error);
		throw error;
	}
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
	console.log('请提供 Excel 文件路径作为参数');
	console.log('用法: npm run example -- <path-to-excel-file>');
}
