/**
 * Express 扩展类型定义
 * 为 Directus Endpoint 上下文添加类型支持
 */

import { SchemaOverview } from '@directus/types';
import { Knex } from 'knex';

/**
 * 用户信息接口
 * 定义请求上下文中的用户信息结构
 */
export interface UserInfo {
	/**
	 * 用户 ID
	 */
	id: string;

	/**
	 * 用户角色 ID
	 */
	role?: string | null;

	/**
	 * 用户邮箱
	 */
	email?: string;

	/**
	 * 用户名称
	 */
	name?: string;

	/**
	 * 是否为管理员
	 */
	admin?: boolean;
}

/**
 * 扩展的请求上下文
 * 包含 Directus 特定的上下文信息
 */
export interface RequestContext {
	/**
	 * 数据库模式概览
	 */
	schema?: SchemaOverview;

	/**
	 * 数据库连接实例
	 */
	database?: Knex;

	/**
	 * 问责信息（包含权限和用户信息）
	 */
	accountability?: {
		/**
		 * 用户 ID
		 */
		user?: string;

		/**
		 * 角色 ID
		 */
		role?: string | null;

		/**
		 * 是否为管理员
		 */
		admin?: boolean;

		/**
		 * 权限列表
		 */
		permissions?: string[];
	};

	/**
	 * 当前用户信息
	 */
	user?: UserInfo;
}

declare module 'express' {
	interface Request {
		/**
		 * Directus 请求上下文
		 */
		context?: RequestContext;
	}
}
