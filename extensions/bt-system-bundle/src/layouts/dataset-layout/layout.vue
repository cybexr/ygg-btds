<template>
	<div class="dataset-layout" :class="`view-${viewMode}`">
		<!-- Layout Header -->
		<div class="layout-header">
			<div class="header-left">
				<div class="collection-info">
					<v-icon name="folder_open" />
					<span class="collection-name">{{ collection }}</span>
					<span v-if="itemCount !== null" class="item-count">({{ formatNumber(itemCount) }})</span>
				</div>
			</div>

			<div class="header-actions">
				<!-- View Toggle -->
				<v-button-group>
					<v-button
						:class="{ active: viewMode === 'table' }"
						v-tooltip="'表格视图'"
						icon
						@click="$emit('toggle-view', 'table')"
					>
						<template #icon>
							<v-icon name="table_view" />
						</template>
					</v-button>
					<v-button
						:class="{ active: viewMode === 'card' }"
						v-tooltip="'卡片视图'"
						icon
						@click="$emit('toggle-view', 'card')"
					>
						<template #icon>
							<v-icon name="grid_view" />
						</template>
					</v-button>
				</v-button-group>

				<!-- Selection Actions -->
				<v-button
					v-if="hasSelection"
					v-tooltip="'清空选择'"
					icon
					@click="clearSelection"
				>
					<template #icon>
						<v-icon name="close" />
					</template>
				</v-button>
			</div>
		</div>

		<!-- Search and Filter Bar -->
		<div class="layout-controls">
			<div class="search-bar">
				<v-input
					v-model="searchTerm"
					placeholder="搜索..."
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
					v-model="filterField"
					:items="filterableFields"
					placeholder="筛选字段"
					clearable
					@update:model-value="handleFilter"
				/>
			</div>
		</div>

		<!-- Layout Content -->
		<div class="layout-content">
			<v-notice v-if="collectionError" type="danger" class="collection-error-notice">
				{{ collectionError }}
			</v-notice>

			<!-- Table View -->
			<div v-if="viewMode === 'table'" class="table-view">
				<v-table
					:items="filteredItems"
					:columns="tableColumns"
					:loading="loading"
					fixed-header
					show-sort
					:sort="sortField"
					@click:row="handleRowClick"
				>
					<template #item.prepend="{ item }">
						<v-checkbox
							:model-value="isItemSelected(item)"
							@update:model-value="toggleSelection(item)"
							clickable
						/>
					</template>

					<template #item-actions="{ item }">
						<v-button
							v-tooltip="'编辑'"
							icon
							x-small
							@click="handleEdit(item)"
						>
							<template #icon>
								<v-icon name="edit" />
							</template>
						</v-button>
						<v-button
							v-tooltip="'删除'"
							icon
							x-small
							class="danger-action"
							@click="handleDelete(item)"
						>
							<template #icon>
								<v-icon name="delete" />
							</template>
						</v-button>
					</template>
				</v-table>
			</div>

			<!-- Card View -->
			<div v-else class="card-view">
				<div class="card-grid">
					<div
						v-for="item in filteredItems"
						:key="getPrimaryKey(item)"
						class="card-item"
						:class="{ selected: isItemSelected(item) }"
						@click="handleCardClick(item)"
					>
						<div class="card-header">
							<v-checkbox
								:model-value="isItemSelected(item)"
								@update:model-value="toggleSelection(item)"
								@click.stop
							/>
							<h3 class="card-title">{{ getCardTitle(item) }}</h3>
							<v-button
								v-tooltip="'编辑'"
								icon
								x-small
								@click.stop="handleEdit(item)"
							>
								<template #icon>
									<v-icon name="edit" />
								</template>
							</v-button>
						</div>
						<div class="card-content">
							<div
								v-for="field in displayFields"
								:key="field.field"
								class="card-field"
							>
								<span class="field-label">{{ field.name }}:</span>
								<span class="field-value">{{ formatFieldValue(item, field.field) }}</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Empty State -->
			<div v-if="!loading && filteredItems.length === 0" class="empty-state">
				<v-empty
					v-if="searchTerm || filterField"
					icon="search_off"
					title="未找到匹配的项"
					text="尝试调整搜索或筛选条件"
				/>
				<v-empty
					v-else
					icon="inbox"
					title="暂无数据"
					:text="`此集合中没有项目`"
				/>
			</div>

			<!-- Loading State -->
			<div v-if="loading" class="loading-state">
				<v-skeleton-loader v-for="i in 6" :key="i" type="card" />
			</div>
		</div>

		<!-- Pagination -->
		<div v-if="totalPages > 1" class="layout-pagination">
			<v-pagination
				v-model:page="currentPage"
				:length="totalPages"
				:total-items="totalItems"
				:items-per-page="itemsPerPage"
				show-first-last
				@update:page="handlePageChange"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useApi, useStores } from '@directus/extensions-sdk';
