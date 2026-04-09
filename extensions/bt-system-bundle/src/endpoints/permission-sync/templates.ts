/**
 * 权限模板定义
 * 定义预配置的权限模板，用于快速应用权限配置
 */

import {
	PermissionTemplate,
	PermissionTemplateDefinition,
	PermissionAction,
} from './types';

/**
 * 权限模板注册表
 */
export const PERMISSION_TEMPLATES: Record<PermissionTemplate, PermissionTemplateDefinition> = {
	/**
	 * ds-descriptor 完整 CRUD 权限模板
	 * 适用于需要完全控制数据描述符的用户角色
	 */
	[PermissionTemplate.DESCRIPTOR_CRUD]: {
		name: PermissionTemplate.DESCRIPTOR_CRUD,
		description: '数据描述符完整 CRUD 权限，适用于需要完全控制数据描述符的用户',
		default_config: {
			actions: ['create', 'read', 'update', 'delete'],
			fields: null, // null 表示允许访问所有字段
			permissions: null,
			validation: null,
			presets: null,
		},
		applicable_collections: [
			'ds-descriptors',
			'ds-descriptor-revisions',
			'ds-descriptor-tags',
			'ds-descriptor-relationships',
		],
	},

	/**
	 * ds-reader 只读权限模板
	 * 适用于只需要查看数据的用户角色
	 */
	[PermissionTemplate.READER_READ]: {
		name: PermissionTemplate.READER_READ,
		description: '数据只读权限，仅允许查看数据，不允许修改',
		default_config: {
			actions: ['read'],
			fields: null, // null 表示允许访问所有字段
			permissions: {
				// 只允许查看已发布的数据
				status: {
					_eq: 'published',
				},
			},
			validation: null,
			presets: null,
		},
		applicable_collections: [
			'ds-descriptors',
			'ds-descriptor-revisions',
			'ds-descriptor-tags',
			'ds-descriptor-relationships',
		],
	},
};

/**
 * 获取权限模板定义
 */
export function getPermissionTemplate(template: PermissionTemplate): PermissionTemplateDefinition {
	const definition = PERMISSION_TEMPLATES[template];
	if (!definition) {
		throw new Error(`未知的权限模板: ${template}`);
	}
	return definition;
}

/**
 * 获取所有可用的权限模板
 */
export function getAllPermissionTemplates(): PermissionTemplateDefinition[] {
	return Object.values(PERMISSION_TEMPLATES);
}

/**
 * 验证权限模板是否适用于指定的集合
 */
export function isTemplateApplicableToCollection(
	template: PermissionTemplate,
	collection: string
): boolean {
	const definition = getPermissionTemplate(template);
	return definition.applicable_collections.includes(collection);
}

/**
 * 获取权限模板适用的所有集合
 */
export function getTemplateCollections(template: PermissionTemplate): string[] {
	const definition = getPermissionTemplate(template);
	return definition.applicable_collections;
}
