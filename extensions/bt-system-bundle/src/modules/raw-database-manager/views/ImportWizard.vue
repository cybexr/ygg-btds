<template>
	<div class="import-wizard">
		<private-view title="Excel 导入向导">
			<template #title>
				<v-icon large name="upload" />
				<span>Excel 导入向导</span>
			</template>

			<template #actions>
				<v-button v-tooltip="'取消导入'" rounded icon @click="handleCancel">
					<v-icon name="close" />
				</v-button>
			</template>

			<div class="wizard-content">
				<!-- 步骤指示器 -->
				<div class="step-indicator">
					<div
						v-for="(step, index) in steps"
						:key="index"
						class="step-item"
						:class="{
							active: currentStep === index,
							completed: currentStep > index,
						}"
					>
						<div class="step-number">
							<v-icon v-if="currentStep > index" name="check" />
							<span v-else>{{ index + 1 }}</span>
						</div>
						<div class="step-label">{{ step.label }}</div>
					</div>
				</div>

				<!-- 步骤内容 -->
				<div class="step-content">
					<!-- 步骤 1: 文件选择 -->
					<div v-if="currentStep === 0" class="step-file-upload">
						<v-info title="上传 Excel 文件" type="info" center>
							支持 .xlsx 和 .xls 格式，文件大小不超过 10MB
						</v-info>

						<div
							class="upload-zone"
							:class="{ dragging: isDragging }"
							@drop.prevent="handleDrop"
		                	@dragover.prevent="isDragging = true"
		                	@dragleave.prevent="isDragging = false"
						>
							<v-icon name="cloud_upload" large />
							<p class="upload-text">拖拽文件到此处或点击上传</p>
							<v-button @click="triggerFileInput">选择文件</v-button>
							<input
								ref="fileInput"
								type="file"
								accept=".xlsx,.xls"
								style="display: none"
								@change="handleFileSelect"
							/>
						</div>

						<div v-if="selectedFile" class="file-info">
							<v-icon name="description" />
							<span class="file-name">{{ selectedFile.name }}</span>
							<span class="file-size">({{ formatFileSize(selectedFile.size) }})</span>
							<v-button icon rounded x-small @click="clearFile">
								<v-icon name="close" />
							</v-button>
						</div>

						<v-notice v-if="uploadError" type="danger">
							{{ uploadError }}
						</v-notice>
					</div>

					<!-- 步骤 2: 字段映射 -->
					<div v-if="currentStep === 1" class="step-field-mapping">
						<v-info title="字段映射配置" type="info" center>
							系统已自动推断字段类型，您可以进行调整
						</v-info>

						<div class="mapping-content">
							<div class="collection-name-section">
								<label class="field-label">集合名称</label>
								<input
									v-model="collectionName"
									class="collection-input"
									placeholder="请输入集合名称（小写字母开头，仅支持小写字母、数字和下划线）"
									@input="validateCollectionName"
								/>
								<v-notice v-if="collectionNameError" type="danger" class="notice-inline">
									{{ collectionNameError }}
								</v-notice>
							</div>

							<div v-if="parseResult?.fields" class="fields-table">
								<div class="table-header">
									<div class="header-cell">Excel 列名</div>
									<div class="header-cell">推断类型</div>
									<div class="header-cell">目标字段名</div>
									<div class="header-cell">操作</div>
								</div>
								<div
									v-for="(field, index) in parseResult.fields"
									:key="index"
									class="table-row"
								>
									<div class="cell excel-column">{{ field.excel_column }}</div>
									<div class="cell inferred-type">
										{{ getInferredTypeLabel(field.inferred_type) }}
									</div>
									<div class="cell target-field">
										<input
											v-model="field.target_field"
											class="field-input"
											placeholder="字段名"
										/>
									</div>
									<div class="cell actions">
										<v-button
											v-tooltip="field.include ? '排除此字段' : '包含此字段'"
											rounded
											:x-small="true"
											:class="{ active: field.include }"
											@click="toggleFieldInclude(field)"
										>
											<v-icon :name="field.include ? 'check_box' : 'check_box_outline_blank'" />
										</v-button>
									</div>
								</div>
							</div>
						</div>
					</div>

					<!-- 步骤 3: 导入进度 -->
					<div v-if="currentStep === 2" class="step-import-progress">
						<v-info title="导入进度" type="info" center>
							正在处理您的数据，请稍候...
						</v-info>

						<div class="progress-content">
							<div class="progress-status">
								<v-icon
									:name="getTaskStatusIcon(taskStatus?.status)"
									large
									:class="taskStatus?.status"
								/>
								<h3>{{ getTaskStatusLabel(taskStatus?.status) }}</h3>
							</div>

							<v-progress
								v-if="taskStatus?.status === 'processing'"
								:value="progressValue"
								:indeterminate="isProgressIndeterminate"
							/>

							<div v-if="taskStatus?.status === 'processing'" class="progress-summary">
								<div class="progress-percentage">{{ progressPercentage }}</div>
								<div class="progress-text">{{ progressText }}</div>
								<div class="estimated-time">预计剩余时间：{{ estimatedTimeRemaining }}</div>
							</div>

							<div class="progress-stats">
								<div class="stat-item">
									<span class="stat-label">总记录数</span>
									<span class="stat-value">{{ taskStatus?.total || 0 }}</span>
								</div>
								<div class="stat-item">
									<span class="stat-label">已处理</span>
									<span class="stat-value">{{ taskStatus?.processed || 0 }}</span>
								</div>
								<div class="stat-item">
									<span class="stat-label">成功</span>
									<span class="stat-value success">{{ taskStatus?.success || 0 }}</span>
								</div>
								<div class="stat-item">
									<span class="stat-label">失败</span>
									<span class="stat-value error">{{ taskStatus?.failed || 0 }}</span>
								</div>
							</div>

							<div v-if="taskStatus?.logs?.length" class="progress-logs">
								<h4>处理日志</h4>
								<div class="logs-container">
									<div
										v-for="(log, index) in taskStatus.logs.slice(-10)"
										:key="index"
										class="log-entry"
										:class="log.level"
									>
										<span class="log-time">{{ formatTime(log.timestamp) }}</span>
										<span class="log-message">{{ log.message }}</span>
									</div>
								</div>
							</div>
						</div>
					</div>

					<!-- 步骤 4: 结果确认 -->
					<div v-if="currentStep === 3" class="step-result-confirmation">
						<div :class="['result-header', taskStatus?.status || 'unknown']">
							<v-icon :name="getResultIcon(taskStatus?.status)" large />
							<h2>{{ getResultTitle(taskStatus?.status) }}</h2>
							<p>{{ getResultMessage(taskStatus?.status) }}</p>
						</div>

						<div class="result-summary">
							<h3>导入摘要</h3>
							<div class="summary-grid">
								<div class="summary-item">
									<span class="summary-label">集合名称</span>
									<span class="summary-value">{{ collectionName }}</span>
								</div>
								<div class="summary-item">
									<span class="summary-label">总记录数</span>
									<span class="summary-value">{{ taskStatus?.total || 0 }}</span>
								</div>
								<div class="summary-item">
									<span class="summary-label">成功导入</span>
									<span class="summary-value success">{{ taskStatus?.success || 0 }}</span>
								</div>
								<div class="summary-item">
									<span class="summary-label">导入失败</span>
									<span class="summary-value error">{{ taskStatus?.failed || 0 }}</span>
								</div>
								<div class="summary-item">
									<span class="summary-label">处理时间</span>
									<span class="summary-value">{{ formatDuration(taskStatus?.duration) }}</span>
								</div>
							</div>
						</div>

						<div v-if="taskStatus?.errors?.length" class="result-errors">
							<h3>错误列表 ({{ taskStatus.errors.length }})</h3>
							<div class="errors-container">
								<div
									v-for="(error, index) in taskStatus.errors.slice(0, 20)"
									:key="index"
									class="error-entry"
								>
									<v-icon name="error" class="error-icon" />
									<div class="error-content">
										<div class="error-row">行 {{ error.row }}</div>
										<div class="error-message">{{ error.message }}</div>
										<div v-if="error.field" class="error-field">字段: {{ error.field }}</div>
									</div>
								</div>
								<v-notice v-if="taskStatus.errors.length > 20" type="warning">
									仅显示前 20 条错误，共 {{ taskStatus.errors.length }} 条
								</v-notice>
							</div>
						</div>
					</div>
				</div>

				<!-- 步骤导航按钮 -->
				<div class="wizard-actions">
					<v-button
						v-if="currentStep > 0"
						@click="handlePrevious"
						:disabled="isProcessing"
					>
						上一步
					</v-button>
					<v-button
						v-if="currentStep < steps.length - 1"
						@click="handleNext"
						:disabled="!canProceed || isProcessing"
						:loading="isProcessing"
					>
						{{ nextButtonText }}
					</v-button>
					<v-button
						v-if="currentStep === steps.length - 1"
						@click="handleComplete"
						:disabled="isProcessing"
					>
						完成
					</v-button>
				</div>
			</div>
		</private-view>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import {
	getProgressPercentage,
	getProgressValue,
	getProgressText,
	isProgressIndeterminate as getIsProgressIndeterminate,
	getEstimatedTimeRemaining,
} from './import-progress';

