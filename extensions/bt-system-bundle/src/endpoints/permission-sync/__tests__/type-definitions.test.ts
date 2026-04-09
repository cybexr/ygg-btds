/**
 * 类型定义测试
 * 验证 Express 扩展类型是否正确工作
 */

import type { UserInfo, RequestContext } from '../express.d';
import { Request } from 'express';

describe('Express 类型扩展测试', () => {
	it('应该正确扩展 Request 类型', () => {
		// 创建一个符合扩展类型的 Request 对象
		const mockRequest = {
			context: {
				database: {} as any,
				schema: {} as any,
				accountability: {
					user: 'test-user-id',
					role: 'admin-role',
					admin: true,
					permissions: ['read', 'write'],
				},
				user: {
					id: 'test-user-id',
					role: 'admin-role',
					email: 'test@example.com',
					name: 'Test User',
					admin: true,
				},
			},
		} as Partial<Request>;

		// 验证类型正确性
		expect(mockRequest.context).toBeDefined();
		expect(mockRequest.context?.accountability?.user).toBe('test-user-id');
		expect(mockRequest.context?.user?.id).toBe('test-user-id');
	});

	it('应该支持缺失的可选字段', () => {
		const mockRequest = {
			context: {
				database: {} as any,
			},
		} as Partial<Request>;

		expect(mockRequest.context).toBeDefined();
		expect(mockRequest.context?.database).toBeDefined();
		expect(mockRequest.context?.accountability).toBeUndefined();
		expect(mockRequest.context?.user).toBeUndefined();
	});

	it('UserInfo 类型应该包含所有必需字段', () => {
		const userInfo: UserInfo = {
			id: 'user-123',
			role: 'role-456',
			email: 'user@example.com',
			name: 'User Name',
			admin: false,
		};

		expect(userInfo.id).toBe('user-123');
		expect(userInfo.role).toBe('role-456');
		expect(userInfo.email).toBe('user@example.com');
	});

	it('RequestContext 类型应该支持部分字段', () => {
		const context: RequestContext = {
			database: {} as any,
			accountability: {
				user: 'user-123',
				admin: false,
			},
		};

		expect(context.database).toBeDefined();
		expect(context.accountability?.user).toBe('user-123');
		expect(context.schema).toBeUndefined();
		expect(context.user).toBeUndefined();
	});
});
