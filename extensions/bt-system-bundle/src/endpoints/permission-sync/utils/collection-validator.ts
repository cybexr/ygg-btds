/**
 * 集合名称验证工具
 * 提供增强的安全性验证，防止路径穿越、注入和其他安全攻击
 */

/**
 * 集合名称验证结果
 */
export interface CollectionValidationResult {
	/** 是否通过验证 */
	isValid: boolean;
	/** 规范化的集合名称 */
	normalized: string;
	/** 经过安全处理的集合名称（URL 编码） */
	sanitized: string;
	/** 错误信息 */
	error: string;
	/** 错误代码 */
	errorCode?: string;
}

/**
 * 验证选项
 */
export interface CollectionValidatorOptions {
	/** 允许的集合白名单 */
	allowedCollections?: Set<string>;
	/** 是否允许系统集合（directus_ 前缀） */
	allowSystemCollections?: boolean;
	/** 最大长度限制 */
	maxLength?: number;
}

/**
 * Directus 系统集合前缀
 */
const SYSTEM_COLLECTION_PREFIX = 'directus_';

/**
 * 集合名称正则模式
 * - 必须以字母开头
 * - 只能包含字母、数字、下划线和连字符
 * - 最大长度 64 字符
 */
const COLLECTION_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/i;

/**
 * 路径穿越攻击模式
 */
const PATH_TRAVERSAL_PATTERNS = [
	'../',
	'..\\',
	'%2e%2e',
	'%2e%2e%2f',
	'%2e%2e%5c',
	'..%2f',
	'..%5c',
	'..%252f',
	'..%255c',
	'~/',
	'~\\',
];

/**
 * 常见的 SQL 注入模式
 */
const SQL_INJECTION_PATTERNS = [
	"'",
	'"',
	';',
	'--',
	'/*',
	'*/',
	'xp_',
	'drop ',
	'delete ',
	'insert ',
	'update ',
	'exec',
	'select',
	'union',
	'or 1=1',
	'or 1 = 1',
];

/**
 * XSS 攻击模式
 */
const XSS_PATTERNS = [
	'<script',
	'</script',
	'javascript:',
	'onerror=',
	'onload=',
	'onclick=',
];

/**
 * Null 字节注入
 */
const NULL_BYTE_PATTERN = /\0/;

/**
 * 危险字符集合
 */
const DANGEROUS_CHARS = ['<', '>', '&', '|', '$', '`', '\n', '\r', '\t'];

/**
 * 验证集合名称的安全性
 *
 * @param collection - 要验证的集合名称
 * @param options - 验证选项
 * @returns 验证结果
 *
 * @example
 * ```ts
 * // 基础验证
 * const result = validateCollection('my_data');
 *
 * // 带白名单验证
 * const options = {
 *   allowedCollections: new Set(['users', 'posts', 'comments'])
 * };
 * const result2 = validateCollection('users', options);
 *
 * // 允许系统集合
 * const result3 = validateCollection('directus_users', {
 *   allowSystemCollections: true
 * });
 * ```
 */