const emit = defineEmits<{
	(e: 'close'): void;
}>();

interface WizardStep {
	label: string;
}

interface FieldMapping {
	excel_column: string;
	inferred_type: string;
	target_field: string;
	include: boolean;
}

interface ParseResult {
	fields: FieldMapping[];
	row_count: number;
	sheet_name: string;
}

interface TaskStatus {
	id: string;
	status: 'pending' | 'processing' | 'completed' | 'failed';
	progress?: number;
	total: number;
	processed: number;
	success: number;
	failed: number;
	logs?: Array<{
		timestamp: string;
		level: 'info' | 'warning' | 'error';
		message: string;
	}>;
	errors?: Array<{
		row: number;
		field: string;
		message: string;
	}>;
	duration?: number;
}

const api = useApi();

// 步骤定义
const steps: WizardStep[] = [
	{ label: '文件选择' },
	{ label: '字段映射' },
	{ label: '导入进度' },
	{ label: '结果确认' },
];

// 状态管理
const currentStep = ref(0);
const isProcessing = ref(false);
const selectedFile = ref<File | null>(null);
const isDragging = ref(false);
const uploadError = ref('');
const taskId = ref('');
const parseResult = ref<ParseResult | null>(null);
const collectionName = ref('');
const collectionNameError = ref('');
const taskStatus = ref<TaskStatus | null>(null);
const pollingInterval = ref<NodeJS.Timeout | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const taskStartTime = ref<number | null>(null);
const lastProgressUpdateAt = ref<number | null>(null);

