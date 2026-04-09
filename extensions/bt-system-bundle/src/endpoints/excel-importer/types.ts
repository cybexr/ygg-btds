/**
 * Excel 导入相关的 TypeScript 类型定义
 */

/**
 * 字段类型枚举
 */
export enum FieldType {
	STRING = 'string',
	TEXT = 'text',
	INTEGER = 'integer',
	BIGINT = 'bigint',
	FLOAT = 'float',
	DECIMAL = 'decimal',
	BOOLEAN = 'boolean',
	DATETIME = 'datetime',
	DATE = 'date',
	TIME = 'time',
	JSON = 'json',
	UUID = 'uuid',
}

/**
 * 字段映射定义
 */
export interface FieldMapping {
	field_name: string; // 字段名称（英文字母、数字、下划线）
	display_name: string; // 显示名称（中文）
	type: FieldType; // 字段类型
	nullable: boolean; // 是否可为空
	primary_key: boolean; // 是否为主键
	unique: boolean; // 是否唯一
	default_value?: any; // 默认值
	max_length?: number; // 最大长度（字符串类型）
}

/**
 * Excel 解析结果
 */
export interface ExcelParseResult {
	file_name: string;
	sheet_count: number;
	sheets: SheetParseResult[];
}

/**
 * 工作表解析结果
 */
export interface SheetParseResult {
	sheet_name: string;
	row_count: number;
	column_count: number;
	headers: string[];
	fields: FieldMapping[];
	preview_data: Record<string, any>[];
}

/**
 * 任务状态
 */
export enum TaskStatus {
	PENDING = 'pending',
	PARSING = 'processing',
	PARSED = 'completed',
	CREATING_COLLECTION = 'creating_collection',
	COMPLETED = 'completed',
	FAILED = 'failed',
}

/**
 * 任务信息
 */
export interface TaskInfo {
	/**
	 * 任务标识符，格式为 excel_<uuid-v4>。
	 * UUID v4 使用 RFC 4122 标准格式（xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx），
	 * 由 crypto.randomUUID() 生成，确保密码学安全的随机性和唯一性。
	 */
	id: string;
	status: TaskStatus;
	created_at: string;
	updated_at: string;
	error?: string;
	file_name?: string;
	file_size?: number;
	parse_result?: ExcelParseResult;
	collection_name?: string;
	progress?: number; // 0-100
}

/**
 * 上传请求
 */
export interface UploadRequest {
	file: File;
}

/**
 * 上传响应
 */
export interface UploadResponse {
	success: boolean;
	/**
	 * 上传任务 ID，格式为 excel_<uuid-v4>。
	 * UUID v4 使用 RFC 4122 标准格式，由 crypto.randomUUID() 生成。
	 */
	task_id: string;
	message: string;
}

/**
 * 解析请求
 */
export interface ParseRequest {
	/**
	 * 待解析任务 ID，格式为 excel_<uuid-v4>。
	 * UUID v4 使用 RFC 4122 标准格式，由 crypto.randomUUID() 生成。
	 */
	task_id: string;
}

/**
 * 解析响应
 */
export interface ParseResponse {
	success: boolean;
	data: ExcelParseResult;
}

/**
 * 创建集合请求
 */
export interface CreateCollectionRequest {
	/**
	 * 已完成解析的任务 ID，格式为 excel_<uuid-v4>。
	 * UUID v4 使用 RFC 4122 标准格式，由 crypto.randomUUID() 生成。
	 */
	task_id: string;
	collection_name: string;
	field_mappings: FieldMapping[];
}

/**
 * 创建集合响应
 */
export interface CreateCollectionResponse {
	success: boolean;
	data: {
		collection_name: string;
		fields_created: number;
		data_imported?: number;
	};
	message: string;
}

/**
 * 任务状态响应
 */
export interface TaskStatusResponse {
	success: boolean;
	data: TaskInfo;
}

/**
 * API 错误响应
 */
export interface ApiErrorResponse {
	error: string;
	message: string;
	details?: string;
}
