<template>
	<div class="dataset-registry-list">
		<v-table
			v-if="datasets.length > 0"
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
							@update:model-value="handleFilter"
						/>
					</div>
					<div class="actions">
						<v-button
							v-tooltip="'刷新列表'"
							icon
							rounded
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
						:to="`/admin/content/${item.collection_name}`"
					>
						<template #icon>
							<v-icon name="list_alt" />
						</template>
					</v-button>

					<v-button
						v-if="hasDsManagerRole"
						v-tooltip="'清空库表'"
						icon
						x-small
						class="danger-action"
						@click="confirmTruncate(item)"
					>
						<template #icon>
							<v-icon name="delete_sweep" />
						</template>
					</v-button>

					<v-button
						v-if="hasDsManagerRole"
						v-tooltip="'删除数据集'"
						icon
						x-small
						class="danger-action"
						@click="confirmDelete(item)"
					>
						<template #icon>
							<v-icon name="delete" />
						</template>
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
					/>
					<div class="page-info">
						<span>共 {{ filteredDatasets.length }} 条记录</span>
						<v-select
							v-model="itemsPerPage"
							:items="[10, 20, 50, 100]"
							inline
							dense
							@update:model-value="handleItemsPerPageChange"
						/>
					</div>
				</div>
			</template>
		</v-table>

		<v-notice v-else-if="!loading" type="info">
			暂无数据集，请先导入数据
		</v-notice>

		<v-dialog v-model="truncateDialog" @update:model-value="handleTruncateDialogClose">
			<v-card>
				<v-card-title>确认清空库表</v-card-title>
				<v-card-text>
					您确定要清空数据集 <strong>{{ selectedItem?.display_name }}</strong> 的所有数据吗？
					<v-notice type="warning">
						此操作将删除表中的所有记录，但保留表结构和元数据。此操作不可撤销。
					</v-notice>
				</v-card-text>
				<v-card-actions>
					<v-button @click="truncateDialog = false">取消</v-button>
					<v-button
						:loading="actionLoading"
						color="danger"
						@click="executeTruncate"
					>
						确认清空
					</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<v-dialog v-model="deleteDialog" @update:model-value="handleDeleteDialogClose">
			<v-card>
				<v-card-title>确认删除数据集</v-card-title>
				<v-card-text>
					您确定要删除数据集 <strong>{{ selectedItem?.display_name }}</strong> 吗？
					<v-notice type="danger">
						此操作将删除数据表和所有元数据记录，此操作不可撤销。
					</v-notice>
				</v-card-text>
				<v-card-actions>
					<v-button @click="deleteDialog = false">取消</v-button>
					<v-button
						:loading="actionLoading"
						color="danger"
						@click="executeDelete"
					>
						确认删除
					</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<v-toast v-model="toast.show" :type="toast.type">
			{{ toast.message }}
		</v-toast>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
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

const searchTerm = ref('');
const statusFilter = ref<string | null>(null);
const currentPage = ref(1);
const itemsPerPage = ref(50);

const truncateDialog = ref(false);
const deleteDialog = ref(false);
const selectedItem = ref<Dataset | null>(null);

const toast = ref({
	show: false,
	message: '',
	type: 'success' as 'success' | 'error' | 'warning' | 'info'
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
		}
	} catch (error) {
		console.error('获取数据集列表失败:', error);
		showToast('获取数据集列表失败', 'error');
		datasets.value = [];
	} finally {
		loading.value = false;
	}
};

const toggleVisibility = async (dataset: Dataset) => {
	const newStatus = dataset.status === 'active' ? 'hidden' : 'active';

	try {
		await api.patch(`/items/bt_dataset_registry/${dataset.id}`, {
			status: newStatus
		});

		dataset.status = newStatus;
		showToast(`数据集已${newStatus === 'active' ? '显示' : '隐藏'}`, 'success');
	} catch (error) {
		console.error('更新状态失败:', error);
		showToast('更新状态失败', 'error');
	}
};

const confirmTruncate = (dataset: Dataset) => {
	selectedItem.value = dataset;
	truncateDialog.value = true;
};

const executeTruncate = async () => {
	if (!selectedItem.value) return;

	actionLoading.value = true;
	try {
		await api.post(`/custom/excel-importer/truncate/${selectedItem.value.collection_name}`);

		selectedItem.value.record_count = 0;
		showToast('数据集已清空', 'success');
		truncateDialog.value = false;
	} catch (error) {
		console.error('清空数据集失败:', error);
		showToast('清空数据集失败', 'error');
	} finally {
		actionLoading.value = false;
		selectedItem.value = null;
	}
};

const confirmDelete = (dataset: Dataset) => {
	selectedItem.value = dataset;
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
	} catch (error) {
		console.error('删除数据集失败:', error);
		showToast('删除数据集失败', 'error');
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
	if (!value) {
		selectedItem.value = null;
	}
	truncateDialog.value = value;
};

const handleDeleteDialogClose = (value: boolean) => {
	if (!value) {
		selectedItem.value = null;
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

onMounted(() => {
	fetchDatasets();
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
}

.danger-action {
	--v-button-background-color: var(--theme--danger-background);
	--v-button-color: var(--theme--danger);
	--v-button-background-color-hover: var(--theme--danger-background-hover);
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