// 计算属性
const canProceed = computed(() => {
	switch (currentStep.value) {
		case 0:
			return selectedFile.value !== null && !uploadError.value;
		case 1:
			return (
				!collectionNameError.value &&
				collectionName.value.trim() !== '' &&
				parseResult.value?.fields?.some((f) => f.include)
			);
		case 2:
			return taskStatus.value?.status === 'completed' || taskStatus.value?.status === 'failed';
		case 3:
			return true;
		default:
			return false;
	}
});

const nextButtonText = computed(() => {
	switch (currentStep.value) {
		case 0:
			return '上传并解析';
		case 1:
			return '开始导入';
		case 2:
			return '查看结果';
		default:
			return '下一步';
	}
});

const progressPercentage = computed(() => {
	return getProgressPercentage(taskStatus.value);
});

const progressValue = computed(() => getProgressValue(taskStatus.value));

const isProgressIndeterminate = computed(() => {
	return getIsProgressIndeterminate(taskStatus.value);
});

const progressText = computed(() => {
	return getProgressText(taskStatus.value);
});

const estimatedTimeRemaining = computed(() => {
	return getEstimatedTimeRemaining(taskStatus.value, taskStartTime.value, lastProgressUpdateAt.value);
});

// 文件处理
const triggerFileInput = () => {
	fileInput.value?.click();
};

const handleFileSelect = (event: Event) => {
	const target = event.target as HTMLInputElement;
	const file = target.files?.[0];
	if (file) {
		validateAndSetFile(file);
	}
};

const handleDrop = (event: DragEvent) => {
	isDragging.value = false;
	const file = event.dataTransfer?.files[0];
	if (file) {
		validateAndSetFile(file);
	}
};

const validateAndSetFile = (file: File) => {
	uploadError.value = '';

	const validExtensions = ['.xlsx', '.xls'];
	const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

	if (!validExtensions.includes(fileExtension)) {
		uploadError.value = '只支持 .xlsx 和 .xls 格式的 Excel 文件';
		return;
	}

	const maxSize = 10 * 1024 * 1024;
	if (file.size > maxSize) {
		uploadError.value = '文件大小不能超过 10MB';
		return;
	}

	selectedFile.value = file;
};

