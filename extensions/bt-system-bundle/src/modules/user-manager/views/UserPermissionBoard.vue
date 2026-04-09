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
				<v-button v-tooltip="'预览变更'" rounded icon @click="handlePreview" :disabled="!hasChanges || loading">
					<template #icon>
						<v-icon name="visibility" />
					</template>
				</v-button>
				<v-button v-tooltip="'保存权限'" rounded icon @click="handleSave" :disabled="!hasChanges || saving || loading">
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
							:disabled="loading"
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
							:disabled="loading"
						/>
					</div>

					<div class="filter-bar">
						<v-select
							v-model="datasetFilter"
							:items="datasetOptions"
							placeholder="筛选数据集"
							clearable
							@update:model-value="handleFilter"
							:disabled="loading"
						/>
					</div>

					<div class="batch-actions">
						<v-button @click="selectAllOnPage" :disabled="loading">
							全选当前页
						</v-button>
						<v-button @click="clearAllSelections" :disabled="loading || selectedPermissions.size === 0">
							清空选择
						</v-button>
						<v-button @click="showBatchGrantDialog = true" :disabled="selectedPermissions.size === 0 || loading">
							批量授权 ({{ selectedPermissions.size }})
						</v-button>
					</div>
				</div>

				<!-- 错误提示 -->
				<v-notice v-if="error" type="danger" class="error-notice">
					<div class="error-content">
						<div class="error-message">
							<v-icon name="error" class="error-icon" />
							<span>{{ error.message }}</span>
						</div>
						<v-button small @click="retryLastOperation" :loading="retrying">
							重试
						</v-button>
					</div>
				</v-notice>

				<!-- 加载状态 - 骨架屏 -->
				<div v-if="loading && !error" class="skeleton-container">
					<div v-for="i in 5" :key="i" class="skeleton-row">
						<div class="skeleton-cell skeleton-user"></div>
						<div class="skeleton-cell skeleton-checkbox"></div>
						<div class="skeleton-cell skeleton-checkbox"></div>
						<div v-for="j in activeDatasets.length" :key="j" class="skeleton-cell skeleton-checkbox"></div>
					</div>
				</div>

				<!-- 权限矩阵 -->
				<div v-else-if="paginatedUsers.length > 0" class="permission-matrix">
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
							<div
								class="checkbox-cell"
								:class="{ 'highlight-cell': isCellHighlighted(item.id, 'ds-descriptors', 'ds-descriptor-crud') }"
							>
								<v-checkbox
									:model-value="isPermissionEnabled(item.id, 'ds-descriptors', 'ds-descriptor-crud')"
									@update:model-value="(enabled) => handlePermissionChange(item.id, 'ds-descriptors', 'ds-descriptor-crud', enabled)"
								/>
							</div>
						</template>

						<template #item.ds-reader-read="{ item }">
							<div
								class="checkbox-cell"
								:class="{ 'highlight-cell': isCellHighlighted(item.id, 'ds-descriptors', 'ds-reader-read') }"
							>
								<v-checkbox
									:model-value="isPermissionEnabled(item.id, 'ds-descriptors', 'ds-reader-read')"
									@update:model-value="(enabled) => handlePermissionChange(item.id, 'ds-descriptors', 'ds-reader-read', enabled)"
								/>
							</div>
						</template>

						<template v-for="dataset in activeDatasets" :key="dataset.id" #[`item-dataset-${dataset.id}`]="{ item }">
							<div
								class="checkbox-cell"
								:class="{ 'highlight-cell': isCellHighlighted(item.id, dataset.collection_name, 'ds-reader-read') }"
							>
								<v-checkbox
									:model-value="isPermissionEnabled(item.id, dataset.collection_name, 'ds-reader-read')"
									@update:model-value="(enabled) => handlePermissionChange(item.id, dataset.collection_name, 'ds-reader-read', enabled)"
								/>
							</div>
						</template>
					</v-table>
				</div>

				<!-- 空状态 -->
				<div v-else class="empty-state">
					<v-icon :name="emptyStateIcon" class="empty-icon" />
					<h3 class="empty-title">{{ emptyStateTitle }}</h3>
					<p class="empty-description">{{ emptyStateDescription }}</p>
					<v-button v-if="searchTerm || roleFilter || datasetFilter" @click="clearFilters">
						清除筛选条件
					</v-button>
					<v-button v-else-if="!error" @click="refreshData" :loading="loading">
						<template #prepend>
							<v-icon name="refresh" />
						</template>
						刷新数据
					</v-button>
				</div>

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

				<!-- 变更提示 -->
				<v-slide-y-transition>
					<div v-if="hasChanges && !showConfirmDialog" class="changes-pending-bar">
						<div class="changes-pending-content">
							<v-icon name="info" class="changes-icon" />
							<span class="changes-text">您有 {{ pendingChanges.size }} 条权限变更待保存</span>
							<div class="changes-actions">
								<v-button small secondary @click="discardChanges">
									放弃变更
								</v-button>
								<v-button small @click="handleSave">
									立即保存
								</v-button>
							</div>
						</div>
					</div>
				</v-slide-y-transition>

				<div v-if="hasBatchFeedback" class="batch-feedback-panel">
					<div class="batch-feedback-header">
						<div>
							<div class="batch-feedback-title">批量变更摘要</div>
							<div class="batch-feedback-subtitle">本次操作已更新 {{ batchAffectedPermissions.size }} 个权限单元格</div>
						</div>
						<v-button small secondary @click="clearBatchFeedback">
							清除高亮
						</v-button>
					</div>
					<div class="batch-feedback-stats">
						<div class="feedback-stat feedback-stat-created">
							<span class="feedback-stat-label">新增</span>
							<strong>{{ batchChangesSummary.created }}</strong>
						</div>
						<div class="feedback-stat feedback-stat-updated">
							<span class="feedback-stat-label">更新</span>
							<strong>{{ batchChangesSummary.updated }}</strong>
						</div>
						<div class="feedback-stat feedback-stat-deleted">
							<span class="feedback-stat-label">删除</span>
							<strong>{{ batchChangesSummary.deleted }}</strong>
						</div>
					</div>
					<div class="batch-feedback-actions">
						<v-button small @click="showBatchDetailsDialog = true">
							查看详情
						</v-button>
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
					<div v-else-if="previewLoading" class="preview-loading">
						<v-progress-circular indeterminate />
						<p>正在生成预览...</p>
					</div>
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

		<!-- 确认放弃变更对话框 -->
		<v-dialog v-model="showDiscardDialog">
			<v-card>
				<v-card-title>确认放弃变更</v-card-title>
				<v-card-text>
					<p>您即将放弃 <strong>{{ pendingChanges.size }}</strong> 条未保存的权限变更。</p>
					<v-notice type="warning">
						此操作不可撤销，所有未保存的变更将会丢失。
					</v-notice>
				</v-card-text>
				<v-card-actions>
					<v-button @click="showDiscardDialog = false">取消</v-button>
					<v-button
						color="danger"
						@click="confirmDiscardChanges"
					>
						确认放弃
					</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- 批量变更详情对话框 -->
		<v-dialog v-model="showBatchDetailsDialog" @update:model-value="handleBatchDetailsDialogClose">
			<v-card>
				<v-card-title>批量权限变更详情</v-card-title>
				<v-card-text>
					<div v-if="batchChangeDetails.length > 0" class="batch-detail-table">
						<div class="batch-detail-header">
							<span>用户</span>
							<span>数据集</span>
							<span>模板</span>
							<span>操作</span>
							<span>修改前</span>
							<span>修改后</span>
						</div>
						<div
							v-for="detail in batchChangeDetails"
							:key="detail.key"
							class="batch-detail-row"
						>
							<span>{{ detail.user }}</span>
							<span>{{ detail.dataset }}</span>
							<span>{{ detail.templateLabel }}</span>
							<span :class="['batch-detail-action', `batch-detail-action-${detail.action}`]">
								{{ getBatchActionLabel(detail.action) }}
							</span>
							<span>{{ formatPermissionState(detail.before) }}</span>
							<span>{{ formatPermissionState(detail.after) }}</span>
						</div>
					</div>
					<v-notice v-else type="info">
						暂无批量变更详情
					</v-notice>
				</v-card-text>
				<v-card-actions>
					<v-button @click="showBatchDetailsDialog = false">关闭</v-button>
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