import { useCollectionValidation } from './composables/useCollectionValidation';
import type { Field } from '@directus/types';

interface Props {
	collection: string;
	primaryKey: string[];
	fields: Field[];
	items: Record<string, unknown>[];
	loading?: boolean;
}

interface Emits {
	(event: 'toggle-view', mode: 'table' | 'card'): void;
	(event: 'selection-change', selection: (string | number)[]): void;
	(event: 'update:options', options: Record<string, unknown>): void;
}

const props = withDefaults(defineProps<Props>(), {
	loading: false,
});

const emit = defineEmits<Emits>();

const api = useApi();
const { useFieldsStore } = useStores();
const fieldsStore = useFieldsStore();
const collectionValidation = useCollectionValidation();

const viewMode = ref<'table' | 'card'>('table');
const searchTerm = ref('');
const filterField = ref<string | null>(null);
const filterValue = ref<string>('');
const selection = ref<Set<string | number>>(new Set());

const sortField = ref<string | null>(null);
const currentPage = ref(1);
const itemsPerPage = ref(50);

const itemCount = ref<number | null>(null);
const totalItems = ref(0);
const collectionError = computed(() => collectionValidation.validationError.value);

const filterableFields = computed(() => {
	return props.fields
		.filter((field) => {
			const fieldMeta = fieldsStore.getField(props.collection, field.field);
			return fieldMeta?.type !== 'json' && !fieldMeta?.schema?.is_nullable;
		})
		.map((field) => ({
			text: field.name || field.field,
			value: field.field,
		}));
});

const displayFields = computed(() => {
	return props.fields.slice(0, 4);
});

const tableColumns = computed(() => {
	return props.fields.map((field) => ({
		field: field.field,
		name: field.name || field.field,
		width: field.meta?.width || undefined,
		align: field.meta?.align || 'left',
		sortable: field.meta?.sortable !== false,
	}));
});

const filteredItems = computed(() => {
	let items = [...props.items];

	if (searchTerm.value) {
		const term = searchTerm.value.toLowerCase();
		items = items.filter((item) => {
			return props.fields.some((field) => {
				const value = item[field.field];
				return String(value).toLowerCase().includes(term);
			});
		});
	}

	if (filterField.value && filterValue.value) {
		items = items.filter((item) => {
			const value = item[filterField.value!];
			return String(value).toLowerCase().includes(filterValue.value.toLowerCase());
		});
	}

	if (sortField.value) {
		items.sort((a, b) => {
			const aVal = a[sortField.value!];
			const bVal = b[sortField.value!];
			return String(aVal).localeCompare(String(bVal));
		});
	}

	totalItems.value = items.length;

	const start = (currentPage.value - 1) * itemsPerPage.value;
	const end = start + itemsPerPage.value;

	return items.slice(start, end);
});

const totalPages = computed(() => {
	return Math.ceil(totalItems.value / itemsPerPage.value);
});

const hasSelection = computed(() => selection.value.size > 0);

const getPrimaryKey = (item: Record<string, unknown>): string | number => {
	const key = props.primaryKey[0];
	return item[key] as string | number;
};

const isItemSelected = (item: Record<string, unknown>): boolean => {
	return selection.value.has(getPrimaryKey(item));
};

const getCardTitle = (item: Record<string, unknown>): string => {
	const titleField = props.fields.find((f) => f.field === 'name' || f.field === 'title');
	if (titleField) {
		return String(item[titleField.field] || getPrimaryKey(item));
	}
	return String(getPrimaryKey(item));
};

const formatFieldValue = (item: Record<string, unknown>, field: string): string => {
	const value = item[field];
	if (value === null || value === undefined) return '-';
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
};

const formatNumber = (num: number): string => {
	return new Intl.NumberFormat().format(num);
};

const handleSearch = () => {
	currentPage.value = 1;
};

const handleFilter = () => {
	currentPage.value = 1;
};