const clearFile = () => {
	selectedFile.value = null;
	uploadError.value = '';
	if (fileInput.value) {
		fileInput.value.value = '';
	}
};

const formatFileSize = (bytes: number): string => {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

// 步骤导航
const handleNext = async () => {
	if (!canProceed.value) return;

	isProcessing.value = true;

	try {
		switch (currentStep.value) {
			case 0:
				await uploadFile();
				break;
			case 1:
				await startImport();
				break;
			case 2:
				currentStep.value++;
				break;
		}
	} catch (error) {
		console.error('Step error:', error);
		uploadError.value = error instanceof Error ? error.message : '操作失败';
	} finally {
		isProcessing.value = false;
	}
};

const handlePrevious = () => {
	if (currentStep.value > 0) {
		currentStep.value--;
	}
};

const handleCancel = () => {
	if (pollingInterval.value) {
		clearInterval(pollingInterval.value);
	}
	emit('close');
};

const handleComplete = () => {
	emit('close');
};

// API 调用
const uploadFile = async () => {
	const formData = new FormData();
	formData.append('file', selectedFile.value as File);

	const response = await api.post(`/custom/excel/upload`, formData);

	if (response.data.success) {
		taskId.value = response.data.task_id;
		await parseFile();
	} else {
		throw new Error(response.data.message || '上传失败');
	}
};

const parseFile = async () => {
	const response = await api.post(`/custom/excel/parse`, {
		task_id: taskId.value,
	});

	if (response.data.success) {
		parseResult.value = response.data.data;
		// 自动生成集合名称和目标字段名
		generateDefaultMappings();
		currentStep.value++;
	} else {
		throw new Error(response.data.message || '解析失败');
	}
};

const generateDefaultMappings = () => {
	if (!parseResult.value?.fields) return;

	// 生成集合名称
	const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
	collectionName.value = `import_${timestamp}`;

	// 生成目标字段名
	parseResult.value.fields.forEach((field) => {
		if (!field.target_field) {
			field.target_field = field.excel_column
				.toLowerCase()
				.replace(/\s+/g, '_')
				.replace(/[^a-z0-9_]/g, '')
				.replace(/^[0-9_]/, 'field_$&');
		}
		field.include = true;
	});
};

const startImport = async () => {
	const fieldMappings = parseResult.value?.fields
		?.filter((f) => f.include)
		.map((f) => ({
			excel_column: f.excel_column,
			target_field: f.target_field,
			data_type: f.inferred_type,
		}));

	const response = await api.post(`/custom/excel/create-collection`, {
		task_id: taskId.value,
		collection_name: collectionName.value,
		field_mappings: fieldMappings,
	});

	if (response.data.success) {
		currentStep.value++;
		startPolling();
	} else {
		throw new Error(response.data.message || '创建集合失败');
	}
};

// 状态轮询
const startPolling = () => {
	taskStartTime.value = Date.now();
	lastProgressUpdateAt.value = taskStartTime.value;
	pollTaskStatus();
	pollingInterval.value = setInterval(pollTaskStatus, 2000);
};

const pollTaskStatus = async () => {
	try {
		const response = await api.get(`/custom/excel/task/${taskId.value}`);

		if (response.data.success) {
			taskStatus.value = response.data.data;
			lastProgressUpdateAt.value = Date.now();

			if (
				taskStatus.value.status === 'completed' ||
				taskStatus.value.status === 'failed'
			) {
				if (pollingInterval.value) {
					clearInterval(pollingInterval.value);
					pollingInterval.value = null;
				}
				// 自动跳转到结果页面
				setTimeout(() => {
					if (currentStep.value === 2) {
						currentStep.value = 3;
					}
				}, 1000);
			}
		}
	} catch (error) {
		console.error('Polling error:', error);
	}
};

// 验证
const validateCollectionName = () => {
	collectionNameError.value = '';

	if (!collectionName.value) {
		collectionNameError.value = '请输入集合名称';
		return;
	}

	if (!/^[a-z][a-z0-9_]*$/.test(collectionName.value)) {
		collectionNameError.value = '集合名称必须以小写字母开头，只能包含小写字母、数字和下划线';
		return;
	}

	if (collectionName.value.length < 3) {
		collectionNameError.value = '集合名称至少需要 3 个字符';
		return;
	}

	if (collectionName.value.length > 64) {
		collectionNameError.value = '集合名称不能超过 64 个字符';
	}
};

const toggleFieldInclude = (field: FieldMapping) => {
	field.include = !field.include;
};

// 辅助函数
const getInferredTypeLabel = (type: string): string => {
	const typeLabels: Record<string, string> = {
		string: '文本',
		number: '数字',
		date: '日期',
		boolean: '布尔值',
	};
	return typeLabels[type] || type;
};

const getTaskStatusIcon = (status?: string): string => {
	const icons: Record<string, string> = {
		pending: 'schedule',
		processing: 'sync',
		completed: 'check_circle',
		failed: 'error',
	};
	return icons[status || 'pending'] || 'info';
};

const getTaskStatusLabel = (status?: string): string => {
	const labels: Record<string, string> = {
		pending: '等待中',
		processing: '处理中',
		completed: '已完成',
		failed: '失败',
	};
	return labels[status || 'pending'] || '未知';
};

const getResultIcon = (status?: string): string => {
	const icons: Record<string, string> = {
		completed: 'check_circle',
		failed: 'error',
	};
	return icons[status || 'completed'] || 'info';
};

const getResultTitle = (status?: string): string => {
	const titles: Record<string, string> = {
		completed: '导入成功',
		failed: '导入失败',
	};
	return titles[status || 'completed'] || '导入完成';
};

const getResultMessage = (status?: string): string => {
	const messages: Record<string, string> = {
		completed: '您的数据已成功导入到系统中',
		failed: '导入过程中遇到错误，请检查错误列表后重试',
	};
	return messages[status || 'completed'] || '导入完成';
};

const formatTime = (timestamp: string): string => {
	const date = new Date(timestamp);
	return date.toLocaleTimeString('zh-CN', { hour12: false });
};

const formatDuration = (milliseconds?: number): string => {
	if (!milliseconds) return '-';
	const seconds = Math.floor(milliseconds / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) {
		return `${hours}小时${minutes % 60}分钟`;
	} else if (minutes > 0) {
		return `${minutes}分钟${seconds % 60}秒`;
	} else {
		return `${seconds}秒`;
	}
};

// 生命周期
onUnmounted(() => {
	if (pollingInterval.value) {
		clearInterval(pollingInterval.value);
	}
});
</script>

<style scoped>
.import-wizard {
	height: 100%;
}

.wizard-content {
	display: flex;
	flex-direction: column;
	height: calc(100vh - 120px);
}

/* 步骤指示器 */
.step-indicator {
	display: flex;
	justify-content: center;
	padding: 24px;
	border-bottom: 1px solid var(--theme--border-color);
	background: var(--theme--background);
}

.step-item {
	display: flex;
	flex-direction: column;
	align-items: center;
	position: relative;
	flex: 1;
	max-width: 200px;
}

.step-item:not(:last-child)::after {
	content: '';
	position: absolute;
	top: 20px;
	left: 60%;
	width: 80%;
	height: 2px;
	background: var(--theme--border-color);
	z-index: 0;
}

.step-item.completed:not(:last-child)::after {
	background: var(--theme--primary);
}

.step-number {
	width: 40px;
	height: 40px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--theme--background-subdued);
	border: 2px solid var(--theme--border-color);
	color: var(--theme--foreground-subdued);
	font-weight: 600;
	z-index: 1;
	transition: all 0.3s ease;
}