interface BatchChangeDetail {
	key: string;
	user: string;
	dataset: string;
	template: string;
	templateLabel: string;
	action: 'created' | 'updated' | 'deleted';
	before: boolean;
	after: boolean;
}

interface TableColumn {
	field: string;
	name: string;
	width?: number;
	align?: 'left' | 'center' | 'right';
	sortable?: boolean;
}

interface ErrorState {
	message: string;
	operation?: string;
}

const api = useApi();

const users = ref<User[]>([]);
const datasets = ref<Dataset[]>([]);
const currentPermissions = ref<UserPermission[]>([]);
const permissionChanges = ref(new Map<string, UserPermission>());

const loading = ref(false);
const saving = ref(false);
const previewLoading = ref(false);
const batchProcessing = ref(false);
const retrying = ref(false);
const error = ref<ErrorState | null>(null);
const lastFailedOperation = ref<(() => Promise<void>) | null>(null);

const searchTerm = ref('');
const roleFilter = ref<string | null>(null);
const datasetFilter = ref<string | null>(null);
const currentPage = ref(1);
const itemsPerPage = ref(50);

const showBatchGrantDialog = ref(false);
const showPreviewDialog = ref(false);
const showConfirmDialog = ref(false);
const showDiscardDialog = ref(false);
const showBatchDetailsDialog = ref(false);
const previewData = ref<any>(null);

