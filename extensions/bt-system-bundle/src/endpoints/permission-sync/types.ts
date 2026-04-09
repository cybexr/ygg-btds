/**
 * 权限同步 API 相关的 TypeScript 类型定义
 */

/**
 * 权限动作类型（Directus 原生支持）
 */
export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'comment' | 'explain' | 'share';

/**
 * 权限模板类型
 */
export enum PermissionTemplate {
	/**
	 * ds-descriptor 完整 CRUD 权限
	 * 用于需要完全控制数据描述符的用户角色
	 */
	DESCRIPTOR_CRUD = 'ds-descriptor-crud',

	/**
	 * ds-reader 只读权限
	 * 用于只需要查看数据的用户角色
	 */
	READER_READ = 'ds-reader-read',
}

/**
 * 用户-库权限矩阵条目
 * 定义某个用户对某个库的具体权限
 */
export interface UserLibraryPermission {
	/**
	 * 用户 ID（对应 ds-users 表）
	 */
	user_id: string;

	/**
	 * Directus 角色 ID（对应 directus_roles.id）
	 * 启用权限同步时必须提供，不能再复用 user_id。
	 */
	role_id?: string | null;

	/**
	 * 库 ID（对应 ds-libraries 表）
	 */
	library_id: string;

	/**
	 * 权限模板
	 */
	template: PermissionTemplate;

	/**
	 * 是否启用
	 */
	enabled: boolean;

	/**
	 * 自定义权限配置（可选，覆盖模板默认值）
	 */
	custom_permissions?: Partial<PermissionConfig>;
}

/**
 * 权限配置
 * 定义具体的权限动作和字段访问控制
 */
export interface PermissionConfig {
	/**
	 * 权限动作列表
	 */
	actions: PermissionAction[];

	/**
	 * 允许访问的字段（null 表示全部字段）
	 */
	fields: string[] | null;

	/**
	 * 权限过滤规则（用于行级权限控制）
	 */
	permissions?: Record<string, any> | null;

	/**
	 * 验证规则
	 */
	validation?: Record<string, any> | null;

	/**
	 * 预设值
	 */
	presets?: Record<string, any> | null;
}

/**
 * Directus 原生权限对象
 */
export interface DirectusPermission {
	/**
	 * 权限 ID（自动生成）
	 */
	id?: number;

	/**
	 * 角色 ID（对应 directus_roles.id，null 表示管理员）
	 */
	role: string | null;

	/**
	 * 集合名称
	 */
	collection: string;

	/**
	 * 权限动作
	 */
	action: PermissionAction;

	/**
	 * 权限过滤规则
	 */
	permissions: Record<string, any> | null;

	/**
	 * 验证规则
	 */
	validation: Record<string, any> | null;

	/**
	 * 预设值
	 */
	presets: Record<string, any> | null;

	/**
	 * 允许访问的字段
	 */
	fields: string[] | null;

	/**
	 * 是否为系统权限
	 */
	system?: true;
}

/**
 * 权限同步请求
 */
export interface PermissionSyncRequest {
	/**
	 * 用户-库权限矩阵
	 */
	user_library_permissions: UserLibraryPermission[];

	/**
	 * 是否为预览模式（不实际写入数据库）
	 */
	preview?: boolean;

	/**
	 * 是否覆盖现有权限
	 */
	overwrite?: boolean;

	/**
	 * 需要同步的集合列表（null 表示同步所有相关集合）
	 */
	collections?: string[] | null;
}

/**
 * 权限预览结果
 */
export interface PermissionPreview {
	/**
	 * 将创建的权限列表
	 */
	permissions_to_create: DirectusPermission[];

	/**
	 * 将更新的权限列表
	 */
	permissions_to_update: DirectusPermission[];

	/**
	 * 将删除的权限列表
	 */
	permissions_to_delete: number[];

	/**
	 * 冲突信息
	 */
	conflicts: PermissionConflict[];

	/**
	 * 统计信息
	 */
	stats: PermissionStats;
}

/**
 * 权限冲突信息
 */
export interface PermissionConflict {
	/**
	 * 冲突的权限 ID
	 */
	permission_id: number;

	/**
	 * 冲突类型
	 */
	type: 'OVERLAP' | 'CONTRADICTION' | 'UNKNOWN';

	/**
	 * 冲突描述
	 */
	message: string;

	/**
	 * 当前权限配置
	 */
	current: DirectusPermission;

	/**
	 * 新权限配置
	 */
	proposed: DirectusPermission;
}

/**
 * 权限统计信息
 */
export interface PermissionStats {
	/**
	 * 涉及的用户数量
	 */
	users_count: number;

	/**
	 * 涉及的库数量
	 */
	libraries_count: number;

	/**
	 * 将创建的权限数量
	 */
	create_count: number;

	/**
	 * 将更新的权限数量
	 */
	update_count: number;

	/**
	 * 将删除的权限数量
	 */
	delete_count: number;

	/**
	 * 冲突数量
	 */
	conflict_count: number;
}

/**
 * 权限同步响应
 */
export interface PermissionSyncResponse {
	success: boolean;
	message: string;
	data?: {
		/**
		 * 创建的权限 ID 列表
		 */
		created_ids?: number[];

		/**
		 * 更新的权限 ID 列表
		 */
		updated_ids?: number[];

		/**
		 * 删除的权限 ID 列表
		 */
		deleted_ids?: number[];

		/**
		 * 统计信息
		 */
		stats: PermissionStats;
	};
	errors?: string[];
}

/**
 * 权限预览响应
 */
export interface PermissionPreviewResponse {
	success: boolean;
	data: PermissionPreview;
}

/**
 * 权限模板定义
 */
export interface PermissionTemplateDefinition {
	/**
	 * 模板名称
	 */
	name: PermissionTemplate;

	/**
	 * 模板描述
	 */
	description: string;

	/**
	 * 默认权限配置
	 */
	default_config: PermissionConfig;

	/**
	 * 适用的集合列表
	 */
	applicable_collections: string[];
}

/**
 * 权限验证错误
 */
export interface PermissionValidationError {
	field: string;
	message: string;
	code: string;
}

/**
 * API 错误响应
 */
export interface ApiErrorResponse {
	error: string;
	message: string;
	details?: string;
	errors?: PermissionValidationError[];
}
