<template>
	<div class="dataset-registry-list">
		<v-table
			v-if="datasets.length > 0 || loading"
			:items="paginatedDatasets"
			:columns="tableColumns"
			:loading="loading"
			fixed-header
			show-sort
		>
			<template #header>
				<div class="table-header">
					<div class="search-bar">
						<v-input
							v-model="searchTerm"
							placeholder="搜索数据集名称或描述..."
							clearable
							:disabled="loading"
							@update:model-value="handleSearch"
						>
							<template #prepend>
								<v-icon name="search" />
							</template>
						</v-input>
					</div>
					<div class="filter-bar">
						<v-select
							v-model="statusFilter"
							:items="statusOptions"
							placeholder="筛选状态"
							clearable
							:disabled="loading"
							@update:model-value="handleFilter"
						/>
					</div>
					<div class="actions">
						<v-button
							v-tooltip="'刷新列表'"
							icon
							rounded
							:loading="loading"
							:disabled="loading"
							@click="refreshData"
						>
							<template #icon>
								<v-icon name="refresh" />
							</template>
						</v-button>
					</div>
				</div>
			</template>

			<template #item-actions="{ item }">
				<div class="row-actions">
					<v-button
						v-tooltip="item.status === 'active' ? '隐藏数据集' : '显示数据集'"
						icon
						x-small
						:loading="rowActionLoading[item.id]?.visibility"
						:disabled="rowActionLoading[item.id]?.visibility"
						@click="toggleVisibility(item)"
					>
						<template #icon>
							<v-icon :name="item.status === 'active' ? 'visibility' : 'visibility_off'" />
						</template>
					</v-button>

					<v-button
						v-tooltip="'查看详情'"
						icon
						x-small
						:loading="rowActionLoading[item.id]?.view"
						:disabled="rowActionLoading[item.id]?.view"
						:to="`/admin/content/${item.collection_name}`"
					>
						<template #icon>
							<v-icon name="list_alt" />
						</template>
					</v-button>

					<v-button
						v-if="hasDsManagerRole"
						v-tooltip="'⚠️ 危险操作：此操作将清空所有数据且不可恢复'"
						x-small
						class="danger-action danger-action--truncate"
						:loading="rowActionLoading[item.id]?.truncate"
						:disabled="rowActionLoading[item.id]?.truncate"
						@click="confirmTruncate(item)"
					>
						<template #icon>
							<v-icon name="warning" />
						</template>
						<span class="danger-action__label">清空</span>
					</v-button>

					<v-button
						v-if="hasDsManagerRole"
						v-tooltip="'⚠️ 危险操作：此操作将永久删除数据集且不可恢复'"
						x-small
						class="danger-action danger-action--delete"
						:loading="rowActionLoading[item.id]?.delete"
						:disabled="rowActionLoading[item.id]?.delete"
						@click="confirmDelete(item)"
					>
						<template #icon>
							<v-icon name="warning" />
						</template>
						<span class="danger-action__label">删除</span>
					</v-button>
				</div>
			</template>

			<template #item-status="{ item }">
				<v-chip
					:color="getStatusColor(item.status)"
					small
				>
					{{ getStatusLabel(item.status) }}
				</v-chip>
			</template>

			<template #item-record_count="{ item }">
				{{ formatNumber(item.record_count) }}
			</template>

			<template #item-created_at="{ item }">
				{{ formatDate(item.created_at) }}
			</template>

			<template #footer>
				<div class="pagination">
					<v-pagination
						v-model="currentPage"
						:length="totalPages"
						:total-visible="7"
						show-first-last
						:disabled="loading"
					/>
					<div class="page-info">
						<span>共 {{ filteredDatasets.length }} 条记录</span>
						<v-select
							v-model="itemsPerPage"
							:items="[10, 20, 50, 100]"
							inline
							dense
							:disabled="loading"
							@update:model-value="handleItemsPerPageChange"
						/>
					</div>
				</div>
			</template>
		</v-table>

		<!-- 加载状态 -->
		<div v-else-if="loading" class="loading-container">
			<v-progress-circular indeterminate />
			<p class="loading-text">正在加载数据集列表...</p>
		</div>

		<!-- 空状态 -->
		<v-notice v-else-if="!loading && !error.show" type="info">
			暂无数据集，请先导入数据
		</v-notice>

		<!-- 错误状态 -->
		<v-notice v-else-if="error.show" type="danger" class="error-notice">
			<div class="error-content">
				<div class="error-header">
					<v-icon name="error" class="error-icon" />
					<strong>加载失败</strong>
					<span v-if="error.code" class="error-code">({{ error.code }})</span>
				</div>
				<p class="error-message">{{ error.message }}</p>
				<v-button
					v-if="error.code === 'NETWORK_ERROR' || error.code?.startsWith('HTTP_5')"
					@click="refreshData"
					small
				>
					重试
				</v-button>
			</div>
		</v-notice>

		<!-- 清空确认对话框 -->
		<v-dialog v-model="truncateDialog" @update:model-value="handleTruncateDialogClose">
			<v-card class="danger-dialog">
				<v-card-title class="danger-dialog__title">
					<v-icon name="warning" class="danger-dialog__title-icon" />
					<div>
						<div>确认清空库表</div>
						<p class="danger-dialog__headline">此操作不可恢复，请完成二次确认后继续。</p>
					</div>
				</v-card-title>
				<v-card-text>
					<p>
						您确定要清空数据集 <strong>{{ selectedItem?.display_name }}</strong> 的所有数据吗？
					</p>
					<v-notice type="warning" class="danger-dialog__notice">
						此操作将删除 <strong>{{ formatNumber(selectedItem?.record_count ?? 0) }}</strong> 条记录，但保留表结构和元数据。此操作不可恢复。
					</v-notice>
					<div class="danger-dialog__impact">
						<span>目标集合：{{ selectedItem?.collection_name }}</span>
						<span>影响记录：{{ formatNumber(selectedItem?.record_count ?? 0) }}</span>
					</div>
					<div class="danger-dialog__confirmation">
						<label class="danger-dialog__label" for="truncate-confirm-input">
							请输入数据集名称 <strong>{{ selectedItem?.display_name }}</strong> 以确认清空
						</label>
						<v-input
							id="truncate-confirm-input"
							v-model="confirmationInput"
							placeholder="输入数据集名称后才可继续"
							:disabled="actionLoading"
						/>
					</div>
				</v-card-text>
				<v-card-actions>
					<v-button
						:disabled="actionLoading"
						@click="truncateDialog = false"
					>
						取消
					</v-button>
					<v-button
						:loading="actionLoading"
						color="danger"
						:disabled="!canConfirmDangerAction || actionLoading"
						@click="executeTruncate"
					>
						{{ confirmButtonLabel('确认清空') }}
					</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- 删除确认对话框 -->
		<v-dialog v-model="deleteDialog" @update:model-value="handleDeleteDialogClose">
			<v-card class="danger-dialog">
				<v-card-title class="danger-dialog__title">
					<v-icon name="warning" class="danger-dialog__title-icon" />
					<div>
						<div>确认删除数据集</div>
						<p class="danger-dialog__headline">此操作将删除数据表和元数据，无法撤销。</p>
					</div>
				</v-card-title>
				<v-card-text>
					<p>
						您确定要删除数据集 <strong>{{ selectedItem?.display_name }}</strong> 吗？
					</p>
					<v-notice type="danger" class="danger-dialog__notice">
						此操作将删除数据表和所有元数据记录，并影响依赖该数据集的访问入口。此操作不可恢复。
					</v-notice>
					<div class="danger-dialog__impact">
						<span>目标集合：{{ selectedItem?.collection_name }}</span>
						<span>当前记录：{{ formatNumber(selectedItem?.record_count ?? 0) }}</span>
					</div>
					<div class="danger-dialog__confirmation">
						<label class="danger-dialog__label" for="delete-confirm-input">
							请输入数据集名称 <strong>{{ selectedItem?.display_name }}</strong> 以确认删除
						</label>
						<v-input
							id="delete-confirm-input"
							v-model="confirmationInput"
							placeholder="输入数据集名称后才可继续"
							:disabled="actionLoading"
						/>
					</div>
				</v-card-text>
				<v-card-actions>
					<v-button
						:disabled="actionLoading"
						@click="deleteDialog = false"
					>
						取消
					</v-button>
					<v-button
						:loading="actionLoading"
						color="danger"
						:disabled="!canConfirmDangerAction || actionLoading"
						@click="executeDelete"
					>
						{{ confirmButtonLabel('确认删除') }}
					</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- Toast 通知 -->
		<v-toast v-model="toast.show" :type="toast.type">
			{{ toast.message }}
		</v-toast>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useApi, useUserStore } from '@directus/extensions-sdk';

