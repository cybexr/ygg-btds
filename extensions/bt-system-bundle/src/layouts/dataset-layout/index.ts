import { ref, computed } from 'vue';
import { defineLayout } from '@directus/extensions-sdk';
import LayoutComponent from './layout.vue';

export default defineLayout({
	id: 'dataset-layout',
	name: 'Dataset Layout',
	icon: 'table_view',
	component: LayoutComponent,
	slots: {
		options: () => null,
		sidebar: () => null,
		actions: () => null,
	},
	setup(props, { emit }) {
		const { collection } = props;
		const viewMode = ref<'table' | 'card'>('table');
		const selection = ref<Set<string | number>>(new Set());

		const layoutInfo = computed(() => ({
			viewMode: viewMode.value,
			hasSelection: selection.value.size > 0,
			selectionCount: selection.value.size,
			collection: collection,
		}));

		const layoutOptions = computed(() => ({
			allowViewSwitching: true,
			allowSelection: true,
			allowBatchActions: true,
			defaultViewMode: 'table',
		}));

		const toggleViewMode = (mode: 'table' | 'card') => {
			viewMode.value = mode;
		};

		const toggleSelection = (primaryKey: string | number) => {
			if (selection.value.has(primaryKey)) {
				selection.value.delete(primaryKey);
			} else {
				selection.value.add(primaryKey);
			}
		};

		const clearSelection = () => {
			selection.value.clear();
		};

		const selectAll = () => {
			// Select all logic
		};

		return {
			viewMode,
			selection,
			layoutInfo,
			layoutOptions,
			toggleViewMode,
			toggleSelection,
			clearSelection,
			selectAll,
		};
	},
});
