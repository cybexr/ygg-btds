/**
 * 完整的使用示例：在 Directus Endpoint 中使用 Schema Builder 和 Registry Service
 *
 * 这个示例展示了如何在 Directus endpoint 中集成 schema-builder 和 registry-service
 * 来实现动态建表和数据集管理功能。
 */

import { SchemaBuilder } from './services/schema-builder';
import { RegistryService, DatasetRegistration } from './services/registry-service';
import { FieldMapping, FieldType } from './types';
import type { Request, Response } from 'express';

/**
 * 示例 1: 创建基本的 Excel 导入 endpoint
 */
export async function handleExcelImport(req: Request, res: Response) {
	try {
		// 1. 从 Directus 上下文获取数据库连接
		const database = req.context?.database;
		if (!database) {
			return res.status(500).json({ error: 'Database connection not available' });
		}

		// 2. 初始化服务
		const schemaBuilder = new SchemaBuilder(database);
		const registryService = new RegistryService(database);

		// 3. 从请求中获取数据
		const { collection_name, display_name, field_mappings, source_file_name } = req.body;

		// 4. 验证字段配置
		const validation = schemaBuilder.validateFieldMappings(field_mappings);
		if (!validation.valid) {
			return res.status(400).json({
				error: 'Invalid field mappings',
				details: validation.errors,
			});
		}

		// 5. 验证集合名称唯一性
		const nameValidation = await registryService.validateCollectionNameUniqueness(
			collection_name
		);
		if (!nameValidation.valid) {
			return res.status(409).json({
				error: 'Collection name already exists',
				details: nameValidation.error,
			});
		}

		// 6. 准备注册信息
		const registration: DatasetRegistration = {
			collection_name,
			display_name,
			status: 'draft',
			source_file_name,
			record_count: 0,
			field_schema_json: RegistryService.buildFieldSchemaJson(field_mappings),
			description: `从 ${source_file_name} 导入`,
			tags: [],
			created_user_id: req.context?.accountability?.user,
		};

		// 7. 使用事务创建集合并登记
		const dataset = await registryService.createDatasetWithTransaction(
			registration,
			async () => {
				await schemaBuilder.createCollection(
					collection_name,
					field_mappings,
					{
						displayName: display_name,
						hidden: true,
						note: registration.description,
					}
				);
			}
		);

		// 8. 返回成功响应
		return res.status(201).json({
			success: true,
			data: {
				dataset_id: dataset.id,
				collection_name: dataset.collection_name,
				status: dataset.status,
				message: '数据集创建成功',
			},
		});
	} catch (error) {
		console.error('Import failed:', error);
		return res.status(500).json({
			error: 'Import failed',
			message: error instanceof Error ? error.message : 'Unknown error',
		});
	}
}

/**
 * 示例 2: 批量导入数据并更新状态
 */
export async function handleDataImport(req: Request, res: Response) {
	try {
		const database = req.context?.database;
		if (!database) {
			return res.status(500).json({ error: 'Database connection not available' });
		}

		const registryService = new RegistryService(database);
		const { collection_name, data } = req.body;

		// 1. 验证数据集存在
		const dataset = await registryService.getDatasetByCollectionName(collection_name);
		if (!dataset) {
			return res.status(404).json({ error: 'Dataset not found' });
		}

		// 2. 导入数据（这里简化处理，实际应该使用 ImportJobRunner）
		let successCount = 0;
		let failedCount = 0;

		for (const row of data) {
			try {
				await database(collection_name).insert(row);
				successCount++;
			} catch (error) {
				failedCount++;
				console.error(`Failed to insert row:`, error);
			}
		}

		// 3. 更新记录数量
		await registryService.updateRecordCount(collection_name, successCount);

		// 4. 如果全部成功，更新状态为 active
		if (failedCount === 0 && successCount > 0) {
			await registryService.updateDatasetStatus(
				collection_name,
				'active',
				req.context?.accountability?.user
			);
		}

		// 5. 返回导入结果
		return res.json({
			success: true,
			data: {
				total_rows: data.length,
				success_rows: successCount,
				failed_rows: failedCount,
				collection_name,
			},
		});
	} catch (error) {
		console.error('Data import failed:', error);
		return res.status(500).json({
			error: 'Data import failed',
			message: error instanceof Error ? error.message : 'Unknown error',
		});
	}
}