interface Dataset {
	id: number;
	collection_name: string;
	display_name: string;
	status: 'draft' | 'active' | 'hidden';
	source_file_name: string | null;
	record_count: number;
	description: string | null;
	tags: string[];
	created_at: string;
	updated_at: string;
}

interface TableColumn {
	field: string;
	name: string;
	width?: number;
	align?: 'left' | 'center' | 'right';
	sortable?: boolean;
}

const api = useApi();
const userStore = useUserStore();

const datasets = ref<Dataset[]>([]);
const loading = ref(false);
const actionLoading = ref(false);
const rowActionLoading = ref<Record<number, {
	visibility?: boolean;
	view?: boolean;
	truncate?: boolean;
	delete?: boolean;
}>>({});

const searchTerm = ref('');
const statusFilter = ref<string | null>(null);
const currentPage = ref(1);
const itemsPerPage = ref(50);

const truncateDialog = ref(false);
const deleteDialog = ref(false);
const selectedItem = ref<Dataset | null>(null);
const confirmationInput = ref('');
const confirmCountdown = ref(0);

const toast = ref({
	show: false,
	message: '',
	type: 'success' as 'success' | 'error' | 'warning' | 'info'
});

const error = ref<{
	show: boolean;
	message: string;
	code?: string;
}>({
	show: false,
	message: ''
});

