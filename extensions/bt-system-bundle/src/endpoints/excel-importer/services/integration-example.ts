/**
 * ImportJobRunner 集成示例
 * 展示如何在 Excel 导入 API 中使用 ImportJobRunner
 */

import { ImportJobRunner, ImportJobStatus, type BatchDataItem } from './import-job-runner';
import { Router, Request, Response } from 'express';
import { Knex } from 'knex';

/**
 * 创建导入路由
 */
export function createImportRoutes(database: Knex): Router {
	const router = Router();
	const runner = new ImportJobRunner(database, 3); // 最多 3 个并发任务

	// POST /custom/import/start - 启动导入任务
	router.post('/start', async (req: Request, res: Response) => {
		try {
			const {
				file_name,
				total_rows,
				collection_name,
				data,
				batch_size = 1000,
				user_id,
			} = req.body;

			// 验证必要参数
			if (!file_name || !total_rows || !collection_name || !data) {
				return res.status(400).json({
					success: false,
					error: '缺少必要参数: file_name, total_rows, collection_name, data',
				});
			}

			// 创建导入任务
			const config = {
				jobIdentifier: `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				sourceFileName: file_name,
				fileSizeBytes: JSON.stringify(data).length,
				totalRows: total_rows,
				batchSize: batch_size,
				createdUserId: user_id,
			};

			const jobId = await runner.createImportJob(config);

			// 准备批处理数据
			const batchData: BatchDataItem[] = data.map((row: any, index: number) => ({
				row_number: index + 1,
				data: row,
			}));

			// 启动异步导入任务
			setImmediate(async () => {
				try {
					const result = await runner.startImportJob(
						jobId,
						batchData,
						collection_name,
						async (progress) => {
							// 进度回调 - 可以通过 WebSocket 或其他机制通知客户端
							console.log(`任务 ${jobId} 进度: ${progress.progress}%`);
							// 这里可以添加实时通知逻辑
						}
					);

					console.log(`任务 ${jobId} 完成:`, result);
				} catch (error) {
					console.error(`任务 ${jobId} 失败:`, error);
				}
			});

			res.json({
				success: true,
				data: {
					job_id: jobId,
					message: '导入任务已启动',
				},
			});
		} catch (error) {
			console.error('启动导入任务失败:', error);
			res.status(500).json({
				success: false,
				error: '启动导入任务失败',
				details: error instanceof Error ? error.message : '未知错误',
			});
		}
	});

	// GET /custom/import/progress/:jobId - 获取任务进度
	router.get('/progress/:jobId', async (req: Request, res: Response) => {
		try {
			const { jobId } = req.params;
			const progress = await runner.getJobProgress(parseInt(jobId));

			res.json({
				success: true,
				data: progress,
			});
		} catch (error) {
			console.error('获取任务进度失败:', error);
			res.status(500).json({
				success: false,
				error: '获取任务进度失败',
				details: error instanceof Error ? error.message : '未知错误',
			});
		}
	});

	// POST /custom/import/pause/:jobId - 暂停任务
	router.post('/pause/:jobId', async (req: Request, res: Response) => {
		try {
			const { jobId } = req.params;
			await runner.pauseJob(parseInt(jobId));

			res.json({
				success: true,
				message: '任务已暂停',
			});
		} catch (error) {
			console.error('暂停任务失败:', error);
			res.status(500).json({
				success: false,
				error: '暂停任务失败',
				details: error instanceof Error ? error.message : '未知错误',
			});
		}
	});

	// POST /custom/import/resume/:jobId - 恢复任务
	router.post('/resume/:jobId', async (req: Request, res: Response) => {
		try {
			const { jobId } = req.params;
			const { collection_name, data } = req.body;

			if (!collection_name || !data) {
				return res.status(400).json({
					success: false,
					error: '缺少必要参数: collection_name, data',
				});
			}

			const batchData: BatchDataItem[] = data.map((row: any, index: number) => ({
				row_number: index + 1,
				data: row,
			}));

			const result = await runner.resumeJob(
				parseInt(jobId),
				batchData,
				collection_name,
				async (progress) => {
					console.log(`任务 ${jobId} 恢复后进度: ${progress.progress}%`);
				}
			);

			res.json({
				success: true,
				data: result,
				message: '任务已恢复并完成',
			});
		} catch (error) {
			console.error('恢复任务失败:', error);
			res.status(500).json({
				success: false,
				error: '恢复任务失败',
				details: error instanceof Error ? error.message : '未知错误',
			});
		}
	});

	// POST /custom/import/cancel/:jobId - 取消任务
	router.post('/cancel/:jobId', async (req: Request, res: Response) => {
		try {
			const { jobId } = req.params;
			await runner.cancelJob(parseInt(jobId));

			res.json({
				success: true,
				message: '任务已取消',
			});
		} catch (error) {
			console.error('取消任务失败:', error);
			res.status(500).json({
				success: false,
				error: '取消任务失败',
				details: error instanceof Error ? error.message : '未知错误',
			});
		}
	});

	// GET /custom/import/status - 获取系统状态
	router.get('/status', (req: Request, res: Response) => {
		const activeCount = runner.getActiveJobCount();
		const queueLength = runner.getQueueLength();

		res.json({
			success: true,
			data: {
				active_jobs: activeCount,
				queued_jobs: queueLength,
				max_concurrent_jobs: 3,
			},
		});
	});

	// GET /custom/import/errors/:jobId - 获取任务错误详情
	router.get('/errors/:jobId', async (req: Request, res: Response) => {
		try {
			const { jobId } = req.params;
			const { limit = 100, severity } = req.query;

			let query = database('bt_import_errors')
				.where('import_job_id', parseInt(jobId))
				.orderBy('created_at', 'desc')
				.limit(parseInt(limit as string));

			if (severity) {
				query = query.where('severity', severity);
			}

			const errors = await query;

			res.json({
				success: true,
				data: errors,
			});
		} catch (error) {
			console.error('获取错误详情失败:', error);
			res.status(500).json({
				success: false,
				error: '获取错误详情失败',
				details: error instanceof Error ? error.message : '未知错误',
			});
		}
	});

	return router;
}

/**
 * 在现有路由中集成 ImportJobRunner
 */
export function integrateImportRunner(router: Router, database: Knex): void {
	const runner = new ImportJobRunner(database, 3);

	// 中间件：将 runner 注入到请求上下文
	router.use((req: any, res: any, next: any) => {
		req.importRunner = runner;
		next();
	});

	// 可以在现有路由中使用 req.importRunner
}

/**
 * Express 扩展类型定义
 */
declare module 'express' {
	interface Request {
		importRunner?: ImportJobRunner;
	}
}
