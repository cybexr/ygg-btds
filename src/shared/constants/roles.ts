/**
 * 角色常量定义
 * 定义系统中所有角色的标识符和层级关系
 */

/**
 * 系统角色标识符
 * 与 Directus 角色系统对应
 */
export enum SystemRole {
	/** 系统管理员 */
	ADMIN = 'admin',
	/** 数据集管理员 */
	DS_MANAGER = 'ds-manager',
	/** 数据集编辑者 */
	DS_EDITOR = 'ds-editor',
	/** 数据集查看者 */
	DATASET_VIEWER = 'dataset-viewer',
	/** 公共访问者 */
	PUBLIC = 'public',
}

/**
 * 角色层级定义
 * 数值越大，权限越高
 */
export const ROLE_HIERARCHY: Record<SystemRole, number> = {
	[SystemRole.PUBLIC]: 0,
	[SystemRole.DATASET_VIEWER]: 1,
	[SystemRole.DS_EDITOR]: 2,
	[SystemRole.DS_MANAGER]: 3,
	[SystemRole.ADMIN]: 4,
};

/**
 * 角色显示名称映射
 */
export const ROLE_NAMES: Record<SystemRole, string> = {
	[SystemRole.ADMIN]: '系统管理员',
	[SystemRole.DS_MANAGER]: '数据集管理员',
	[SystemRole.DS_EDITOR]: '数据集编辑者',
	[SystemRole.DATASET_VIEWER]: '数据集查看者',
	[SystemRole.PUBLIC]: '访客',
};

/**
 * 权限操作标识符
 */
export enum PermissionAction {
	/** 创建集合 */
	CREATE_COLLECTION = 'create_collection',
	/** 读取集合 */
	READ_COLLECTION = 'read_collection',
	/** 更新集合 */
	UPDATE_COLLECTION = 'update_collection',
	/** 删除集合 */
	DELETE_COLLECTION = 'delete_collection',
	/** 清空数据集 */
	TRUNCATE_DATASET = 'truncate_dataset',
	/** 上传文件 */
	UPLOAD_FILE = 'upload_file',
	/** 解析文件 */
	PARSE_FILE = 'parse_file',
	/** 导入数据 */
	IMPORT_DATA = 'import_data',
}

/**
 * 数据集管理权限矩阵
 * 定义每个角色可以执行的操作
 */
export const DATASET_PERMISSIONS: Record<SystemRole, PermissionAction[]> = {
	[SystemRole.ADMIN]: [
		PermissionAction.CREATE_COLLECTION,
		PermissionAction.READ_COLLECTION,
		PermissionAction.UPDATE_COLLECTION,
		PermissionAction.DELETE_COLLECTION,
		PermissionAction.TRUNCATE_DATASET,
		PermissionAction.UPLOAD_FILE,
		PermissionAction.PARSE_FILE,
		PermissionAction.IMPORT_DATA,
	],
	[SystemRole.DS_MANAGER]: [
		PermissionAction.CREATE_COLLECTION,
		PermissionAction.READ_COLLECTION,
		PermissionAction.UPDATE_COLLECTION,
		PermissionAction.DELETE_COLLECTION,
		PermissionAction.TRUNCATE_DATASET,
		PermissionAction.UPLOAD_FILE,
		PermissionAction.PARSE_FILE,
		PermissionAction.IMPORT_DATA,
	],
	[SystemRole.DS_EDITOR]: [
		PermissionAction.READ_COLLECTION,
		PermissionAction.UPLOAD_FILE,
		PermissionAction.PARSE_FILE,
		PermissionAction.IMPORT_DATA,
	],
	[SystemRole.DATASET_VIEWER]: [
		PermissionAction.READ_COLLECTION,
	],
	[SystemRole.PUBLIC]: [],
};

/**
 * 检查角色是否有效
 */
export function isValidRole(role: string): role is SystemRole {
	return Object.values(SystemRole).includes(role as SystemRole);
}

/**
 * 获取角色层级级别
 */
export function getRoleLevel(role: SystemRole): number {
	return ROLE_HIERARCHY[role] ?? 0;
}

/**
 * 检查角色是否具有指定权限
 */
export function roleHasPermission(role: SystemRole, action: PermissionAction): boolean {
	return DATASET_PERMISSIONS[role]?.includes(action) ?? false;
}

/**
 * 检查角色级别是否满足最低要求
 */
export function meetsRoleRequirement(userRole: SystemRole, requiredRole: SystemRole): boolean {
	return getRoleLevel(userRole) >= getRoleLevel(requiredRole);
}