const statusOptions = [
	{ text: '全部状态', value: null },
	{ text: '草稿', value: 'draft' },
	{ text: '可见', value: 'active' },
	{ text: '隐藏', value: 'hidden' }
];

const tableColumns: TableColumn[] = [
	{ field: 'display_name', name: '数据集名称', sortable: true },
	{ field: 'collection_name', name: '集合名称', sortable: true },
	{ field: 'status', name: '状态', width: 120, align: 'center', sortable: true },
	{ field: 'record_count', name: '记录数', width: 120, align: 'right', sortable: true },
	{ field: 'source_file_name', name: '源文件', sortable: true },
	{ field: 'created_at', name: '创建时间', width: 180, sortable: true },
	{ field: 'actions', name: '操作', width: 200, align: 'center' }
];

const hasDsManagerRole = computed(() => {
	const user = userStore.currentUser;
	if (!user || !user.role) return false;

	const roleName = user.role.name || user.role;
	return roleName === 'ds-manager' || roleName === 'Administrator';
});

let confirmCountdownTimer: ReturnType<typeof setInterval> | null = null;

const canConfirmDangerAction = computed(() => {
	return Boolean(
		selectedItem.value &&
		confirmationInput.value === selectedItem.value.display_name &&
		confirmCountdown.value === 0
	);
});

const filteredDatasets = computed(() => {
	let result = [...datasets.value];

	if (searchTerm.value) {
		const term = searchTerm.value.toLowerCase();
		result = result.filter(dataset =>
			dataset.display_name.toLowerCase().includes(term) ||
			dataset.collection_name.toLowerCase().includes(term) ||
			(dataset.description && dataset.description.toLowerCase().includes(term))
		);
	}

	if (statusFilter.value) {
		result = result.filter(dataset => dataset.status === statusFilter.value);
	}

	return result;
});

