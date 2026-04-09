import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionTemplate } from '../types';

const { mockPermissionSyncService } = vi.hoisted(() => ({
	mockPermissionSyncService: {
		syncPermissions: vi.fn(),
		previewPermissions: vi.fn(),
	},
}));

vi.mock('../permission-sync-service', () => ({
	PermissionSyncService: vi.fn(() => mockPermissionSyncService),
}));

type RouteHandler = (req: any, res: any) => Promise<any>;

function createMockRouter() {
	const routes = {
		post: new Map<string, RouteHandler>(),
		get: new Map<string, RouteHandler>(),
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
	};

	return { router, routes };
}

function createMockResponse() {
	return {
		status: vi.fn().mockReturnThis(),
		json: vi.fn().mockReturnThis(),
	};
}

function createValidRequest() {
	return {
		user_library_permissions: [
			{
				user_id: 'user-1',
				library_id: 'lib-1',
				template: PermissionTemplate.READER_READ,
				enabled: true,
			},
		],
	};
}

describe('Permission Sync API Security', () => {
	let routes: ReturnType<typeof createMockRouter>['routes'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const { registerRoutes } = await import('../routes');
		const mockRouter = createMockRouter();
		routes = mockRouter.routes;
		registerRoutes(mockRouter.router as any);

		mockPermissionSyncService.syncPermissions.mockResolvedValue({
			created_ids: [1],
			updated_ids: [],
			deleted_ids: [],
			stats: { created: 1, updated: 0, deleted: 0 },
		});
		mockPermissionSyncService.previewPermissions.mockResolvedValue({
			permissions_to_create: [],
			permissions_to_update: [],
			permissions_to_delete: [],
			conflicts: [],
			stats: { created: 0, updated: 0, deleted: 0 },
		});
	});

	it('应该注册权限同步相关路由', () => {
		expect(routes.post.has('/custom/permissions/sync')).toBe(true);
		expect(routes.get.has('/custom/permissions/preview')).toBe(true);
		expect(routes.post.has('/custom/permissions/preview')).toBe(true);
		expect(routes.get.has('/custom/permissions/current')).toBe(true);
	});

	it('应该拒绝非数组的权限同步请求体', async () => {
		const handler = routes.post.get('/custom/permissions/sync')!;
		const res = createMockResponse();

		await handler({ body: {}, context: { database: {} } }, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ error: 'VALIDATION_ERROR' })
		);
	});

	it('应该返回缺失字段和类型错误', async () => {
		const handler = routes.post.get('/custom/permissions/sync')!;
		const res = createMockResponse();

		await handler(
			{
				body: {
					user_library_permissions: [{ library_id: '', enabled: 'yes' }],
				},
				context: { database: {} },
			},
			res
		);

		expect(res.status).toHaveBeenCalledWith(400);
		const jsonCall = res.json.mock.calls[0];
		expect(jsonCall).toBeDefined();
		const payload = jsonCall?.[0];
		expect(payload?.errors).toBeDefined();
		expect(payload.errors.length).toBeGreaterThan(0);
	});

	it('应该在数据库不可用时阻止同步', async () => {
		const handler = routes.post.get('/custom/permissions/sync')!;
		const res = createMockResponse();

		await handler({ body: createValidRequest(), context: {} }, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ error: 'DATABASE_NOT_AVAILABLE' })
		);
	});

	it('应该在 GET 预览收到损坏 JSON 时返回失败', async () => {
		const handler = routes.get.get('/custom/permissions/preview')!;
		const res = createMockResponse();

		await handler(
			{
				query: {
					data: '{"user_library_permissions": [',
				},
				context: { database: {} },
			},
			res
		);

		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('应该在 GET 预览收到非法结构时返回验证错误', async () => {
		const handler = routes.get.get('/custom/permissions/preview')!;
		const res = createMockResponse();

		await handler(
			{
				query: {
					data: JSON.stringify({ user_library_permissions: 'bad' }),
				},
				context: { database: {} },
			},
			res
		);

		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('应该在 POST 预览收到非法结构时返回验证错误', async () => {
		const handler = routes.post.get('/custom/permissions/preview')!;
		const res = createMockResponse();

		await handler(
			{
				body: {
					user_library_permissions: [{ user_id: 'user-1', enabled: true }],
				},
				context: { database: {} },
			},
			res
		);

		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('应该在当前权限查询缺少数据库时返回错误', async () => {
		const handler = routes.get.get('/custom/permissions/current')!;
		const res = createMockResponse();

		await handler({ context: {} }, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ error: 'DATABASE_NOT_AVAILABLE' })
		);
	});
});
