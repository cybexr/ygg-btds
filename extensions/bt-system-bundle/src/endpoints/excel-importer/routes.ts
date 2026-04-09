import { Router, Request, Response } from 'express';
import { UploadedFile } from 'express-fileupload';
import { ExcelImportService } from '../../shared/services/excel-import-service';

const excelService = new ExcelImportService();

export function registerRoutes(router: Router): void {
	const BASE_PATH = '/custom/excel';

	// POST /custom/excel/upload - 上传 Excel 文件
	router.post(`${BASE_PATH}/upload`, async (req: Request, res: Response) => {
		try {
			if (!req.files || !req.files.file) {
				return res.status(400).json({
					error: 'FILE_MISSING',
					message: '未上传文件',
				});
			}

			const uploadedFile = req.files.file as UploadedFile;

			// 验证文件类型
			const allowedMimeTypes = [
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'application/vnd.ms-excel',
			];

			if (!allowedMimeTypes.includes(uploadedFile.mimetype)) {
				return res.status(400).json({
					error: 'INVALID_FILE_TYPE',
					message: '只支持 .xlsx 和 .xls 格式的 Excel 文件',
				});
			}

			// 验证文件大小（10MB 限制）
			const MAX_FILE_SIZE = 10 * 1024 * 1024;
			if (uploadedFile.size > MAX_FILE_SIZE) {
				return res.status(400).json({
					error: 'FILE_TOO_LARGE',
					message: '文件大小不能超过 10MB',
				});
			}

			// 创建上传任务
			const taskId = await excelService.createUploadTask(uploadedFile);

			res.json({
				success: true,
				task_id: taskId,
				message: '文件上传成功',
			});
		} catch (error) {
			console.error('Upload error:', error);
			res.status(500).json({
				error: 'UPLOAD_FAILED',
				message: '文件上传失败',
				details: error instanceof Error ? error.message : '未知错误',
			});
		}
	});

	// POST /custom/excel/parse - 解析表头和类型推断
	router.post(`${BASE_PATH}/parse`, async (req: Request, res: Response) => {
		try {
			const { task_id } = req.body;

			if (!task_id) {
				return res.status(400).json({
					error: 'MISSING_TASK_ID',
					message: '缺少任务 ID',
				});
			}

			// 获取任务并解析
			const parseResult = await excelService.parseExcelFile(task_id);

			res.json({
				success: true,
				data: parseResult,
			});
		} catch (error) {
			console.error('Parse error:', error);
			res.status(500).json({
				error: 'PARSE_FAILED',
				message: '文件解析失败',
				details: error instanceof Error ? error.message : '未知错误',
			});
		}
	});

	// POST /custom/excel/create-collection - 动态创建集合
	router.post(`${BASE_PATH}/create-collection`, async (req: Request, res: Response) => {
		try {
			const { task_id, collection_name, field_mappings } = req.body;

			if (!task_id || !collection_name || !field_mappings) {
				return res.status(400).json({
					error: 'MISSING_PARAMETERS',
					message: '缺少必要参数：task_id, collection_name, field_mappings',
				});
			}

			// 验证集合名称格式
			if (!/^[a-z][a-z0-9_]*$/.test(collection_name)) {
				return res.status(400).json({
					error: 'INVALID_COLLECTION_NAME',
					message: '集合名称必须以小写字母开头，只能包含小写字母、数字和下划线',
				});
			}

			// 创建集合
			const collectionResult = await excelService.createCollection(
				task_id,
				collection_name,
				field_mappings,
				req.context?.schema,
				req.context?.database
			);

			res.json({
				success: true,
				data: collectionResult,
				message: '集合创建成功',
			});
		} catch (error) {
			console.error('Create collection error:', error);
			res.status(500).json({
				error: 'CREATE_COLLECTION_FAILED',
				message: '集合创建失败',
				details: error instanceof Error ? error.message : '未知错误',
			});
		}
	});

	// GET /custom/excel/task/:id - 查询任务状态
	router.get(`${BASE_PATH}/task/:id`, async (req: Request, res: Response) => {
		try {
			const { id } = req.params;

			if (!id) {
				return res.status(400).json({
					error: 'MISSING_TASK_ID',
					message: '缺少任务 ID',
				});
			}

			// 获取任务状态
			const taskStatus = await excelService.getTaskStatus(id);

			if (!taskStatus) {
				return res.status(404).json({
					error: 'TASK_NOT_FOUND',
					message: '任务不存在',
				});
			}

			res.json({
				success: true,
				data: taskStatus,
			});
		} catch (error) {
			console.error('Get task status error:', error);
			res.status(500).json({
				error: 'GET_TASK_STATUS_FAILED',
				message: '获取任务状态失败',
				details: error instanceof Error ? error.message : '未知错误',
			});
		}
	});

	// POST /custom/excel/truncate/:collection_name - 清空数据集
	router.post(`${BASE_PATH}/truncate/:collection_name`, async (req: Request, res: Response) => {
		try {
			const { collection_name } = req.params;

			if (!collection_name) {
				return res.status(400).json({
					error: 'MISSING_COLLECTION_NAME',
					message: '缺少集合名称',
				});
			}

			// 检查权限 - 只有 ds-manager 可以清空数据集
			const user = req.accountability?.user;
			if (!user) {
				return res.status(401).json({
					error: 'UNAUTHORIZED',
					message: '未授权访问',
				});
			}

			// 获取用户角色
			const userRole = req.accountability?.role;
			const isAdmin = userRole === 'admin' || userRole === 1;
			const isDsManager = userRole === 'ds-manager';

			if (!isAdmin && !isDsManager) {
				return res.status(403).json({
					error: 'FORBIDDEN',
					message: '只有数据集管理员可以清空数据集',
				});
			}

			// 清空数据集
			await excelService.truncateDataset(collection_name, req.context?.database);

			// 更新注册表中的记录数
			await excelService.updateDatasetRecordCount(collection_name, 0, req.context?.database);

			res.json({
				success: true,
				message: '数据集已清空',
			});
		} catch (error) {
			console.error('Truncate dataset error:', error);
			res.status(500).json({
				error: 'TRUNCATE_FAILED',
				message: '清空数据集失败',
				details: error instanceof Error ? error.message : '未知错误',
			});
		}
	});

	// DELETE /custom/excel/dataset/:collection_name - 删除数据集
	router.delete(`${BASE_PATH}/dataset/:collection_name`, async (req: Request, res: Response) => {
		try {
			const { collection_name } = req.params;

			if (!collection_name) {
				return res.status(400).json({
					error: 'MISSING_COLLECTION_NAME',
					message: '缺少集合名称',
				});
			}

			// 检查权限 - 只有 ds-manager 可以删除数据集
			const user = req.accountability?.user;
			if (!user) {
				return res.status(401).json({
					error: 'UNAUTHORIZED',
					message: '未授权访问',
				});
			}

			// 获取用户角色
			const userRole = req.accountability?.role;
			const isAdmin = userRole === 'admin' || userRole === 1;
			const isDsManager = userRole === 'ds-manager';

			if (!isAdmin && !isDsManager) {
				return res.status(403).json({
					error: 'FORBIDDEN',
					message: '只有数据集管理员可以删除数据集',
				});
			}

			// 删除数据集（包括表结构和注册记录）
			await excelService.deleteDataset(collection_name, req.context?.schema, req.context?.database);

			res.json({
				success: true,
				message: '数据集已删除',
			});
		} catch (error) {
			console.error('Delete dataset error:', error);
			res.status(500).json({
				error: 'DELETE_FAILED',
				message: '删除数据集失败',
				details: error instanceof Error ? error.message : '未知错误',
			});
		}
	});
}