const totalPages = computed(() => {
	return Math.ceil(filteredDatasets.value.length / itemsPerPage.value);
});

const paginatedDatasets = computed(() => {
	const start = (currentPage.value - 1) * itemsPerPage.value;
	const end = start + itemsPerPage.value;
	return filteredDatasets.value.slice(start, end);
});

const fetchDatasets = async () => {
	loading.value = true;
	error.value = { show: false, message: '' };

	try {
		const response = await api.get('/items/bt_dataset_registry', {
			params: {
				sort: ['-created_at'],
				limit: -1,
				fields: ['*']
			}
		});

		if (response.data && Array.isArray(response.data.data)) {
			datasets.value = response.data.data;
		} else {
			datasets.value = [];
			error.value = {
				show: true,
				message: '服务器返回了无效的数据格式',
				code: 'INVALID_RESPONSE'
			};
		}
	} catch (err: any) {
		console.error('获取数据集列表失败:', err);

		let errorMessage = '获取数据集列表失败';
		let errorCode = 'FETCH_ERROR';

		if (err.response) {
			// 服务器返回错误响应
			const statusCode = err.response.status;
			errorCode = `HTTP_${statusCode}`;

			if (statusCode === 403) {
				errorMessage = '您没有权限访问数据集列表';
			} else if (statusCode === 500) {
				errorMessage = '服务器内部错误，请稍后重试';
			} else if (statusCode === 503) {
				errorMessage = '服务暂时不可用，请稍后重试';
			} else if (err.response.data?.errors?.[0]?.message) {
				errorMessage = err.response.data.errors[0].message;
			}
		} else if (err.request) {
			// 请求已发送但没有收到响应
			errorMessage = '网络连接失败，请检查网络设置';
			errorCode = 'NETWORK_ERROR';
		} else {
			// 请求配置出错
			errorMessage = err.message || '请求配置错误';
			errorCode = 'REQUEST_ERROR';
		}

		error.value = {
			show: true,
			message: errorMessage,
			code: errorCode
		};

		showToast(errorMessage, 'error');
		datasets.value = [];
	} finally {
		loading.value = false;
	}
};

const toggleVisibility = async (dataset: Dataset) => {
	if (!rowActionLoading.value[dataset.id]) rowActionLoading.value[dataset.id] = {};
	rowActionLoading.value[dataset.id].visibility = true;

	const newStatus = dataset.status === 'active' ? 'hidden' : 'active';
	const originalStatus = dataset.status;

	try {
		await api.patch(`/items/bt_dataset_registry/${dataset.id}`, {
			status: newStatus
		});

		dataset.status = newStatus;
		showToast(`数据集已${newStatus === 'active' ? '显示' : '隐藏'}`, 'success');
	} catch (err: any) {
		console.error('更新状态失败:', err);

		let errorMessage = '更新状态失败';
		if (err.response?.data?.errors?.[0]?.message) {
			errorMessage = err.response.data.errors[0].message;
		} else if (err.response?.status === 403) {
			errorMessage = '您没有权限更改数据集状态';
		} else if (err.response?.status === 404) {
			errorMessage = '数据集不存在';
		}

		showToast(errorMessage, 'error');
		// 恢复原状态
		dataset.status = originalStatus;
	} finally {
		if (rowActionLoading.value[dataset.id]) {
			rowActionLoading.value[dataset.id].visibility = false;
		}
	}
};

const confirmTruncate = (dataset: Dataset) => {
	selectedItem.value = dataset;
	resetDangerConfirmation();
	startDangerCountdown();
	truncateDialog.value = true;
};

