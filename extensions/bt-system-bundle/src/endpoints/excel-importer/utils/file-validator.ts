import type { UploadedFile } from 'express-fileupload';

const ZIP_SIGNATURES = [
	Buffer.from([0x50, 0x4b, 0x03, 0x04]),
	Buffer.from([0x50, 0x4b, 0x05, 0x06]),
	Buffer.from([0x50, 0x4b, 0x07, 0x08]),
];
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
const ZIP_END_OF_CENTRAL_DIRECTORY = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const MAX_FILE_NAME_LENGTH = 120;

export type SupportedExcelFileType = 'xlsx' | 'xls';

export interface FileValidationIssue {
	code: string;
	message: string;
}

export interface FileValidationOptions {
	maxFileSizeBytes?: number;
}

export interface FileValidationResult {
	valid: boolean;
	fileType?: SupportedExcelFileType;
	sanitizedFileName: string;
	issues: FileValidationIssue[];
	metadata: {
		hasMacros: boolean;
		hasExternalReferences: boolean;
		fileSize: number;
	};
}

type FileLike = Pick<UploadedFile, 'name' | 'size' | 'data'>;

export function sanitizeFileName(fileName: string): string {
	const normalized = fileName
		.replace(/\\/g, '/')
		.split('/')
		.pop()
		?.replace(/[^a-zA-Z0-9._-]/g, '_')
		.replace(/_+/g, '_')
		.slice(0, MAX_FILE_NAME_LENGTH) || 'upload.xlsx';

	return normalized.replace(/^\.+/, '') || 'upload.xlsx';
}

export function checkFileMagicNumber(
	buffer: Buffer,
	fileType: SupportedExcelFileType
): boolean {
	if (fileType === 'xlsx') {
		return ZIP_SIGNATURES.some((signature) => buffer.subarray(0, 4).equals(signature));
	}

	return buffer.subarray(0, 4).equals(OLE_SIGNATURE);
}

export function validateZipStructure(buffer: Buffer): {
	valid: boolean;
	hasMacros: boolean;
	hasExternalReferences: boolean;
} {
	const rawText = buffer.toString('latin1');
	const hasZipHeader = ZIP_SIGNATURES.some((signature) => buffer.includes(signature));
	const hasEndOfDirectory = buffer.includes(ZIP_END_OF_CENTRAL_DIRECTORY);
	const hasWorkbookEntries =
		rawText.includes('[Content_Types].xml') && rawText.includes('xl/workbook.xml');
	const hasPathTraversal =
		rawText.includes('../') ||
		rawText.includes('..\\') ||
		rawText.includes('/../') ||
		rawText.includes(':/');

	return {
		valid: hasZipHeader && hasEndOfDirectory && hasWorkbookEntries && !hasPathTraversal,
		hasMacros: rawText.includes('xl/vbaProject.bin'),
		hasExternalReferences:
			rawText.includes('externalLink') ||
			rawText.includes('http://') ||
			rawText.includes('https://'),
	};
}

export async function validateExcelFile(
	file: FileLike,
	options: FileValidationOptions = {}
): Promise<FileValidationResult> {
	const issues: FileValidationIssue[] = [];
	const sanitizedFileName = sanitizeFileName(file.name);
	const extension = sanitizedFileName.toLowerCase().split('.').pop();
	const fileType =
		extension === 'xlsx' || extension === 'xls'
			? extension
			: undefined;

	if (!fileType) {
		issues.push({
			code: 'INVALID_FILE_TYPE',
			message: '只支持 .xlsx 和 .xls 格式的 Excel 文件',
		});
	}

	if (options.maxFileSizeBytes && file.size > options.maxFileSizeBytes) {
		issues.push({
			code: 'FILE_TOO_LARGE',
			message: `文件大小不能超过 ${Math.floor(options.maxFileSizeBytes / (1024 * 1024))}MB`,
		});
	}

	if (!Buffer.isBuffer(file.data) || file.data.length === 0) {
		issues.push({
			code: 'INVALID_FILE_CONTENT',
			message: '文件内容为空或不可读取',
		});
	}

	if (!fileType || issues.length > 0) {
		return {
			valid: false,
			sanitizedFileName,
			issues,
			metadata: {
				hasMacros: false,
				hasExternalReferences: false,
				fileSize: file.size,
			},
		};
	}

	if (!checkFileMagicNumber(file.data, fileType)) {
		issues.push({
			code: 'INVALID_FILE_SIGNATURE',
			message: '文件内容与扩展名不匹配',
		});
	}

	let hasMacros = false;
	let hasExternalReferences = false;
	if (fileType === 'xlsx') {
		const zipValidation = validateZipStructure(file.data);
		hasMacros = zipValidation.hasMacros;
		hasExternalReferences = zipValidation.hasExternalReferences;

		if (!zipValidation.valid) {
			issues.push({
				code: 'INVALID_STRUCTURE',
				message: 'Excel 文件结构无效或包含危险路径',
			});
		}

		if (hasMacros) {
			issues.push({
				code: 'MACRO_DETECTED',
				message: '文件包含宏，已被拒绝',
			});
		}

		if (hasExternalReferences) {
			issues.push({
				code: 'EXTERNAL_REFERENCE_DETECTED',
				message: '文件包含外部引用，已被拒绝',
			});
		}
	}

	return {
		valid: issues.length === 0,
		fileType,
		sanitizedFileName,
		issues,
		metadata: {
			hasMacros,
			hasExternalReferences,
			fileSize: file.size,
		},
	};
}
