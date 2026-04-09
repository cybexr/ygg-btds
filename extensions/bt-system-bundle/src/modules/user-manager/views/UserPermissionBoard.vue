<template>
	<div class="permission-board">
		<private-view title="用户-库权限矩阵">
			<template #headline>
				<v-breadcrumb :items="[{ title: '库人员管理', disabled: true }]" />
			</template>

			<template #title-outer:prepend>
				<v-button class="header-icon" rounded disabled icon>
					<template #icon>
						<v-icon name="group_admin" />
					</template>
				</v-button>
			</template>

			<template #actions>
				<v-button v-tooltip="'预览变更'" rounded icon @click="handlePreview" :disabled="!hasChanges">
					<template #icon>
						<v-icon name="visibility" />
					</template>
				</v-button>
				<v-button v-tooltip="'保存权限'" rounded icon @click="handleSave" :disabled="!hasChanges || saving">
					<template #icon>
						<v-icon name="save" />
					</template>
				</v-button>
				<v-button v-tooltip="'刷新数据'" rounded icon @click="refreshData" :disabled="loading">
					<template #icon>
						<v-icon name="refresh" />
					</template>
				</v-button>
			</template>

			<div class="content">
				<!-- 搜索和过滤区域 -->
				<div class="filter-section">
					<div class="search-bar">
						<v-input
							v-model="searchTerm"
							placeholder="搜索用户名或邮箱..."
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
							v-model="roleFilter"
							:items="roleOptions"
							placeholder="筛选角色"
							clearable
							@update:model-value="handleFilter"
						/>
					</div>

					<div class="filter-bar">
						<v-select
							v-model="datasetFilter"
							:items="datasetOptions"
							placeholder="筛选数据集"
							clearable
							@update:model-value="handleFilter"
						/>
					</div>

					<div class="batch-actions">
						<v-button @click="selectAllOnPage" :disabled="loading">
							全选当前页
						</v-button>
						<v-button @click="clearAllSelections" :disabled="loading">
							清空选择
						</v-button>
						<v-button @click="showBatchGrantDialog = true" :disabled="selectedPermissions.size === 0">
							批量授权 ({{ selectedPermissions.size }})
						</v-button>
					</div>
				</div>

				<!-- 权限矩阵 -->
				<div v-if="!loading && paginatedUsers.length > 0" class="permission-matrix">
					<v-table
						fixed-header
						show-sort
						:items="paginatedUsers"
						:columns="matrixColumns"
					>
						<template #item-user="{ item }">
							<div class="user-cell">
								<div class="user-info">
									<div class="user-name">{{ item.first_name }} {{ item.last_name }}</div>
									<div class="user-email">{{ item.email }}</div>
								</div>
								<div class="user-roles">
									<v-chip
										v-for="role in getUserRoles(item)"
										:key="role"
										x-small
										:color="getRoleColor(role)"
									>
										{{ getRoleLabel(role) }}
									</v-chip>
								</div>
							</div>
						</template>

						<template #item.ds-descriptor-crud="{ item }">
							<div class="checkbox-cell">
								<v-checkbox
									:model-value="isPermissionEnabled(item.id, 'ds-descriptors', 'ds-descriptor-crud')"
									@update:model-value="(enabled) => handlePermissionChange(item.id, 'ds-descriptors', 'ds-descriptor-crud', enabled)"
								/>
							</div>
						</template>

						<template #item.ds-reader-read="{ item }">
							<div class="checkbox-cell">
								<v-checkbox
									:model-value="isPermissionEnabled(item.id, 'ds-descriptors', 'ds-reader-read')"
									@update:model-value="(enabled) => handlePermissionChange(item.id, 'ds-descriptors', 'ds-reader-read', enabled)"
								/>
							</div>
						</template>

						<template v-for="dataset in activeDatasets" :key="dataset.id" #[`item-dataset-${dataset.id}`]="{ item }">
							<div class="checkbox-cell">
								<v-checkbox
									:model-value="isPermissionEnabled(item.id, dataset.collection_name, 'ds-reader-read')"
									@update:model-value="(enabled) => handlePermissionChange(item.id, dataset.collection_name, 'ds-reader-read', enabled)"
								/>
							</div>
						</template>
					</v-table>
				</div>

				<v-progress-circular v-else-if="loading" indeterminate />

				<v-notice v-else type="info">
					暂无用户数据
				</v-notice>

				<!-- 分页 -->
				<div v-if="!loading && filteredUsers.length > 0" class="pagination">
					<v-pagination
						v-model="currentPage"
						:length="totalPages"
						:total-visible="7"
						show-first-last
					/>
					<div class="page-info">
						<span>共 {{ filteredUsers.length }} 条记录</span>
						<v-select
							v-model="itemsPerPage"
							:items="[25, 50, 100]"
							inline
							dense
							@update:model-value="handleItemsPerPageChange"
						/>
					</div>
				</div>
			</div>
		</private-view>

		<!-- 批量授权对话框 -->
		<v-dialog v-model="showBatchGrantDialog" @update:model-value="handleBatchDialogClose">
			<v-card>
				<v-card-title>批量授权</v-card-title>
				<v-card-text>
					<p>已选择 <strong>{{ selectedPermissions.size }}</strong> 个权限进行批量设置。</p>

					<div class="batch-form">
						<v-select
							v-model="batchTemplate"
							:items="templateOptions"
							label="权限模板"
							placeholder="选择权限模板"
						/>

						<v-checkbox
							v-model="batchEnabled"
							label="启用权限"
						/>
					</div>

					<v-notice type="info">
						此操作将为所有选中的权限应用相同的模板配置。
					</v-notice>
				</v-card-text>
				<v-card-actions>
					<v-button @click="showBatchGrantDialog = false">取消</v-button>
					<v-button
						:loading="batchProcessing"
						@click="applyBatchGrant"
					>
						确认应用
					</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- 预览对话框 -->
		<v-dialog v-model="showPreviewDialog" @update:model-value="handlePreviewDialogClose">
			<v-card>
				<v-card-title>权限变更预览</v-card-title>
				<v-card-text>
					<div v-if="previewData" class="preview-content">
						<div class="preview-stats">
							<v-notice type="success">
								将创建 {{ previewData.stats.create_count }} 条权限
							</v-notice>
							<v-notice type="warning">
								将更新 {{ previewData.stats.update_count }} 条权限
							</v-notice>
							<v-notice type="danger">
								将删除 {{ previewData.stats.delete_count }} 条权限
							</v-notice>
						</div>

						<div v-if="previewData.conflicts.length > 0" class="preview-conflicts">
							<h4>冲突警告</h4>
							<v-notice
								v-for="(conflict, index) in previewData.conflicts.slice(0, 5)"
								:key="index"
								type="danger"
							>
								{{ conflict.message }}
							</v-notice>
						</div>
					</div>
					<v-progress-circular v-else-if="previewLoading" indeterminate />
				</v-card-text>
				<v-card-actions>
					<v-button @click="showPreviewDialog = false">关闭</v-button>
					<v-button
						v-if="previewData && previewData.conflicts.length === 0"
						:loading="saving"
						@click="confirmSave"
					>
						确认保存
					</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- 确认保存对话框 -->
		<v-dialog v-model="showConfirmDialog">
			<v-card>
				<v-card-title>确认权限变更</v-card-title>
				<v-card-text>
					<p>您即将修改 <strong>{{ pendingChanges.size }}</strong> 条用户权限配置。</p>
					<v-notice type="warning">
						此操作将立即生效，影响用户对数据集的访问权限。请确认配置无误后继续。
					</v-notice>
				</v-card-text>
				<v-card-actions>
					<v-button @click="showConfirmDialog = false">取消</v-button>
					<v-button
						:loading="saving"
						color="primary"
						@click="executeSave"
					>
						确认变更
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
import { ref, computed, onMounted } from 'vue';
import { useApi } from '@directus/extensions-sdk';

