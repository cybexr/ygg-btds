<template>
	<div class="dataset-table-view">
		<!-- Table Controls -->
		<div class="table-controls">
			<div class="search-box">
				<v-input
					v-model="searchQuery"
					placeholder="搜索所有字段..."
					aria-label="搜索数据集项目"
					clearable
					@update:model-value="onSearchChange"
				>
					<template #prepend>
						<v-icon name="search" />
					</template>
				</v-input>
			</div>

			<div class="table-info" role="status" aria-live="polite">
				<span v-if="totalItems > 0" class="info-text">
					{{ formatNumber(startIndex + 1) }}-{{ formatNumber(Math.min(endIndex, totalItems)) }}
					/ {{ formatNumber(totalItems) }} 项
				</span>
				<span v-if="hasSelection" class="selection-info">
					已选择 {{ selection.size }} 项
				</span>
			</div>
		</div>

		<!-- Table Container -->
		<div class="table-container">
			<v-table
				v-model:selected="selection"
				:items="paginatedItems"
				:columns="tableColumns"
				:loading="loading"
				aria-label="数据集项目表格"
				fixed-header
				show-sort
				show-select
				:sort="sortField"
				@click:row="handleRowClick"
				@update:sort="handleSortChange"
			>
				<template #actions="{ item }">
					<v-button
						v-tooltip="'编辑'"
						icon
						x-small
						aria-label="编辑项目"
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
						aria-label="删除项目"
						@click="handleDelete(item)"
					>
						<template #icon>
							<v-icon name="delete" />
						</template>
					</v-button>
				</template>
			</v-table>
		</div>

		<!-- Empty State -->
		<div v-if="!loading && paginatedItems.length === 0" class="empty-state" role="status" aria-live="polite">
			<v-empty
				v-if="searchQuery"
				icon="search_off"
				title="未找到匹配的项"
				text="尝试调整搜索条件"
			/>
			<v-empty
				v-else
				icon="inbox"
				title="暂无数据"
				:text="`此集合中没有项目`"
			/>
		</div>

		<!-- Pagination -->
		<div v-if="totalPages > 1" class="table-pagination">
			<v-pagination
				v-model:page="currentPage"
				:length="totalPages"
				:total-items="totalItems"
				:items-per-page="itemsPerPage"
				aria-label="数据分页"
				show-first-last
				@update:page="handlePageChange"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import type { Field } from '@directus/types';

interface TableItem extends Record<string, unknown> {
	[key: string]: unknown;
}

interface TableColumn {
	field: string;
	name: string;
	width?: number;
	align?: 'left' | 'center' | 'right';
	sortable?: boolean;
}

interface Props {
	collection: string;
	primaryKey: string[];
	fields: Field[];
	items: TableItem[];
	loading?: boolean;
	itemsPerPage?: number;
}

interface Emits {
	(event: 'update:selection', selection: Set<string | number>): void;
	(event: 'update:options', options: Record<string, unknown>): void;
}

const props = withDefaults(defineProps<Props>(), {
	loading: false,
	itemsPerPage: 50,
});

const emit = defineEmits<Emits>();

// State
const searchQuery = ref('');
const currentPage = ref(1);
const sortField = ref<{ field: string; order: 'asc' | 'desc' } | null>(null);
const selection = ref<Set<string | number>>(new Set());

// Constants
const PAGE_SIZE = props.itemsPerPage;

// Computed
const tableColumns = computed<TableColumn[]>(() => {
	return props.fields.map((field) => ({
		field: field.field,
		name: field.name || field.field,
		width: field.meta?.width || undefined,
		align: field.meta?.align || 'left',
		sortable: field.meta?.sortable !== false,
	}));
});