.step-item.active .step-number {
	background: var(--theme--primary);
	border-color: var(--theme--primary);
	color: var(--theme--primary-background);
}

.step-item.completed .step-number {
	background: var(--theme--primary);
	border-color: var(--theme--primary);
	color: var(--theme--primary-background);
}

.step-label {
	margin-top: 8px;
	font-size: 12px;
	color: var(--theme--foreground-subdued);
	text-align: center;
}

.step-item.active .step-label {
	color: var(--theme--primary);
	font-weight: 600;
}

/* 步骤内容 */
.step-content {
	flex: 1;
	overflow-y: auto;
	padding: 24px;
	background: var(--theme--background-subdued);
}

/* 文件上传 */
.upload-zone {
	border: 2px dashed var(--theme--border-color);
	border-radius: 8px;
	padding: 48px;
	text-align: center;
	background: var(--theme--background);
	transition: all 0.3s ease;
	cursor: pointer;
	margin-top: 24px;
}

.upload-zone:hover,
.upload-zone.dragging {
	border-color: var(--theme--primary);
	background: var(--theme--primary-subdued);
}

.upload-zone .v-icon {
	font-size: 48px;
	color: var(--theme--foreground-subdued);
	margin-bottom: 16px;
}

.upload-text {
	font-size: 16px;
	color: var(--theme--foreground-subdued);
	margin: 16px 0 24px;
}