interface User {
	id: string;
	first_name: string;
	last_name: string;
	email: string;
	role?: {
		id: string;
		name: string;
	};
}

interface Dataset {
	id: number;
	collection_name: string;
	display_name: string;
	status: string;
}

interface UserPermission {
	user_id: string;
	library_id: string;
	template: string;
	enabled: boolean;
}

interface TableColumn {
	field: string;
	name: string;
	width?: number;
	align?: 'left' | 'center' | 'right';
	sortable?: boolean;
}

const api = useApi();

const users = ref<User[]>([]);
const datasets = ref<Dataset[]>([]);
const currentPermissions = ref<UserPermission[]>([]);
const permissionChanges = new Map<string, UserPermission>();

const loading = ref(false);
const saving = ref(false);
const previewLoading = ref(false);
const batchProcessing = ref(false);

const searchTerm = ref('');
const roleFilter = ref<string | null>(null);
const datasetFilter = ref<string | null>(null);
const currentPage = ref(1);
const itemsPerPage = ref(50);

const showBatchGrantDialog = ref(false);
const showPreviewDialog = ref(false);
const showConfirmDialog = ref(false);
const previewData = ref<any>(null);

const batchTemplate = ref('ds-reader-read');
const batchEnabled = ref(true);

const selectedPermissions = ref<Set<string>>(new Set());