const filteredAndSortedItems = computed<TableItem[]>(() => {
	let items = [...props.items];

	// Apply search filter
	if (searchQuery.value) {
		const term = searchQuery.value.toLowerCase();
		items = items.filter((item) => {
			return props.fields.some((field) => {
				const value = item[field.field];
				if (value === null || value === undefined) return false;
				return String(value).toLowerCase().includes(term);
			});
		});
	}

	// Apply sorting
	if (sortField.value) {
		const { field, order } = sortField.value;
		items.sort((a, b) => {
			const aVal = a[field];
			const bVal = b[field];

			// Handle null/undefined
			if (aVal == null) return 1;
			if (bVal == null) return -1;

			// Compare based on type
			let comparison = 0;
			if (typeof aVal === 'number' && typeof bVal === 'number') {
				comparison = aVal - bVal;
			} else {
				comparison = String(aVal).localeCompare(String(bVal));
			}

			return order === 'asc' ? comparison : -comparison;
		});
	}

	return items;
});

const totalItems = computed<number>(() => {
	return filteredAndSortedItems.value.length;
});

const totalPages = computed<number>(() => {
	return Math.ceil(totalItems.value / PAGE_SIZE);
});

const startIndex = computed<number>(() => {
	return (currentPage.value - 1) * PAGE_SIZE;
});

const endIndex = computed<number>(() => {
	return startIndex.value + PAGE_SIZE;
});

const paginatedItems = computed<TableItem[]>(() => {
	const start = startIndex.value;
	const end = endIndex.value;
	return filteredAndSortedItems.value.slice(start, end);
});

const hasSelection = computed<boolean>(() => {
	return selection.value.size > 0;
});

// Methods
const getPrimaryKey = (item: TableItem): string | number => {
	const key = props.primaryKey[0];
	return item[key] as string | number;
};

const formatNumber = (num: number): string => {
	return new Intl.NumberFormat().format(num);
};

const onSearchChange = useDebounceFn(() => {
	// Reset to first page when search changes
	currentPage.value = 1;
}, 300);

const handleRowClick = (item: TableItem) => {
	emit('update:options', {
		action: 'view',
		item: getPrimaryKey(item),
	});
};

const handleEdit = (item: TableItem) => {
	emit('update:options', {
		action: 'edit',
		item: getPrimaryKey(item),
	});
};

const handleDelete = (item: TableItem) => {
	emit('update:options', {
		action: 'delete',
		item: getPrimaryKey(item),
	});
};

const handleSortChange = (sort: { field: string; order: 'asc' | 'desc' } | null) => {
	sortField.value = sort;
};

const handlePageChange = (page: number) => {
	currentPage.value = page;
};

// Watchers
watch(selection, (newSelection) => {
	emit('update:selection', newSelection);
}, { deep: true });

// Reset current page if total pages decrease
watch(totalPages, (newTotalPages, oldTotalPages) => {
	if (newTotalPages > 0 && currentPage.value > newTotalPages) {
		currentPage.value = newTotalPages;
	}
});
</script>

<style scoped>
.dataset-table-view {
	display: flex;
	flex-direction: column;
	height: 100%;
	background-color: var(--background-normal);
}

.table-controls {
	display: flex;
	align-items: center;
	gap: 16px;
	padding: 16px;
	background-color: var(--background-normal);
	border-bottom: 1px solid var(--border-normal);
}

.search-box {
	flex: 1;
	max-width: 400px;
}

.table-info {
	display: flex;
	align-items: center;
	gap: 12px;
}

.info-text {
	color: var(--foreground-subdued);
	font-size: 14px;
	white-space: nowrap;
}

.selection-info {
	color: var(--primary);
	font-size: 14px;
	font-weight: 500;
	white-space: nowrap;
}

.table-container {
	flex: 1;
	overflow: auto;
	position: relative;
}

.empty-state {
	display: flex;
	justify-content: center;
	align-items: center;
	height: 100%;
	min-height: 300px;
}

.table-pagination {
	display: flex;
	justify-content: center;
	padding: 16px;
	background-color: var(--background-normal);
	border-top: 1px solid var(--border-normal);
}

.danger-action {
	color: var(--danger);
}

.danger-action:hover {
	background-color: var(--danger-10);
}

/* Responsive Design */
@media (max-width: 1024px) {
	.table-controls {
		flex-direction: column;
		align-items: stretch;
	}

	.search-box {
		max-width: none;
	}

	.table-info {
		justify-content: space-between;
	}
}
</style>