const batchTemplate = ref('ds-reader-read');
const batchEnabled = ref(true);

const selectedPermissions = ref<Set<string>>(new Set());
const batchAffectedPermissions = ref<Set<string>>(new Set());
const batchChangeDetails = ref<BatchChangeDetail[]>([]);
const batchHighlightTimer = ref<ReturnType<typeof setTimeout> | null>(null);

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
	return permissionChanges.value.size > 0;
});

const pendingChanges = computed(() => {
	return permissionChanges.value;
});

const hasBatchFeedback = computed(() => {
	return batchChangeDetails.value.length > 0;
});

const batchChangesSummary = computed(() => {
	return batchChangeDetails.value.reduce(
		(summary, detail) => {
			summary[detail.action] += 1;
			return summary;
		},
		{ created: 0, updated: 0, deleted: 0 }
	);
});

const emptyStateTitle = computed(() => {
	if (error.value) return '加载失败';
	if (searchTerm.value || roleFilter.value || datasetFilter.value) return '未找到匹配的用户';
	return '暂无用户数据';
});

const emptyStateDescription = computed(() => {
	if (error.value) return error.value.message;
	if (searchTerm.value || roleFilter.value || datasetFilter.value) return '请尝试调整筛选条件或清除筛选';
	return '系统中还没有用户，请先创建用户';
});

const emptyStateIcon = computed(() => {
	if (error.value) return 'error_outline';
	if (searchTerm.value || roleFilter.value || datasetFilter.value) return 'search_off';
	return 'inbox';
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
	} catch (err: any) {
		throw new Error(`获取用户列表失败: ${err.message || '未知错误'}`);
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
	} catch (err: any) {
		throw new Error(`获取数据集列表失败: ${err.message || '未知错误'}`);
	}
};