const toast = ref({
	show: false,
	message: '',
	type: 'success' as 'success' | 'error' | 'warning' | 'info'
});

const roleOptions = [
	{ text: '全部角色', value: null },
	{ text: 'ds-manager', value: 'ds-manager' },
	{ text: 'ds-descriptor', value: 'ds-descriptor' },
	{ text: 'ds-reader', value: 'ds-reader' },
	{ text: 'Administrator', value: 'Administrator' }
];

const templateOptions = [
	{ text: 'ds-descriptor 完整权限', value: 'ds-descriptor-crud' },
	{ text: 'ds-reader 只读权限', value: 'ds-reader-read' }
];

const activeDatasets = computed(() => {
	return datasets.value.filter(d => d.status === 'active');
});

const datasetOptions = computed(() => {
	return [
		{ text: '全部数据集', value: null },
		...activeDatasets.value.map(d => ({
			text: d.display_name,
			value: d.collection_name
		}))
	];
});

const matrixColumns = computed<TableColumn[]>(() => {
	const columns: TableColumn[] = [
		{ field: 'user', name: '用户', width: 250, sortable: true },
		{ field: 'ds-descriptor-crud', name: '描述符管理', width: 120, align: 'center' },
		{ field: 'ds-reader-read', name: '只读访问', width: 120, align: 'center' }
	];

	activeDatasets.value.forEach(dataset => {
		columns.push({
			field: `dataset-${dataset.id}`,
			name: dataset.display_name,
			width: 120,
			align: 'center'
		});
	});

	return columns;
});

const filteredUsers = computed(() => {
	let result = [...users.value];

	if (searchTerm.value) {
		const term = searchTerm.value.toLowerCase();
		result = result.filter(user =>
			user.email.toLowerCase().includes(term) ||
			`${user.first_name} ${user.last_name}`.toLowerCase().includes(term)
		);
	}

	if (roleFilter.value) {
		result = result.filter(user => {
			const roleName = user.role?.name || '';
			return roleName === roleFilter.value;
		});
	}

	return result;
});

const totalPages = computed(() => {
	return Math.ceil(filteredUsers.value.length / itemsPerPage.value);
});

const paginatedUsers = computed(() => {
	const start = (currentPage.value - 1) * itemsPerPage.value;
	const end = start + itemsPerPage.value;
	return filteredUsers.value.slice(start, end);
});

const hasChanges = computed(() => {
	return permissionChanges.size > 0;
});

const pendingChanges = computed(() => {
	return permissionChanges;
});

const fetchUsers = async () => {
	try {
		const response = await api.get('/users', {
			params: {
				limit: -1,
				fields: ['id', 'first_name', 'last_name', 'email', 'role.id', 'role.name']
			}
		});

		if (response.data && Array.isArray(response.data.data)) {
			users.value = response.data.data;
		}
	} catch (error) {
		console.error('获取用户列表失败:', error);
		showToast('获取用户列表失败', 'error');
	}
};