/**
 * 示例 3: 查询数据集列表
 */
export async function handleListDatasets(req: Request, res: Response) {
	try {
		const database = req.context?.database;
		if (!database) {
			return res.status(500).json({ error: 'Database connection not available' });
		}

		const registryService = new RegistryService(database);
		const { status, search, tags, limit = 50, offset = 0 } = req.query;

		let datasets;

		if (search) {
			// 搜索模式
			datasets = await registryService.searchDatasets(search as string);
		} else if (tags) {
			// 标签过滤
			const tagArray = Array.isArray(tags) ? tags : [tags];
			datasets = await registryService.getDatasetsByTags(tagArray as string[]);
		} else {
			// 标准查询
			datasets = await registryService.getAllDatasets({
				status: status as 'draft' | 'active' | 'hidden',
				userId: req.context?.accountability?.user,
				limit: Number(limit),
				offset: Number(offset),
			});
		}

		return res.json({
			success: true,
			data: datasets,
			meta: {
				total: datasets.length,
				limit: Number(limit),
				offset: Number(offset),
			},
		});
	} catch (error) {
		console.error('Failed to list datasets:', error);
		return res.status(500).json({
			error: 'Failed to list datasets',
			message: error instanceof Error ? error.message : 'Unknown error',
		});
	}
}

/**
 * 示例 4: 更新数据集状态
 */
export async function handleUpdateDatasetStatus(req: Request, res: Response) {
	try {
		const database = req.context?.database;
		if (!database) {
			return res.status(500).json({ error: 'Database connection not available' });
		}

		const registryService = new RegistryService(database);
		const { collection_name } = req.params;
		const { status } = req.body;

		// 验证状态值
		const validStatuses = ['draft', 'active', 'hidden'];
		if (!validStatuses.includes(status)) {
			return res.status(400).json({
				error: 'Invalid status',
				details: `Status must be one of: ${validStatuses.join(', ')}`,
			});
		}

		// 更新状态
		const updated = await registryService.updateDatasetStatus(
			collection_name,
			status,
			req.context?.accountability?.user
		);

		if (!updated) {
			return res.status(404).json({ error: 'Dataset not found' });
		}

		// 获取更新后的数据集信息
		const dataset = await registryService.getDatasetByCollectionName(collection_name);

		return res.json({
			success: true,
			data: dataset,
		});
	} catch (error) {
		console.error('Failed to update dataset status:', error);
		return res.status(500).json({
			error: 'Failed to update dataset status',
			message: error instanceof Error ? error.message : 'Unknown error',
		});
	}
}

/**
 * 示例 5: 获取数据集统计信息
 */
export async function handleGetStatistics(req: Request, res: Response) {
	try {
		const database = req.context?.database;
		if (!database) {
			return res.status(500).json({ error: 'Database connection not available' });
		}

		const registryService = new RegistryService(database);
		const stats = await registryService.getStatistics();

		return res.json({
			success: true,
			data: stats,
		});
	} catch (error) {
		console.error('Failed to get statistics:', error);
		return res.status(500).json({
			error: 'Failed to get statistics',
			message: error instanceof Error ? error.message : 'Unknown error',
		});
	}
}

/**
 * 示例 6: 删除数据集
 */
export async function handleDeleteDataset(req: Request, res: Response) {
	try {
		const database = req.context?.database;
		if (!database) {
			return res.status(500).json({ error: 'Database connection not available' });
		}

		const schemaBuilder = new SchemaBuilder(database);
		const registryService = new RegistryService(database);
		const { collection_name } = req.params;

		// 1. 验证数据集存在
		const dataset = await registryService.getDatasetByCollectionName(collection_name);
		if (!dataset) {
			return res.status(404).json({ error: 'Dataset not found' });
		}

		// 2. 删除集合（包括表和元数据）
		await schemaBuilder.dropCollection(collection_name);

		// 3. 从注册表中删除
		await registryService.unregisterDataset(collection_name);

		return res.json({
			success: true,
			message: 'Dataset deleted successfully',
		});
	} catch (error) {
		console.error('Failed to delete dataset:', error);
		return res.status(500).json({
			error: 'Failed to delete dataset',
			message: error instanceof Error ? error.message : 'Unknown error',
		});
	}
}