const executeTruncate = async () => {
	if (!selectedItem.value) return;

	actionLoading.value = true;
	const originalRecordCount = selectedItem.value.record_count;

	try {
		await api.post(`/custom/excel-importer/truncate/${selectedItem.value.collection_name}`);

		selectedItem.value.record_count = 0;
		showToast('数据集已清空', 'success');
		truncateDialog.value = false;
	} catch (err: any) {
		console.error('清空数据集失败:', err);

		let errorMessage = '清空数据集失败';
		if (err.response?.data?.errors?.[0]?.message) {
			errorMessage = err.response.data.errors[0].message;
		} else if (err.response?.status === 403) {
			errorMessage = '您没有权限清空数据集';
		} else if (err.response?.status === 404) {
			errorMessage = '数据集不存在';
		} else if (err.response?.status === 500) {
			errorMessage = '服务器内部错误，请稍后重试';
		}

		showToast(errorMessage, 'error');
		// 恢复原记录数
		if (selectedItem.value) {
			selectedItem.value.record_count = originalRecordCount;
		}
	} finally {
		actionLoading.value = false;
		selectedItem.value = null;
	}
};

const confirmDelete = (dataset: Dataset) => {
	selectedItem.value = dataset;
	resetDangerConfirmation();
	startDangerCountdown();
	deleteDialog.value = true;
};

const executeDelete = async () => {
	if (!selectedItem.value) return;

	actionLoading.value = true;

	try {
		await api.delete(`/custom/excel-importer/dataset/${selectedItem.value.collection_name}`);

		datasets.value = datasets.value.filter(d => d.id !== selectedItem.value?.id);
		showToast('数据集已删除', 'success');
		deleteDialog.value = false;
	} catch (err: any) {
		console.error('删除数据集失败:', err);

		let errorMessage = '删除数据集失败';
		if (err.response?.data?.errors?.[0]?.message) {
			errorMessage = err.response.data.errors[0].message;
		} else if (err.response?.status === 403) {
			errorMessage = '您没有权限删除数据集';
		} else if (err.response?.status === 404) {
			errorMessage = '数据集不存在';
		} else if (err.response?.status === 500) {
			errorMessage = '服务器内部错误，请稍后重试';
		}

		showToast(errorMessage, 'error');
	} finally {
		actionLoading.value = false;
		selectedItem.value = null;
	}
};

const handleSearch = () => {
	currentPage.value = 1;
};

const handleFilter = () => {
	currentPage.value = 1;
};

const handleItemsPerPageChange = () => {
	currentPage.value = 1;
};

const handleTruncateDialogClose = (value: boolean) => {
	if (!value && !actionLoading.value) {
		resetDangerDialogState();
	}
	truncateDialog.value = value;
};

const handleDeleteDialogClose = (value: boolean) => {
	if (!value && !actionLoading.value) {
		resetDangerDialogState();
	}
	deleteDialog.value = value;
};

const refreshData = () => {
	fetchDatasets();
};

const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
	toast.value = {
		show: true,
		message,
		type
	};

	setTimeout(() => {
		toast.value.show = false;
	}, 3000);
};

const getStatusColor = (status: string) => {
	switch (status) {
		case 'active': return 'success';
		case 'draft': return 'warning';
		case 'hidden': return 'danger';
		default: return 'info';
	}
};

const getStatusLabel = (status: string) => {
	switch (status) {
		case 'active': return '可见';
		case 'draft': return '草稿';
		case 'hidden': return '隐藏';
		default: return status;
	}
};

const formatNumber = (num: number) => {
	return new Intl.NumberFormat('zh-CN').format(num);
};