const fetchDatasets = async () => {
	try {
		const response = await api.get('/items/bt_dataset_registry', {
			params: {
				limit: -1,
				fields: ['id', 'collection_name', 'display_name', 'status']
			}
		});

		if (response.data && Array.isArray(response.data.data)) {
			datasets.value = response.data.data;
		}
	} catch (error) {
		console.error('获取数据集列表失败:', error);
		showToast('获取数据集列表失败', 'error');
	}
};

const fetchCurrentPermissions = async () => {
	try {
		const response = await api.get('/custom/permissions/current');

		if (response.data && Array.isArray(response.data.data)) {
			currentPermissions.value = response.data.data;
		}
	} catch (error) {
		console.error('获取当前权限失败:', error);
		currentPermissions.value = [];
	}
};

const getUserRoles = (user: User): string[] => {
	const roleName = user.role?.name || '';
	if (!roleName) return [];

	const roles: string[] = [];
	if (roleName === 'Administrator') {
		roles.push('admin');
	} else if (roleName.startsWith('ds-')) {
		roles.push(roleName);
	}

	return roles;
};

const getRoleColor = (role: string): string => {
	switch (role) {
		case 'admin': return 'danger';
		case 'ds-manager': return 'warning';
		case 'ds-descriptor': return 'success';
		case 'ds-reader': return 'info';
		default: return 'secondary';
	}
};

const getRoleLabel = (role: string): string => {
	switch (role) {
		case 'admin': return '管理员';
		case 'ds-manager': return '库管理';
		case 'ds-descriptor': return '描述符';
		case 'ds-reader': return '读者';
		default: return role;
	}
};

const getPermissionKey = (userId: string, libraryId: string, template: string): string => {
	return `${userId}:${libraryId}:${template}`;
};

const isPermissionEnabled = (userId: string, libraryId: string, template: string): boolean => {
	const key = getPermissionKey(userId, libraryId, template);

	if (permissionChanges.has(key)) {
		return permissionChanges.get(key)!.enabled;
	}

	return currentPermissions.value.some(
		p => p.user_id === userId && p.library_id === libraryId && p.template === template && p.enabled
	);
};

const handlePermissionChange = (userId: string, libraryId: string, template: string, enabled: boolean) => {
	const key = getPermissionKey(userId, libraryId, template);
	permissionChanges.set(key, {
		user_id: userId,
		library_id: libraryId,
		template,
		enabled
	});
};

const selectAllOnPage = () => {
	paginatedUsers.value.forEach(user => {
		activeDatasets.value.forEach(dataset => {
			const key = getPermissionKey(user.id, dataset.collection_name, 'ds-reader-read');
			selectedPermissions.value.add(key);
		});

		const crudKey = getPermissionKey(user.id, 'ds-descriptors', 'ds-descriptor-crud');
		const readKey = getPermissionKey(user.id, 'ds-descriptors', 'ds-reader-read');
		selectedPermissions.value.add(crudKey);
		selectedPermissions.value.add(readKey);
	});
};

const clearAllSelections = () => {
	selectedPermissions.value.clear();
};

const applyBatchGrant = () => {
	batchProcessing.value = true;

	setTimeout(() => {
		selectedPermissions.value.forEach(key => {
			const [userId, libraryId, oldTemplate] = key.split(':');
			const newKey = getPermissionKey(userId, libraryId, batchTemplate.value);
			permissionChanges.set(newKey, {
				user_id: userId,
				library_id: libraryId,
				template: batchTemplate.value,
				enabled: batchEnabled.value
			});
		});

		clearAllSelections();
		showBatchGrantDialog.value = false;
		batchProcessing.value = false;
		showToast('批量授权已应用，请保存以生效', 'success');
	}, 300);
};

const handlePreview = async () => {
	if (!hasChanges.value) return;

	showPreviewDialog.value = true;
	previewLoading.value = true;
	previewData.value = null;

	try {
		const requestData = {
			user_library_permissions: Array.from(permissionChanges.values())
		};

		const response = await api.post('/custom/permissions/preview', requestData);

		if (response.data && response.data.success) {
			previewData.value = response.data.data;
		}
	} catch (error) {
		console.error('预览失败:', error);
		showToast('预览失败', 'error');
		showPreviewDialog.value = false;
	} finally {
		previewLoading.value = false;
	}
};