.file-info {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 16px;
	background: var(--theme--background);
	border-radius: 8px;
	margin-top: 24px;
}

.file-name {
	flex: 1;
	font-weight: 500;
}

.file-size {
	color: var(--theme--foreground-subdued);
	font-size: 14px;
}

/* 字段映射 */
.mapping-content {
	background: var(--theme--background);
	border-radius: 8px;
	padding: 24px;
	margin-top: 24px;
}

.collection-name-section {
	margin-bottom: 24px;
}

.field-label {
	display: block;
	font-weight: 600;
	margin-bottom: 8px;
	color: var(--theme--foreground);
}

.collection-input {
	width: 100%;
	padding: 12px;
	border: 1px solid var(--theme--border-color);
	border-radius: 4px;
	background: var(--theme--background-subdued);
	color: var(--theme--foreground);
	font-size: 14px;
}

.collection-input:focus {
	outline: none;
	border-color: var(--theme--primary);
}

.notice-inline {
	margin-top: 8px;
}

.fields-table {
	border: 1px solid var(--theme--border-color);
	border-radius: 4px;
	overflow: hidden;
}

.table-header {
	display: grid;
	grid-template-columns: 1fr 1fr 1fr 80px;
	background: var(--theme--background-subdued);
	border-bottom: 1px solid var(--theme--border-color);
	font-weight: 600;
}

.header-cell {
	padding: 12px;
	text-align: left;
	border-right: 1px solid var(--theme--border-color);
}

.header-cell:last-child {
	border-right: none;
}

.table-row {
	display: grid;
	grid-template-columns: 1fr 1fr 1fr 80px;
	border-bottom: 1px solid var(--theme--border-color);
}

.table-row:last-child {
	border-bottom: none;
}

.table-row:hover {
	background: var(--theme--background-subdued);
}

.cell {
	padding: 12px;
	display: flex;
	align-items: center;
	border-right: 1px solid var(--theme--border-color);
}

.cell:last-child {
	border-right: none;
	justify-content: center;
}

.field-input {
	width: 100%;
	padding: 8px;
	border: 1px solid var(--theme--border-color);
	border-radius: 4px;
	background: var(--theme--background);
	color: var(--theme--foreground);
	font-size: 14px;
}

.field-input:focus {
	outline: none;
	border-color: var(--theme--primary);
}

/* 导入进度 */
.progress-content {
	max-width: 600px;
	margin: 24px auto;
	background: var(--theme--background);
	border-radius: 8px;
	padding: 32px;
	text-align: center;
}

.progress-status {
	margin-bottom: 32px;
}

.progress-summary {
	margin-top: 24px;
}

.progress-percentage {
	font-size: 48px;
	font-weight: 700;
	line-height: 1;
	color: var(--theme--primary);
}

.progress-text {
	margin-top: 12px;
	font-size: 16px;
	color: var(--theme--foreground);
}

.estimated-time {
	margin-top: 8px;
	font-size: 14px;
	color: var(--theme--foreground-subdued);
}

.progress-status .v-icon {
	font-size: 64px;
	margin-bottom: 16px;
}

.progress-status .v-icon.processing {
	animation: spin 1s linear infinite;
}

@keyframes spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}

.progress-status .v-icon.completed {
	color: var(--theme--success);
}

.progress-status .v-icon.failed {
	color: var(--theme--danger);
}

.progress-stats {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 16px;
	margin-top: 32px;
}

.stat-item {
	text-align: center;
}

.stat-label {
	display: block;
	font-size: 12px;
	color: var(--theme--foreground-subdued);
	margin-bottom: 8px;
}

.stat-value {
	font-size: 24px;
	font-weight: 600;
}

.stat-value.success {
	color: var(--theme--success);
}

.stat-value.error {
	color: var(--theme--danger);
}

.progress-logs {
	margin-top: 32px;
	text-align: left;
}

.progress-logs h4 {
	font-size: 14px;
	font-weight: 600;
	margin-bottom: 16px;
}

.logs-container {
	background: var(--theme--background-subdued);
	border-radius: 4px;
	padding: 16px;
	max-height: 300px;
	overflow-y: auto;
	font-family: 'Courier New', monospace;
	font-size: 12px;
}