const handleRowClick = (item: Record<string, unknown>) => {
	emit('update:options', { item: getPrimaryKey(item), action: 'view' });
};

const handleCardClick = (item: Record<string, unknown>) => {
	emit('update:options', { item: getPrimaryKey(item), action: 'view' });
};

const handleEdit = (item: Record<string, unknown>) => {
	emit('update:options', { item: getPrimaryKey(item), action: 'edit' });
};

const handleDelete = (item: Record<string, unknown>) => {
	emit('update:options', { item: getPrimaryKey(item), action: 'delete' });
};

const toggleSelection = (item: Record<string, unknown>) => {
	const key = getPrimaryKey(item);
	if (selection.value.has(key)) {
		selection.value.delete(key);
	} else {
		selection.value.add(key);
	}
	emit('selection-change', Array.from(selection.value));
};

const clearSelection = () => {
	selection.value.clear();
	emit('selection-change', []);
};

const handlePageChange = (page: number) => {
	currentPage.value = page;
};

const loadItemCount = async () => {
	const validation = collectionValidation.validateCollection(props.collection);
	if (!validation.isValid) {
		itemCount.value = null;
		return;
	}

	collectionValidation.clearValidationError();

	try {
		const response = await api.get(`/items/${validation.sanitized}`, {
			params: {
				limit: 0,
				meta: 'total_count',
			},
		});
		itemCount.value = response.data?.meta?.total_count || 0;
	} catch (error) {
		collectionValidation.validationError.value = '集合统计加载失败，请稍后重试';
		console.error('Failed to load item count:', error);
	}
};

watch(() => props.collection, loadItemCount, { immediate: true });

onMounted(() => {
	loadItemCount();
});
</script>

<style scoped>
.dataset-layout {
	display: flex;
	flex-direction: column;
	height: 100%;
	background-color: var(--background-normal);
}

.layout-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 16px 20px;
	background-color: var(--background-normal);
	border-bottom: 1px solid var(--border-normal);
}

.header-left {
	display: flex;
	align-items: center;
	gap: 16px;
}

.collection-info {
	display: flex;
	align-items: center;
	gap: 8px;
}

.collection-name {
	font-weight: 600;
	font-size: 16px;
	color: var(--foreground-normal);
}

.item-count {
	color: var(--foreground-subdued);
	font-size: 14px;
}

.header-actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.layout-controls {
	display: flex;
	gap: 16px;
	padding: 16px 20px;
	background-color: var(--background-normal);
	border-bottom: 1px solid var(--border-normal);
}

.search-bar {
	flex: 1;
	max-width: 400px;
}

.filter-bar {
	flex: 1;
	max-width: 300px;
}

.layout-content {
	flex: 1;
	overflow: auto;
	padding: 20px;
}

.collection-error-notice {
	margin-bottom: 16px;
}

.table-view {
	height: 100%;
}

.card-view {
	height: 100%;
}

.card-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
	gap: 16px;
}

.card-item {
	padding: 16px;
	background-color: var(--background-subtle);
	border: 2px solid var(--border-normal);
	border-radius: 8px;
	cursor: pointer;
	transition: all 0.2s ease;
}

.card-item:hover {
	border-color: var(--primary);
	background-color: var(--background-highlight);
}

.card-item.selected {
	border-color: var(--primary);
	background-color: var(--primary-10);
}

.card-header {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 12px;
}

.card-title {
	flex: 1;
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	color: var(--foreground-normal);
}

.card-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.card-field {
	display: flex;
	gap: 8px;
	font-size: 14px;
}

.field-label {
	font-weight: 500;
	color: var(--foreground-subdued);
	min-width: 100px;
}

.field-value {
	color: var(--foreground-normal);
	word-break: break-word;
}

.empty-state,
.loading-state {
	display: flex;
	justify-content: center;
	align-items: center;
	height: 100%;
	min-height: 300px;
}

.loading-state {
	flex-direction: column;
	gap: 16px;
}

.layout-pagination {
	display: flex;
	justify-content: center;
	padding: 16px;
	background-color: var(--background-normal);
	border-top: 1px solid var(--border-normal);
}

.active {
	background-color: var(--primary);
	color: var(--foreground-inverted);
}

.danger-action {
	color: var(--danger);
}

.danger-action:hover {
	background-color: var(--danger-10);
}

.v-button.active {
	background-color: var(--primary-10);
	color: var(--primary);
}
</style>
