/**
 * Express 扩展类型定义
 * 为 Directus Endpoint 上下文添加类型支持
 */

import { SchemaOverview } from '@directus/types';
import { Knex } from 'knex';

declare module 'express' {
	interface Request {
		context?: {
			schema?: SchemaOverview;
			database?: Knex;
			accountability?: any;
		};
	}
}