.log-entry {
	padding: 8px 0;
	border-bottom: 1px solid var(--theme--border-color);
}

.log-entry:last-child {
	border-bottom: none;
}

.log-time {
	color: var(--theme--foreground-subdued);
	margin-right: 8px;
}

.log-message {
	color: var(--theme--foreground);
}

.log-entry.error .log-message {
	color: var(--theme--danger);
}

.log-entry.warning .log-message {
	color: var(--theme--warning);
}

/* 结果确认 */
.result-header {
	text-align: center;
	padding: 48px 24px;
	border-radius: 8px;
	margin-bottom: 24px;
}

.result-header.completed {
	background: var(--theme--success-subdued);
	color: var(--theme--success);
}

.result-header.failed {
	background: var(--theme--danger-subdued);
	color: var(--theme--danger);
}

.result-header .v-icon {
	font-size: 64px;
	margin-bottom: 16px;
}

.result-header h2 {
	font-size: 24px;
	margin-bottom: 8px;
}

.result-header p {
	font-size: 14px;
	opacity: 0.8;
}

.result-summary {
	background: var(--theme--background);
	border-radius: 8px;
	padding: 24px;
	margin-bottom: 24px;
}

.result-summary h3 {
	font-size: 16px;
	font-weight: 600;
	margin-bottom: 16px;
}

.summary-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	gap: 16px;
}

.summary-item {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 16px;
	background: var(--theme--background-subdued);
	border-radius: 4px;
}

.summary-label {
	font-size: 12px;
	color: var(--theme--foreground-subdued);
}

.summary-value {
	font-size: 20px;
	font-weight: 600;
}

.summary-value.success {
	color: var(--theme--success);
}

.summary-value.error {
	color: var(--theme--danger);
}

.result-errors {
	background: var(--theme--background);
	border-radius: 8px;
	padding: 24px;
}

.result-errors h3 {
	font-size: 16px;
	font-weight: 600;
	margin-bottom: 16px;
}

.errors-container {
	max-height: 400px;
	overflow-y: auto;
}

.error-entry {
	display: flex;
	gap: 12px;
	padding: 12px;
	background: var(--theme--background-subdued);
	border-radius: 4px;
	margin-bottom: 8px;
}

.error-icon {
	color: var(--theme--danger);
	flex-shrink: 0;
}

.error-content {
	flex: 1;
	min-width: 0;
}

.error-row {
	font-weight: 600;
	font-size: 14px;
	margin-bottom: 4px;
}

.error-message {
	font-size: 14px;
	color: var(--theme--foreground);
	word-break: break-word;
}

.error-field {
	font-size: 12px;
	color: var(--theme--foreground-subdued);
	margin-top: 4px;
}

/* 向导操作按钮 */
.wizard-actions {
	display: flex;
	justify-content: center;
	gap: 16px;
	padding: 24px;
	border-top: 1px solid var(--theme--border-color);
	background: var(--theme--background);
}

/* 响应式设计 */
@media (max-width: 1024px) {
	.step-item {
		max-width: 150px;
	}

	.step-label {
		font-size: 11px;
	}

	.table-header,
	.table-row {
		grid-template-columns: 1fr 1fr 1fr 60px;
	}

	.cell {
		padding: 8px;
		font-size: 13px;
	}

	.progress-stats {
		grid-template-columns: repeat(2, 1fr);
	}

	.summary-grid {
		grid-template-columns: repeat(2, 1fr);
	}
}

@media (max-width: 768px) {
	.step-indicator {
		padding: 16px;
	}

	.step-label {
		display: none;
	}

	.upload-zone {
		padding: 32px 16px;
	}

	.table-header,
	.table-row {
		grid-template-columns: 1fr;
	}

	.header-cell,
	.cell {
		border-right: none;
		border-bottom: 1px solid var(--theme--border-color);
	}

	.cell:last-child {
		border-bottom: none;
	}

	.table-row .cell::before {
		content: attr(data-label);
		font-weight: 600;
		display: block;
		margin-bottom: 4px;
	}

	.progress-stats {
		grid-template-columns: 1fr;
	}

	.summary-grid {
		grid-template-columns: 1fr;
	}

	.wizard-actions {
		flex-direction: column;
	}

	.wizard-actions .v-button {
		width: 100%;
	}
}
</style>
