/**
 * 类型推断服务 - 基于样本数据推断字段类型
 */

import { FieldType, FieldMapping } from '../types';

/**
 * 类型推断结果
 */
export interface TypeInferenceResult {
	type: FieldType;
	confidence: number; // 0-1 之间的置信度
	sample_count: number; // 用于推断的样本数量
	nullable: boolean; // 是否包含空值
	sample_values: any[]; // 样本值
}

/**
 * 类型推断配置
 */
export interface TypeInferenceConfig {
	max_sample_size?: number; // 最大样本数量
	strict_mode?: boolean; // 严格模式 - 更高的置信度要求
	confidence_threshold?: number; // 置信度阈值
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<TypeInferenceConfig> = {
	max_sample_size: 100,
	strict_mode: false,
	confidence_threshold: 0.7,
};

/**
 * 正则表达式模式
 */
const PATTERNS = {
	integer: /^-?\d+$/,
	decimal: /^-?\d+\.\d+$/,
	boolean: /^(true|false|是|否|yes|no|1|0)$/i,
	uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
	timestamp: /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/,
	time: /^\d{2}:\d{2}:\d{2}$/,
	date: /^\d{4}-\d{2}-\d{2}$/,
};

/**
 * 基于样本数据推断字段类型
 */
export function inferFieldType(
	values: any[],
	config: TypeInferenceConfig = {}
): TypeInferenceResult {
	// 参数验证
	if (!values || !Array.isArray(values)) {
		return {
			type: FieldType.STRING,
			confidence: 0,
			sample_count: 0,
			nullable: true,
			sample_values: [],
		};
	}

	const mergedConfig = { ...DEFAULT_CONFIG, ...config };

	// 验证配置参数
	if (mergedConfig.max_sample_size <= 0) {
		throw new Error('max_sample_size must be greater than 0');
	}

	if (mergedConfig.confidence_threshold < 0 || mergedConfig.confidence_threshold > 1) {
		throw new Error('confidence_threshold must be between 0 and 1');
	}

	// 过滤空值和无效值
	const validValues = values.filter(
		(v) => v !== null && v !== undefined && v !== ''
	);

	if (validValues.length === 0) {
		return {
			type: FieldType.STRING,
			confidence: 0,
			sample_count: 0,
			nullable: true,
			sample_values: [],
		};
	}

	// 限制样本数量
	const samples = validValues.slice(0, mergedConfig.max_sample_size);
	const nullable = validValues.length < values.length;

	// 尝试每种类型
	const typeScores = [
		inferBoolean(samples),
		inferInteger(samples),
		inferDecimal(samples),
		inferTimestamp(samples),
		inferTime(samples),
		inferDate(samples),
		inferUUID(samples),
		inferJSON(samples),
	];

	// 选择得分最高的类型
	let bestResult = typeScores[0];
	for (const result of typeScores) {
		if (result.confidence > bestResult.confidence) {
			bestResult = result;
		}
	}

	// 如果置信度低于阈值，默认为 string
	if (bestResult.confidence < mergedConfig.confidence_threshold) {
		return {
			type: FieldType.STRING,
			confidence: bestResult.confidence,
			sample_count: samples.length,
			nullable,
			sample_values: samples.slice(0, 5),
		};
	}

	return {
		...bestResult,
		sample_count: samples.length,
		nullable,
		sample_values: samples.slice(0, 5),
	};
}

/**
 * 推断布尔类型
 */
function inferBoolean(values: any[]): Omit<TypeInferenceResult, 'sample_count' | 'nullable' | 'sample_values'> {
	if (values.length === 0) {
		return { type: FieldType.BOOLEAN, confidence: 0 };
	}

	let matchCount = 0;

	for (const value of values) {
		// 跳过 null/undefined/空字符串
		if (value == null || value === '') {
			continue;
		}

		const strValue = String(value).trim().toLowerCase();
		if (PATTERNS.boolean.test(strValue)) {
			matchCount++;
		}
	}

	const confidence = values.length > 0 ? matchCount / values.length : 0;

	return {
		type: FieldType.BOOLEAN,
		confidence,
	};
}

/**
 * 推断整数类型
 */
function inferInteger(values: any[]): Omit<TypeInferenceResult, 'sample_count' | 'nullable' | 'sample_values'> {
	if (values.length === 0) {
		return { type: FieldType.INTEGER, confidence: 0 };
	}

	let matchCount = 0;

	for (const value of values) {
		// 跳过 null/undefined/空字符串
		if (value == null || value === '') {
			continue;
		}

		const strValue = String(value).trim();
		if (PATTERNS.integer.test(strValue)) {
			const num = parseInt(strValue, 10);
			// 检查是否在安全整数范围内
			if (Number.isSafeInteger(num)) {
				matchCount++;
			}
		}
	}

	const confidence = values.length > 0 ? matchCount / values.length : 0;

	return {
		type: FieldType.INTEGER,
		confidence,
	};
}

/**
 * 推断小数类型
 */
function inferDecimal(values: any[]): Omit<TypeInferenceResult, 'sample_count' | 'nullable' | 'sample_values'> {
	if (values.length === 0) {
		return { type: FieldType.FLOAT, confidence: 0 };
	}

	let matchCount = 0;
	let decimalMatchCount = 0;

	for (const value of values) {
		// 跳过 null/undefined/空字符串
		if (value == null || value === '') {
			continue;
		}

		const strValue = String(value).trim();
		if (PATTERNS.decimal.test(strValue)) {
			matchCount++;
			decimalMatchCount++;
		} else if (PATTERNS.integer.test(strValue)) {
			matchCount++;
		}
	}

	const confidence = values.length > 0 ? matchCount / values.length : 0;

	// 如果有小数点，使用 decimal，否则可能只是整数
	const type = decimalMatchCount > 0 ? FieldType.DECIMAL : FieldType.FLOAT;

	return {
		type,
		confidence,
	};
}

/**
 * 推断时间戳类型
 */
function inferTimestamp(values: any[]): Omit<TypeInferenceResult, 'sample_count' | 'nullable' | 'sample_values'> {
	if (values.length === 0) {
		return { type: FieldType.DATETIME, confidence: 0 };
	}

	let matchCount = 0;

	for (const value of values) {
		// 跳过 null/undefined/空字符串
		if (value == null || value === '') {
			continue;
		}

		const strValue = String(value).trim();
		if (PATTERNS.timestamp.test(strValue)) {
			// 验证是否是有效日期
			const date = new Date(strValue);
			if (!isNaN(date.getTime())) {
				matchCount++;
			}
		}
	}

	const confidence = values.length > 0 ? matchCount / values.length : 0;

	return {
		type: FieldType.DATETIME,
		confidence,
	};
}

/**
 * 推断时间类型
 */
function inferTime(values: any[]): Omit<TypeInferenceResult, 'sample_count' | 'nullable' | 'sample_values'> {
	if (values.length === 0) {
		return { type: FieldType.TIME, confidence: 0 };
	}

	let matchCount = 0;

	for (const value of values) {
		// 跳过 null/undefined/空字符串
		if (value == null || value === '') {
			continue;
		}

		const strValue = String(value).trim();
		if (PATTERNS.time.test(strValue)) {
			matchCount++;
		}
	}

	const confidence = values.length > 0 ? matchCount / values.length : 0;

	return {
		type: FieldType.TIME,
		confidence,
	};
}

/**
 * 推断日期类型
 */
function inferDate(values: any[]): Omit<TypeInferenceResult, 'sample_count' | 'nullable' | 'sample_values'> {
	if (values.length === 0) {
		return { type: FieldType.DATE, confidence: 0 };
	}

	let matchCount = 0;

	for (const value of values) {
		// 跳过 null/undefined/空字符串
		if (value == null || value === '') {
			continue;
		}

		const strValue = String(value).trim();
		if (PATTERNS.date.test(strValue)) {
			const date = new Date(strValue);
			if (!isNaN(date.getTime())) {
				matchCount++;
			}
		}
	}

	const confidence = values.length > 0 ? matchCount / values.length : 0;

	return {
		type: FieldType.DATE,
		confidence,
	};
}

/**
 * 推断 UUID 类型
 */
function inferUUID(values: any[]): Omit<TypeInferenceResult, 'sample_count' | 'nullable' | 'sample_values'> {
	if (values.length === 0) {
		return { type: FieldType.UUID, confidence: 0 };
	}

	let matchCount = 0;

	for (const value of values) {
		// 跳过 null/undefined/空字符串
		if (value == null || value === '') {
			continue;
		}

		const strValue = String(value).trim();
		if (PATTERNS.uuid.test(strValue)) {
			matchCount++;
		}
	}

	const confidence = values.length > 0 ? matchCount / values.length : 0;

	return {
		type: FieldType.UUID,
		confidence,
	};
}

/**
 * 推断 JSON 类型
 */
function inferJSON(values: any[]): Omit<TypeInferenceResult, 'sample_count' | 'nullable' | 'sample_values'> {
	if (values.length === 0) {
		return { type: FieldType.JSON, confidence: 0 };
	}

	let matchCount = 0;

	for (const value of values) {
		// 跳过 null/undefined/空字符串
		if (value == null || value === '') {
			continue;
		}

		const strValue = String(value).trim();
		if ((strValue.startsWith('{') && strValue.endsWith('}')) ||
			(strValue.startsWith('[') && strValue.endsWith(']'))) {
			try {
				JSON.parse(strValue);
				matchCount++;
			} catch {
				// 不是有效的 JSON
			}
		}
	}

	const confidence = values.length > 0 ? matchCount / values.length : 0;

	return {
		type: FieldType.JSON,
		confidence,
	};
}

/**
 * 基于表头和样本数据创建字段映射
 */
export function createFieldMappings(
	headers: string[],
	data: Record<string, any>[],
	config: TypeInferenceConfig = {}
): FieldMapping[] {
	// 参数验证
	if (!headers || headers.length === 0) {
		return [];
	}

	if (!data || !Array.isArray(data)) {
		return [];
	}

	const mergedConfig = { ...DEFAULT_CONFIG, ...config };

	return headers.map((header, index) => {
		// 跳过空表头
		if (!header || header.trim() === '') {
			return {
				field_name: `column_${index}`,
				display_name: `Column ${index}`,
				type: FieldType.STRING,
				nullable: true,
				primary_key: false,
				unique: false,
				default_value: undefined,
				max_length: 255,
			};
		}

		// 提取该列的所有值
		const columnValues = data.map((row) => row[header]);

		// 推断类型
		const inference = inferFieldType(columnValues, config);

		// 生成字段名（英文）
		const fieldName = generateFieldName(header);

		return {
			field_name: fieldName,
			display_name: header,
			type: inference.type,
			nullable: inference.nullable,
			primary_key: index === 0, // 默认第一列为主键
			unique: index === 0,
			default_value: undefined,
			max_length: inference.type === FieldType.STRING ? 255 : undefined,
		};
	});
}

/**
 * 生成英文字段名
 */
function generateFieldName(displayName: string): string {
	// 参数验证
	if (!displayName) {
		return `column_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	// 移除特殊字符，只保留字母、数字和下划线
	let fieldName = displayName
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '_')
		.replace(/_{2,}/g, '_')
		.replace(/^_|_$/g, '');

	// 如果是中文，进行拼音转换（简化版，实际应该使用拼音库）
	if (/[\u4e00-\u9fa5]/.test(fieldName)) {
		// 这里简化处理，实际应该使用 pinyin 库
		fieldName = `field_${Buffer.from(fieldName).toString('base64').substr(0, 8)}`;
	}

	// 确保不以数字开头
	if (/^\d/.test(fieldName)) {
		fieldName = `field_${fieldName}`;
	}

	// 如果为空，使用默认值
	if (!fieldName || fieldName === '_') {
		fieldName = `column_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	// 确保字段名长度合理（PostgreSQL 限制为 63 字符）
	if (fieldName.length > 63) {
		fieldName = fieldName.substr(0, 60) + '...';
	}

	return fieldName;
}

/**
 * 人工调整字段映射
 */
export function adjustFieldMapping(
	mapping: FieldMapping,
	adjustments: Partial<FieldMapping>
): FieldMapping {
	// 参数验证
	if (!mapping) {
		throw new Error('mapping is required');
	}

	if (!adjustments) {
		return mapping;
	}

	return {
		...mapping,
		...adjustments,
	};
}

/**
 * 批量调整字段映射
 */
export function adjustFieldMappings(
	mappings: FieldMapping[],
	adjustments: Partial<FieldMapping>[]
): FieldMapping[] {
	// 参数验证
	if (!mappings || !Array.isArray(mappings)) {
		return [];
	}

	if (!adjustments || !Array.isArray(adjustments)) {
		return mappings;
	}

	return mappings.map((mapping, index) =>
		adjustments[index] ? adjustFieldMapping(mapping, adjustments[index]) : mapping
	);
}