const fetchCurrentPermissions = async () => {
	try {
		const response = await api.get('/custom/permissions/current');

		if (response.data && Array.isArray(response.data.data)) {
			currentPermissions.value = response.data.data;
		}
	} catch (err: any) {
		throw new Error(`获取当前权限失败: ${err.message || '未知错误'}`);
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

	if (permissionChanges.value.has(key)) {
		return permissionChanges.value.get(key)!.enabled;
	}

	return currentPermissions.value.some(
		p => p.user_id === userId && p.library_id === libraryId && p.template === template && p.enabled
	);
};

const handlePermissionChange = (userId: string, libraryId: string, template: string, enabled: boolean) => {
	const key = getPermissionKey(userId, libraryId, template);
	permissionChanges.value.set(key, {
		user_id: userId,
		library_id: libraryId,
		template,
		enabled
	});
};

const findCurrentPermission = (userId: string, libraryId: string, template: string) => {
	return currentPermissions.value.find(
		permission => permission.user_id === userId && permission.library_id === libraryId && permission.template === template
	);
};

const getBatchActionType = (before: boolean, after: boolean, hadPendingChange: boolean): BatchChangeDetail['action'] => {
	if (before !== after) {
		if (after) return before ? 'updated' : 'created';
		return 'deleted';
	}

	return hadPendingChange ? 'updated' : 'created';
};

const getTemplateLabel = (template: string) => {
	const matched = templateOptions.find(option => option.value === template);
	return matched?.text || template;
};

const getDatasetLabel = (libraryId: string) => {
	if (libraryId === 'ds-descriptors') {
		return '描述符库';
	}

	const dataset = datasets.value.find(item => item.collection_name === libraryId);
	return dataset?.display_name || libraryId;
};

const getUserDisplayName = (userId: string) => {
	const user = users.value.find(item => item.id === userId);
	if (!user) return userId;

	const name = `${user.first_name} ${user.last_name}`.trim();
	return name ? `${name} (${user.email})` : user.email;
};

const clearBatchFeedback = () => {
	if (batchHighlightTimer.value) {
		clearTimeout(batchHighlightTimer.value);
		batchHighlightTimer.value = null;
	}

	batchAffectedPermissions.value = new Set();
	batchChangeDetails.value = [];
	showBatchDetailsDialog.value = false;
};

const scheduleBatchFeedbackClear = () => {
	if (batchHighlightTimer.value) {
		clearTimeout(batchHighlightTimer.value);
	}

	batchHighlightTimer.value = setTimeout(() => {
		clearBatchFeedback();
	}, 4000);
};

const isCellHighlighted = (userId: string, libraryId: string, template: string) => {
	return batchAffectedPermissions.value.has(getPermissionKey(userId, libraryId, template));
};

const getBatchActionLabel = (action: BatchChangeDetail['action']) => {
	switch (action) {
		case 'created': return '新增';
		case 'updated': return '更新';
		case 'deleted': return '删除';
		default: return action;
	}
};

const formatPermissionState = (enabled: boolean) => {
	return enabled ? '启用' : '关闭';
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

const applyBatchGrant = async () => {
	batchProcessing.value = true;

	try {
		clearBatchFeedback();

		const detailsByKey = new Map<string, BatchChangeDetail>();

		selectedPermissions.value.forEach(key => {
			const [userId, libraryId] = key.split(':');
			const newKey = getPermissionKey(userId, libraryId, batchTemplate.value);
			const currentPermission = findCurrentPermission(userId, libraryId, batchTemplate.value);
			const previousPending = permissionChanges.value.get(newKey);
			const before = previousPending?.enabled ?? currentPermission?.enabled ?? false;
			const after = batchEnabled.value;

			permissionChanges.value.set(newKey, {
				user_id: userId,
				library_id: libraryId,
				template: batchTemplate.value,
				enabled: after
			});

			detailsByKey.set(newKey, {
				key: newKey,
				user: getUserDisplayName(userId),
				dataset: getDatasetLabel(libraryId),
				template: batchTemplate.value,
				templateLabel: getTemplateLabel(batchTemplate.value),
				action: getBatchActionType(before, after, Boolean(previousPending)),
				before,
				after
			});
		});

		batchAffectedPermissions.value = new Set(detailsByKey.keys());
		batchChangeDetails.value = Array.from(detailsByKey.values()).sort((left, right) => {
			return left.user.localeCompare(right.user, 'zh-CN') || left.dataset.localeCompare(right.dataset, 'zh-CN');
		});
		scheduleBatchFeedbackClear();
		clearAllSelections();
		showBatchGrantDialog.value = false;
		showToast('批量授权已应用，请保存以生效', 'success');
	} finally {
		batchProcessing.value = false;
	}
};

const handlePreview = async () => {
	if (!hasChanges.value) return;

	showPreviewDialog.value = true;
	previewLoading.value = true;
	previewData.value = null;

	try {
		const requestData = {
			user_library_permissions: Array.from(permissionChanges.value.values())
		};

		const response = await api.post('/custom/permissions/preview', requestData);

		if (response.data && response.data.success) {
			previewData.value = response.data.data;
		}
	} catch (err: any) {
		console.error('预览失败:', err);
		showToast(`预览失败: ${err.message || '未知错误'}`, 'error');
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
	error.value = null;

	try {
		const requestData = {
			user_library_permissions: Array.from(permissionChanges.value.values())
		};

		const response = await api.post('/custom/permissions/sync', requestData);

		if (response.data && response.data.success) {
			showToast('权限保存成功', 'success');
			permissionChanges.value.clear();
			clearBatchFeedback();
			await fetchCurrentPermissions();
		}
	} catch (err: any) {
		console.error('保存失败:', err);
		error.value = {
			message: err.response?.data?.errors?.[0]?.message || err.message || '保存失败，请稍后重试',
			operation: 'save'
		};
		lastFailedOperation.value = executeSave;
		showToast('保存失败', 'error');
	} finally {
		saving.value = false;
		showConfirmDialog.value = false;
	}
};

const discardChanges = () => {
	if (!hasChanges.value) return;
	showDiscardDialog.value = true;
};

const confirmDiscardChanges = () => {
	permissionChanges.value.clear();
	clearBatchFeedback();
	showDiscardDialog.value = false;
	showToast('已放弃所有未保存的变更', 'info');
};

const retryLastOperation = async () => {
	if (!lastFailedOperation.value) return;

	retrying.value = true;
	error.value = null;

	try {
		await lastFailedOperation.value();
		lastFailedOperation.value = null;
	} catch (err) {
		// Error will be set by the failed operation
	} finally {
		retrying.value = false;
	}
};

const clearFilters = () => {
	searchTerm.value = '';
	roleFilter.value = null;
	datasetFilter.value = null;
	currentPage.value = 1;
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

const handleBatchDetailsDialogClose = (value: boolean) => {
	showBatchDetailsDialog.value = value;
};

const refreshData = async () => {
	loading.value = true;
	error.value = null;

	try {
		await Promise.all([
			fetchUsers(),
			fetchDatasets(),
			fetchCurrentPermissions()
		]);
		showToast('数据已刷新', 'success');
	} catch (err: any) {
		error.value = {
			message: err.message || '加载数据失败',
			operation: 'refresh'
		};
		lastFailedOperation.value = refreshData;
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
	error.value = null;

	try {
		await Promise.all([
			fetchUsers(),
			fetchDatasets(),
			fetchCurrentPermissions()
		]);
	} catch (err: any) {
		error.value = {
			message: err.message || '加载数据失败',
			operation: 'load'
		};
		lastFailedOperation.value = refreshData;
		showToast('加载数据失败', 'error');
	} finally {
		loading.value = false;
	}
});

onBeforeUnmount(() => {
	clearBatchFeedback();
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

.error-notice {
	width: 100%;
}

.error-content {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
}

.error-message {
	display: flex;
	align-items: center;
	gap: 8px;
	flex: 1;
}

.error-icon {
	color: var(--theme--danger);
}

/* 骨架屏样式 */
.skeleton-container {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 16px;
	background: var(--theme--background);
	border-radius: 8px;
}

.skeleton-row {
	display: flex;
	gap: 12px;
	align-items: center;
	padding: 12px 0;
	border-bottom: 1px solid var(--theme--border-subdued);
}

.skeleton-cell {
	border-radius: 6px;
	animation: skeleton-loading 1.5s ease-in-out infinite;
	background: linear-gradient(
		90deg,
		var(--theme--background-subdued) 0%,
		var(--theme--background-subdued) 40%,
		var(--theme--border-subdued) 50%,
		var(--theme--background-subdued) 60%,
		var(--theme--background-subdued) 100%
	);
	background-size: 200% 100%;
}

@keyframes skeleton-loading {
	0% {
		background-position: 200% 0;
	}
	100% {
		background-position: -200% 0;
	}
}

.skeleton-user {
	width: 250px;
	height: 48px;
}

.skeleton-checkbox {
	width: 80px;
	height: 32px;
}

/* 空状态样式 */
.empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 60px 20px;
	text-align: center;
	background: var(--theme--background);
	border-radius: 8px;
}

.empty-icon {
	width: 64px;
	height: 64px;
	color: var(--theme--foreground-subdued);
	margin-bottom: 16px;
	opacity: 0.5;
}

.empty-title {
	font-size: 1.1rem;
	font-weight: 600;
	color: var(--theme--foreground);
	margin: 0 0 8px 0;
}

.empty-description {
	font-size: 0.9rem;
	color: var(--theme--foreground-subdued);
	margin: 0 0 24px 0;
	max-width: 400px;
}

/* 变更提示栏 */
.changes-pending-bar {
	position: sticky;
	bottom: 0;
	z-index: 20;
	background: var(--theme--primary-background);
	border: 1px solid var(--theme--primary);
	border-radius: 12px;
	box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
}

.changes-pending-content {
	display: flex;
	align-items: center;
	gap: 16px;
	padding: 14px 20px;
}

.changes-icon {
	color: var(--theme--primary);
	flex-shrink: 0;
}

.changes-text {
	flex: 1;
	font-weight: 500;
	color: var(--theme--foreground);
}

.changes-actions {
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
	border: 2px solid transparent;
	border-radius: 10px;
	transition: background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.highlight-cell {
	background: var(--theme--primary-subdued);
	border-color: var(--theme--primary);
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme--primary) 18%, transparent);
	animation: highlight-fade 4s ease-out forwards;
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

.batch-feedback-panel {
	position: fixed;
	right: 24px;
	bottom: 24px;
	width: min(360px, calc(100vw - 32px));
	padding: 18px;
	border-radius: 14px;
	border: 1px solid var(--theme--primary-subdued);
	background: color-mix(in srgb, var(--theme--background-page) 92%, var(--theme--primary-subdued));
	box-shadow: 0 18px 48px rgba(15, 23, 42, 0.14);
	z-index: 30;
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.batch-feedback-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}

.batch-feedback-title {
	font-size: 1rem;
	font-weight: 700;
	color: var(--theme--foreground);
}

.batch-feedback-subtitle {
	margin-top: 4px;
	font-size: 0.85rem;
	color: var(--theme--foreground-subdued);
}

.batch-feedback-stats {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 10px;
}

.feedback-stat {
	padding: 12px;
	border-radius: 12px;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.feedback-stat-created {
	background: color-mix(in srgb, var(--theme--success) 12%, transparent);
	color: var(--theme--success);
}

.feedback-stat-updated {
	background: color-mix(in srgb, var(--theme--primary) 12%, transparent);
	color: var(--theme--primary);
}

.feedback-stat-deleted {
	background: color-mix(in srgb, var(--theme--danger) 12%, transparent);
	color: var(--theme--danger);
}

.feedback-stat-label {
	font-size: 0.8rem;
	color: var(--theme--foreground-subdued);
}

.batch-feedback-actions {
	display: flex;
	justify-content: flex-end;
}

.batch-detail-table {
	display: flex;
	flex-direction: column;
	max-height: 420px;
	overflow: auto;
	border: 1px solid var(--theme--border-subdued);
	border-radius: 12px;
}

.batch-detail-header,
.batch-detail-row {
	display: grid;
	grid-template-columns: 1.4fr 1fr 1fr 0.8fr 0.8fr 0.8fr;
	gap: 12px;
	align-items: center;
	padding: 12px 14px;
}

.batch-detail-header {
	position: sticky;
	top: 0;
	background: var(--theme--background-page);
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--theme--foreground-subdued);
}

.batch-detail-row {
	border-top: 1px solid var(--theme--border-subdued);
	font-size: 0.9rem;
}

.batch-detail-action {
	font-weight: 700;
}

.batch-detail-action-created {
	color: var(--theme--success);
}

.batch-detail-action-updated {
	color: var(--theme--primary);
}

.batch-detail-action-deleted {
	color: var(--theme--danger);
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

.preview-loading {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 16px;
	padding: 20px;
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

@keyframes highlight-fade {
	0% {
		background: color-mix(in srgb, var(--theme--primary) 24%, transparent);
		border-color: var(--theme--primary);
	}

	70% {
		background: color-mix(in srgb, var(--theme--primary-subdued) 100%, transparent);
		border-color: var(--theme--primary);
	}

	100% {
		background: transparent;
		border-color: transparent;
		box-shadow: none;
	}
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

	.batch-feedback-panel {
		left: 16px;
		right: 16px;
		bottom: 16px;
		width: auto;
	}

	.batch-feedback-stats,
	.batch-detail-header,
	.batch-detail-row {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.changes-pending-content {
		flex-direction: column;
		align-items: stretch;
	}

	.changes-actions {
		width: 100%;
	}

	.changes-actions :deep(.v-button) {
		flex: 1;
	}
}
</style>