/**
 * 示例 7: 完整的工作流 - 从 Excel 文件到可用数据集
 */
export async function handleCompleteImportWorkflow(
	req: Request,
	res: Response
) {
	try {
		const database = req.context?.database;
		if (!database) {
			return res.status(500).json({ error: 'Database connection not available' });
		}

		const schemaBuilder = new SchemaBuilder(database);
		const registryService = new RegistryService(database);

		// 假设从前端传入以下数据
		const {
			file_name,
			display_name,
			field_mappings, // 从 Excel 解析出的字段信息
			data, // 要导入的数据
		} = req.body;

		// 1. 生成唯一的集合名称
		const timestamp = Date.now();
		const collection_name = `bt_dataset_${timestamp}`;

		// 2. 验证字段配置
		const validation = schemaBuilder.validateFieldMappings(field_mappings);
		if (!validation.valid) {
			return res.status(400).json({
				error: 'Invalid field mappings',
				details: validation.errors,
			});
		}

		// 3. 准备注册信息
		const registration: DatasetRegistration = {
			collection_name,
			display_name,
			status: 'draft',
			source_file_name: file_name,
			record_count: 0,
			field_schema_json: RegistryService.buildFieldSchemaJson(field_mappings),
			description: `从 ${file_name} 导入`,
			tags: [],
			created_user_id: req.context?.accountability?.user,
		};

		// 4. 创建集合并登记（使用事务）
		const dataset = await registryService.createDatasetWithTransaction(
			registration,
			async () => {
				await schemaBuilder.createCollection(
					collection_name,
					field_mappings,
					{
						displayName,
						hidden: true,
						note: registration.description,
					}
				);
			}
		);

		// 5. 导入数据（简化版，实际应该使用 ImportJobRunner）
		let successCount = 0;
		let failedCount = 0;

		for (const row of data) {
			try {
				await database(collection_name).insert(row);
				successCount++;
			} catch (error) {
				failedCount++;
				console.error(`Failed to insert row:`, error);
			}
		}

		// 6. 更新记录数量
		await registryService.updateRecordCount(collection_name, successCount);

		// 7. 根据导入结果更新状态
		if (failedCount === 0 && successCount > 0) {
			await registryService.updateDatasetStatus(
				collection_name,
				'active',
				req.context?.accountability?.user
			);
		}

		// 8. 返回完整结果
		return res.status(201).json({
			success: true,
			data: {
				dataset_id: dataset.id,
				collection_name,
				display_name,
				status: failedCount === 0 ? 'active' : 'draft',
				import_summary: {
					total_rows: data.length,
					success_rows: successCount,
					failed_rows: failedCount,
				},
			},
			message: '数据集创建并导入完成',
		});
	} catch (error) {
		console.error('Complete workflow failed:', error);
		return res.status(500).json({
			error: 'Import workflow failed',
			message: error instanceof Error ? error.message : 'Unknown error',
		});
	}
}

/**
 * 路由配置示例
 *
 * 在 routes.ts 中添加这些路由：
 *
 * import {
 *   handleExcelImport,
 *   handleDataImport,
 *   handleListDatasets,
 *   handleUpdateDatasetStatus,
 *   handleGetStatistics,
 *   handleDeleteDataset,
 *   handleCompleteImportWorkflow
 * } from './services/USAGE_EXAMPLES';
 *
 * export function registerRoutes(router: Router) {
 *   // 创建数据集
 *   router.post('/datasets', handleExcelImport);
 *
 *   // 导入数据
 *   router.post('/datasets/:collection_name/import', handleDataImport);
 *
 *   // 完整工作流
 *   router.post('/datasets/complete-import', handleCompleteImportWorkflow);
 *
 *   // 列出数据集
 *   router.get('/datasets', handleListDatasets);
 *
 *   // 更新状态
 *   router.patch('/datasets/:collection_name/status', handleUpdateDatasetStatus);
 *
 *   // 获取统计
 *   router.get('/datasets/statistics', handleGetStatistics);
 *
 *   // 删除数据集
 *   router.delete('/datasets/:collection_name', handleDeleteDataset);
 * }
 */