const handleSave = () => {
	if (!hasChanges.value) return;
	showConfirmDialog.value = true;
};

const confirmSave = async () => {
	showPreviewDialog.value = false;
	showConfirmDialog.value = true;
};

const executeSave = async () => {
	saving.value = true;

	try {
		const requestData = {
			user_library_permissions: Array.from(permissionChanges.values())
		};

		const response = await api.post('/custom/permissions/sync', requestData);

		if (response.data && response.data.success) {
			showToast('权限保存成功', 'success');
			permissionChanges.clear();
			await fetchCurrentPermissions();
		}
	} catch (error) {
		console.error('保存失败:', error);
		showToast('保存失败', 'error');
	} finally {
		saving.value = false;
		showConfirmDialog.value = false;
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

const handleBatchDialogClose = (value: boolean) => {
	if (!value) {
		batchTemplate.value = 'ds-reader-read';
		batchEnabled.value = true;
	}
	showBatchGrantDialog.value = value;
};

const handlePreviewDialogClose = (value: boolean) => {
	if (!value) {
		previewData.value = null;
	}
	showPreviewDialog.value = value;
};

const refreshData = async () => {
	loading.value = true;
	try {
		await Promise.all([
			fetchUsers(),
			fetchDatasets(),
			fetchCurrentPermissions()
		]);
		showToast('数据已刷新', 'success');
	} catch (error) {
		showToast('刷新失败', 'error');
	} finally {
		loading.value = false;
	}
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

onMounted(async () => {
	loading.value = true;
	try {
		await Promise.all([
			fetchUsers(),
			fetchDatasets(),
			fetchCurrentPermissions()
		]);
	} catch (error) {
		showToast('加载数据失败', 'error');
	} finally {
		loading.value = false;
	}
});
</script>

<style scoped>
.permission-board {
	width: 100%;
	height: 100%;
}

.content {
	padding: 20px;
	display: flex;
	flex-direction: column;
	gap: 20px;
	height: 100%;
}

.filter-section {
	display: flex;
	gap: 16px;
	align-items: center;
	flex-wrap: wrap;
	padding: 16px;
	background: var(--theme--background);
	border-radius: 8px;
}

.search-bar {
	flex: 1;
	min-width: 250px;
}

.filter-bar {
	width: 200px;
	min-width: 150px;
}

.batch-actions {
	display: flex;
	gap: 8px;
}

.permission-matrix {
	flex: 1;
	min-height: 0;
}

.user-cell {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.user-info {
	display: flex;
	flex-direction: column;
}

.user-name {
	font-weight: 600;
	color: var(--theme--foreground);
}

.user-email {
	font-size: 0.85em;
	color: var(--theme--foreground-subdued);
}

.user-roles {
	display: flex;
	gap: 4px;
	flex-wrap: wrap;
}

.checkbox-cell {
	display: flex;
	justify-content: center;
	align-items: center;
	width: 100%;
	height: 100%;
}

:deep(.checkbox-cell .v-checkbox) {
	margin: 0;
	justify-content: center;
}

.pagination {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 16px;
	gap: 16px;
	background: var(--theme--background);
	border-radius: 8px;
}

.page-info {
	display: flex;
	align-items: center;
	gap: 16px;
}

.batch-form {
	display: flex;
	flex-direction: column;
	gap: 16px;
	margin: 16px 0;
}

.preview-content {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.preview-stats {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.preview-conflicts {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.preview-conflicts h4 {
	margin: 0 0 8px 0;
	color: var(--theme--danger);
}

.header-icon {
	--v-button-background-color: var(--theme--primary-background);
	--v-button-color: var(--theme--primary);
	--v-button-background-color-hover: var(--theme--primary-subdued);
}

:deep(.v-table) {
	height: 100%;
}

:deep(.v-table__fixed-header) {
	position: sticky;
	top: 0;
	z-index: 10;
}

@media (max-width: 1024px) {
	.filter-section {
		flex-direction: column;
		align-items: stretch;
	}

	.search-bar,
	.filter-bar {
		width: 100%;
	}

	.batch-actions {
		flex-wrap: wrap;
	}

	.permission-matrix {
		overflow-x: auto;
	}
}
</style>