const formatDate = (dateString: string) => {
	const date = new Date(dateString);
	return new Intl.DateTimeFormat('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	}).format(date);
};

const resetDangerConfirmation = () => {
	confirmationInput.value = '';
	confirmCountdown.value = 3;
};

const clearDangerCountdown = () => {
	if (confirmCountdownTimer) {
		clearInterval(confirmCountdownTimer);
		confirmCountdownTimer = null;
	}
};

const startDangerCountdown = () => {
	clearDangerCountdown();
	confirmCountdownTimer = setInterval(() => {
		if (confirmCountdown.value <= 1) {
			confirmCountdown.value = 0;
			clearDangerCountdown();
			return;
		}

		confirmCountdown.value -= 1;
	}, 1000);
};

const resetDangerDialogState = () => {
	clearDangerCountdown();
	confirmationInput.value = '';
	confirmCountdown.value = 0;
	selectedItem.value = null;
};

const confirmButtonLabel = (label: string) => {
	if (confirmCountdown.value > 0) {
		return `${label}（${confirmCountdown.value}s）`;
	}

	return label;
};

onMounted(() => {
	fetchDatasets();
});

onBeforeUnmount(() => {
	clearDangerCountdown();
});
</script>

<style scoped>
.dataset-registry-list {
	height: 100%;
	display: flex;
	flex-direction: column;
}

.table-header {
	display: flex;
	gap: 16px;
	padding: 16px;
	align-items: center;
}

.search-bar {
	flex: 1;
	min-width: 200px;
}

.filter-bar {
	width: 200px;
}

.actions {
	display: flex;
	gap: 8px;
}

.row-actions {
	display: flex;
	gap: 8px;
	justify-content: center;
	align-items: center;
	flex-wrap: wrap;
}

.loading-container {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 64px 24px;
	gap: 16px;
}

.loading-text {
	color: var(--theme--foreground-subdued);
	font-size: 14px;
	margin: 0;
}

.error-notice {
	margin: 16px;
}

.error-content {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.error-header {
	display: flex;
	align-items: center;
	gap: 8px;
}

.error-icon {
	color: var(--theme--danger);
	font-size: 20px;
}

.error-code {
	color: var(--theme--foreground-subdued);
	font-size: 12px;
	font-family: monospace;
}

.error-message {
	margin: 0;
	color: var(--theme--danger);
}

.danger-action {
	--v-button-background-color: var(--theme--danger);
	--v-button-color: var(--theme--foreground-inverted);
	--v-button-background-color-hover: color-mix(in srgb, var(--theme--danger) 82%, black);
	animation: danger-pulse 1.8s ease-in-out infinite;
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme--danger) 45%, white), 0 10px 24px rgba(201, 42, 42, 0.22);
	font-weight: 700;
}

.danger-action__label {
	letter-spacing: 0.04em;
}

.danger-action--truncate {
	background-image: linear-gradient(135deg, color-mix(in srgb, var(--theme--danger) 88%, white), var(--theme--danger));
}

.danger-action--delete {
	background-image: linear-gradient(135deg, var(--theme--danger), color-mix(in srgb, var(--theme--danger) 72%, black));
}

.danger-dialog__title {
	display: flex;
	align-items: flex-start;
	gap: 12px;
}

.danger-dialog__title-icon {
	color: var(--theme--danger);
	font-size: 48px;
	line-height: 1;
}

.danger-dialog__headline {
	margin: 4px 0 0;
	color: var(--theme--danger);
	font-size: 18px;
	font-weight: 700;
}

.danger-dialog__notice {
	margin-top: 16px;
}

.danger-dialog__impact {
	display: grid;
	gap: 8px;
	margin-top: 16px;
	padding: 12px 16px;
	border-radius: 12px;
	background: color-mix(in srgb, var(--theme--danger) 10%, white);
	color: var(--theme--danger);
	font-size: 16px;
	font-weight: 600;
}

.danger-dialog__confirmation {
	margin-top: 20px;
}

.danger-dialog__label {
	display: block;
	margin-bottom: 8px;
	font-size: 14px;
	font-weight: 600;
}

@keyframes danger-pulse {
	0%, 100% {
		transform: translateY(0);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme--danger) 45%, white), 0 10px 24px rgba(201, 42, 42, 0.22);
	}

	50% {
		transform: translateY(-1px);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme--danger) 55%, white), 0 14px 28px rgba(201, 42, 42, 0.28);
	}
}

.pagination {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 16px;
	gap: 16px;
}

.page-info {
	display: flex;
	align-items: center;
	gap: 16px;
}

:deep(.v-table) {
	height: 100%;
}

:deep(.v-table__fixed-header) {
	position: sticky;
	top: 0;
	z-index: 10;
}

:deep(.v-chip) {
	margin: 0;
}
</style>