export function validateCollection(
	collection: string,
	options: CollectionValidatorOptions = {}
): CollectionValidationResult {
	const {
		allowedCollections,
		allowSystemCollections = false,
		maxLength = 64,
	} = options;

	// 规范化输入：去除首尾空格
	const normalized = collection.trim();

	// 1. 检查是否为空
	if (!normalized) {
		return {
			isValid: false,
			normalized: '',
			sanitized: '',
			error: '集合名称不能为空',
			errorCode: 'EMPTY_COLLECTION_NAME',
		};
	}

	// 2. 检查长度限制
	if (normalized.length > maxLength) {
		return {
			isValid: false,
			normalized,
			sanitized: '',
			error: `集合名称长度超过 ${maxLength} 字符限制`,
			errorCode: 'COLLECTION_NAME_TOO_LONG',
		};
	}

	// 3. 检查 null 字节注入
	if (NULL_BYTE_PATTERN.test(normalized)) {
		return {
			isValid: false,
			normalized,
			sanitized: '',
			error: '集合名称包含非法字符',
			errorCode: 'NULL_BYTE_DETECTED',
		};
	}

	// 4. 检查路径穿越攻击（包括多层编码）
	const lowerCollection = normalized.toLowerCase();
	for (const pattern of PATH_TRAVERSAL_PATTERNS) {
		if (lowerCollection.includes(pattern.toLowerCase())) {
			return {
				isValid: false,
				normalized,
				sanitized: '',
				error: '检测到路径穿越攻击',
				errorCode: 'PATH_TRAVERSAL_DETECTED',
			};
		}
	}

	// 检查多层编码的路径穿越（%25 开头）
	if (/%25[0-9a-f]{2}/i.test(lowerCollection)) {
		return {
			isValid: false,
			normalized,
			sanitized: '',
			error: '检测到路径穿越攻击',
			errorCode: 'PATH_TRAVERSAL_DETECTED',
		};
	}

	// 5. 检查 SQL 注入模式
	const lowerForSQL = normalized.toLowerCase();
	for (const pattern of SQL_INJECTION_PATTERNS) {
		if (lowerForSQL.includes(pattern.toLowerCase())) {
			return {
				isValid: false,
				normalized,
				sanitized: '',
				error: '检测到 SQL 注入尝试',
				errorCode: 'SQL_INJECTION_DETECTED',
			};
		}
	}

	// 6. 检查 XSS 攻击模式（在危险字符检查之前）
	for (const pattern of XSS_PATTERNS) {
		if (lowerCollection.includes(pattern.toLowerCase())) {
			return {
				isValid: false,
				normalized,
				sanitized: '',
				error: '检测到 XSS 攻击尝试',
				errorCode: 'XSS_DETECTED',
			};
		}
	}

	// 7. 检查危险字符（在 XSS 检查之后）
	const hasDangerousChar = DANGEROUS_CHARS.some(char => normalized.includes(char));
	if (hasDangerousChar) {
		return {
			isValid: false,
			normalized,
			sanitized: '',
			error: '集合名称包含危险字符',
			errorCode: 'DANGEROUS_CHAR_DETECTED',
		};
	}

	// 8. 检查系统集合保护
	if (!allowSystemCollections && lowerCollection.startsWith(SYSTEM_COLLECTION_PREFIX)) {
		return {
			isValid: false,
			normalized,
			sanitized: '',
			error: '不允许访问 Directus 系统集合',
			errorCode: 'SYSTEM_COLLECTION_BLOCKED',
		};
	}

	// 9. 检查集合名称格式
	if (!COLLECTION_NAME_PATTERN.test(normalized)) {
		return {
			isValid: false,
			normalized,
			sanitized: '',
			error: '集合名称格式无效。必须以字母开头，只能包含字母、数字、下划线和连字符',
			errorCode: 'INVALID_COLLECTION_FORMAT',
		};
	}

	// 10. 检查白名单（如果提供）
	if (allowedCollections && allowedCollections.size > 0) {
		if (!allowedCollections.has(normalized)) {
			return {
				isValid: false,
				normalized,
				sanitized: '',
				error: `集合 "${normalized}" 不在允许访问的列表中`,
				errorCode: 'COLLECTION_NOT_IN_WHITELIST',
			};
		}
	}

	// 所有检查通过，返回有效结果
	return {
		isValid: true,
		normalized,
		sanitized: encodeURIComponent(normalized),
		error: '',
	};
}

/**
 * 批量验证集合名称
 *
 * @param collections - 要验证的集合名称数组
 * @param options - 验证选项
 * @returns 验证结果数组
 *
 * @example
 * ```ts
 * const results = validateCollections(['users', 'posts', 'comments']);
 * const allValid = results.every(r => r.isValid);
 * ```
 */
export function validateCollections(
	collections: string[],
	options: CollectionValidatorOptions = {}
): CollectionValidationResult[] {
	return collections.map(collection => validateCollection(collection, options));
}

/**
 * 检查集合是否可访问（便捷方法）
 *
 * @param collection - 要检查的集合名称
 * @param options - 验证选项
 * @returns 是否可访问
 *
 * @example
 * ```ts
 * if (isCollectionAccessible('users')) {
 *   // 允许访问
 * }
 * ```
 */
export function isCollectionAccessible(
	collection: string,
	options: CollectionValidatorOptions = {}
): boolean {
	return validateCollection(collection, options).isValid;
}

/**
 * 过滤有效的集合名称
 *
 * @param collections - 要过滤的集合名称数组
 * @param options - 验证选项
 * @returns 有效的集合名称数组
 *
 * @example
 * ```ts
 * const validCollections = filterValidCollections(['users', '../admin', 'posts']);
 * // 结果: ['users', 'posts']
 * ```
 */
export function filterValidCollections(
	collections: string[],
	options: CollectionValidatorOptions = {}
): string[] {
	const results = validateCollections(collections, options);
	return collections.filter((_, index) => results[index].isValid);
}

/**
 * 创建预配置的验证器（适用于特定场景）
 *
 * @param baseOptions - 基础验证选项
 * @returns 验证函数
 *
 * @example
 * ```ts
 * const validator = createCollectionValidator({
 *   allowedCollections: new Set(['users', 'posts']),
 *   allowSystemCollections: false
 * });
 *
 * const result = validator('users'); // { isValid: true, ... }
 * ```
 */
export function createCollectionValidator(
	baseOptions: CollectionValidatorOptions = {}
): (collection: string) => CollectionValidationResult {
	return (collection: string) => validateCollection(collection, baseOptions);
}

/**
 * 验证并抛出错误的便捷方法
 *
 * @param collection - 要验证的集合名称
 * @param options - 验证选项
 * @throws {Error} 当验证失败时抛出错误
 * @returns 规范化的集合名称
 *
 * @example
 * ```ts
 * try {
 *   const name = validateCollectionOrThrow('users');
 *   // 使用 name
 * } catch (error) {
 *   // 处理验证错误
 * }
 * ```
 */
export function validateCollectionOrThrow(
	collection: string,
	options: CollectionValidatorOptions = {}
): string {
	const result = validateCollection(collection, options);
	if (!result.isValid) {
		const error = new Error(result.error);
		(error as any).errorCode = result.errorCode;
		(error as any).collection = collection;
		throw error;
	}
	return result.normalized;
}
