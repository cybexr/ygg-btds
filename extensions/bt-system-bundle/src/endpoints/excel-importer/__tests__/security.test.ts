import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExcelService } = vi.hoisted(() => ({
	mockExcelService: {
		createUploadTask: vi.fn(),
		parseExcelFile: vi.fn(),
		createCollection: vi.fn(),
		getTaskStatus: vi.fn(),
		truncateDataset: vi.fn(),
		updateDatasetRecordCount: vi.fn(),
		deleteDataset: vi.fn(),
	},
}));

vi.mock('../../../shared/services/excel-import-service', () => ({
	ExcelImportService: vi.fn(() => mockExcelService),
}));

type RouteHandler = (req: any, res: any) => Promise<any>;

function createMockRouter() {
	const routes = {
		post: new Map<string, RouteHandler>(),
		get: new Map<string, RouteHandler>(),
		delete: new Map<string, RouteHandler>(),
	};

	const router = {
		post: vi.fn((path: string, handler: RouteHandler) => {
			routes.post.set(path, handler);
			return router;
		}),
		get: vi.fn((path: string, handler: RouteHandler) => {
			routes.get.set(path, handler);
			return router;
		}),
		delete: vi.fn((path: string, handler: RouteHandler) => {
			routes.delete.set(path, handler);
			return router;
		}),
	};

	return { router, routes };
}

function createMockResponse() {
	return {
		status: vi.fn().mockReturnThis(),
		json: vi.fn().mockReturnThis(),
	};
}

describe('Excel Import API Security', () => {
	let routes: ReturnType<typeof createMockRouter>['routes'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const { registerRoutes } = await import('../routes');
		const mockRouter = createMockRouter();
		routes = mockRouter.routes;
		registerRoutes(mockRouter.router as any);

		mockExcelService.createUploadTask.mockResolvedValue('task-123');
		mockExcelService.truncateDataset.mockResolvedValue(undefined);
		mockExcelService.updateDatasetRecordCount.mockResolvedValue(undefined);
		mockExcelService.deleteDataset.mockResolvedValue(undefined);
	});

	it('应该注册关键安全相关路由', () => {
		expect(routes.post.has('/custom/excel/upload')).toBe(true);
		expect(routes.post.has('/custom/excel/truncate/:collection_name')).toBe(true);
		expect(routes.delete.has('/custom/excel/dataset/:collection_name')).toBe(true);
	});

	it('应该拒绝未上传文件的请求', async () => {
		const handler = routes.post.get('/custom/excel/upload')!;
		const res = createMockResponse();

		await handler({ files: {} }, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ error: 'FILE_MISSING' })
		);
	});

	it('应该拒绝伪装成 Excel 的非法 MIME 类型', async () => {
		const handler = routes.post.get('/custom/excel/upload')!;
		const res = createMockResponse();

		await handler(
			{
				files: {
					file: {
						mimetype: 'application/x-msdownload',
						size: 1024,
						name: 'payload.xlsx',
					},
				},
			},
			res
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ error: 'INVALID_FILE_TYPE' })
		);
		expect(mockExcelService.createUploadTask).not.toHaveBeenCalled();
	});

	it('应该拒绝超过 10MB 的大文件', async () => {
		const handler = routes.post.get('/custom/excel/upload')!;
		const res = createMockResponse();

		await handler(
			{
				files: {
					file: {
						mimetype:
							'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
						size: 10 * 1024 * 1024 + 1,
						name: 'oversize.xlsx',
					},
				},
			},
			res
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ error: 'FILE_TOO_LARGE' })
		);
	});

	it('应该接受合法的 Excel 上传请求', async () => {
		const handler = routes.post.get('/custom/excel/upload')!;
		const res = createMockResponse();
		const file = {
			mimetype: 'application/vnd.ms-excel',
			size: 2048,
			name: 'safe.xls',
		};

		await handler({ files: { file } }, res);

		expect(mockExcelService.createUploadTask).toHaveBeenCalledWith(file);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ success: true, task_id: 'task-123' })
		);
	});

	it('应该阻止非法集合名创建请求', async () => {
		const handler = routes.post.get('/custom/excel/create-collection')!;
		const res = createMockResponse();

		await handler(
			{
				body: {
					task_id: 'task-123',
					collection_name: '../users',
					field_mappings: [{ field_name: 'name' }],
				},
				context: {},
			},
			res
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ error: 'INVALID_COLLECTION_NAME' })
		);
	});

	it('应该拒绝未登录用户清空数据集', async () => {
		const handler = routes.post.get('/custom/excel/truncate/:collection_name')!;
		const res = createMockResponse();

		await handler({ params: { collection_name: 'bt_demo' } }, res);

		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ error: 'UNAUTHORIZED' })
		);
	});

	it('应该拒绝普通用户清空数据集', async () => {
		const handler = routes.post.get('/custom/excel/truncate/:collection_name')!;
		const res = createMockResponse();

		await handler(
			{
				params: { collection_name: 'bt_demo' },
				accountability: { user: 'user-1', role: 'reader' },
				context: { database: {} },
			},
			res
		);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(mockExcelService.truncateDataset).not.toHaveBeenCalled();
	});

	it('应该允许 ds-manager 清空数据集', async () => {
		const handler = routes.post.get('/custom/excel/truncate/:collection_name')!;
		const res = createMockResponse();

		await handler(
			{
				params: { collection_name: 'bt_demo' },
				accountability: { user: 'manager-1', role: 'ds-manager' },
				context: { database: { client: 'mock-db' } },
			},
			res
		);

		expect(mockExcelService.truncateDataset).toHaveBeenCalledWith(
			'bt_demo',
			expect.anything()
		);
		expect(mockExcelService.updateDatasetRecordCount).toHaveBeenCalledWith(
			'bt_demo',
			0,
			expect.anything()
		);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ success: true })
		);
	});

	it('应该允许管理员删除数据集', async () => {
		const handler = routes.delete.get('/custom/excel/dataset/:collection_name')!;
		const res = createMockResponse();

		await handler(
			{
				params: { collection_name: 'bt_demo' },
				accountability: { user: 'admin-1', role: 1 },
				context: { schema: {}, database: {} },
			},
			res
		);

		expect(mockExcelService.deleteDataset).toHaveBeenCalledWith(
			'bt_demo',
			expect.anything(),
			expect.anything()
		);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ success: true })
		);
	});

	it('应该阻止伪造角色名称绕过删除权限检查', async () => {
		const handler = routes.delete.get('/custom/excel/dataset/:collection_name')!;
		const res = createMockResponse();

		await handler(
			{
				params: { collection_name: 'bt_demo' },
				accountability: { user: 'attacker', role: 'ds-manager;admin' },
				context: { schema: {}, database: {} },
			},
			res
		);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(mockExcelService.deleteDataset).not.toHaveBeenCalled();
	});
});
