import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DatasetTableView from '../DatasetTableView.vue';

describe('DatasetTableView', () => {
	const mockFields = [
		{ field: 'id', name: 'ID', type: 'integer', meta: { sortable: true } },
		{ field: 'name', name: 'Name', type: 'string', meta: { sortable: true } },
		{ field: 'email', name: 'Email', type: 'string', meta: { sortable: true } },
		{ field: 'status', name: 'Status', type: 'string', meta: { sortable: false } },
	];

	const mockItems = [
		{ id: 1, name: 'Alice', email: 'alice@example.com', status: 'active' },
		{ id: 2, name: 'Bob', email: 'bob@example.com', status: 'inactive' },
		{ id: 3, name: 'Charlie', email: 'charlie@example.com', status: 'active' },
	];

	const createWrapper = (props = {}) => {
		return mount(DatasetTableView, {
			props: {
				collection: 'test_collection',
				primaryKey: ['id'],
				fields: mockFields,
				items: mockItems,
				loading: false,
				itemsPerPage: 50,
				...props,
			},
		});
	};

	describe('基础渲染', () => {
		it('应该正确渲染表格视图', () => {
			const wrapper = createWrapper();
			expect(wrapper.find('.dataset-table-view').exists()).toBe(true);
			expect(wrapper.find('.table-controls').exists()).toBe(true);
			expect(wrapper.find('.table-container').exists()).toBe(true);
		});

		it('应该显示正确的列头', () => {
			const wrapper = createWrapper();
			// Verify columns are rendered correctly
			expect(wrapper.vm.tableColumns).toHaveLength(4);
			expect(wrapper.vm.tableColumns[0].field).toBe('id');
			expect(wrapper.vm.tableColumns[0].name).toBe('ID');
		});
	});

	describe('搜索功能', () => {
		it('应该根据搜索词过滤项目', async () => {
			const wrapper = createWrapper();
			await wrapper.vm.searchQuery = 'Alice';
			await wrapper.vm.onSearchChange();

			expect(wrapper.vm.filteredAndSortedItems).toHaveLength(1);
			expect(wrapper.vm.filteredAndSortedItems[0].name).toBe('Alice');
		});

		it('应该在所有字段中搜索', async () => {
			const wrapper = createWrapper();
			await wrapper.vm.searchQuery = 'example';
			await wrapper.vm.onSearchChange();

			expect(wrapper.vm.filteredAndSortedItems).toHaveLength(3);
		});

		it('应该重置分页到第一页当搜索改变时', async () => {
			const wrapper = createWrapper();
			wrapper.vm.currentPage = 2;
			await wrapper.vm.searchQuery = 'test';
			await wrapper.vm.onSearchChange();

			expect(wrapper.vm.currentPage).toBe(1);
		});
	});

	describe('分页功能', () => {
		it('应该计算正确的总页数', () => {
			const wrapper = createWrapper();
			expect(wrapper.vm.totalPages).toBe(1);
		});

		it('应该在多页时显示分页控件', () => {
			const manyItems = Array.from({ length: 150 }, (_, i) => ({
				id: i + 1,
				name: `Item ${i + 1}`,
				email: `item${i + 1}@example.com`,
				status: 'active',
			}));

			const wrapper = createWrapper({ items: manyItems });
			expect(wrapper.vm.totalPages).toBe(3);
		});

		it('应该正确分页项目', () => {
			const manyItems = Array.from({ length: 150 }, (_, i) => ({
				id: i + 1,
				name: `Item ${i + 1}`,
				email: `item${i + 1}@example.com`,
				status: 'active',
			}));

			const wrapper = createWrapper({ items: manyItems });
			expect(wrapper.vm.paginatedItems).toHaveLength(50);
			expect(wrapper.vm.paginatedItems[0].id).toBe(1);

			wrapper.vm.currentPage = 2;
			expect(wrapper.vm.paginatedItems[0].id).toBe(51);
		});
	});

	describe('排序功能', () => {
		it('应该按字段升序排序', async () => {
			const wrapper = createWrapper();
			await wrapper.vm.handleSortChange({ field: 'name', order: 'asc' });

			const items = wrapper.vm.filteredAndSortedItems;
			expect(items[0].name).toBe('Alice');
			expect(items[1].name).toBe('Bob');
			expect(items[2].name).toBe('Charlie');
		});

		it('应该按字段降序排序', async () => {
			const wrapper = createWrapper();
			await wrapper.vm.handleSortChange({ field: 'name', order: 'desc' });

			const items = wrapper.vm.filteredAndSortedItems;
			expect(items[0].name).toBe('Charlie');
			expect(items[1].name).toBe('Bob');
			expect(items[2].name).toBe('Alice');
		});

		it('应该处理 null 值排序', async () => {
			const itemsWithNull = [
				{ id: 1, name: null, email: 'test1@example.com', status: 'active' },
				{ id: 2, name: 'Bob', email: 'test2@example.com', status: 'inactive' },
				{ id: 3, name: 'Alice', email: 'test3@example.com', status: 'active' },
			];

			const wrapper = createWrapper({ items: itemsWithNull });
			await wrapper.vm.handleSortChange({ field: 'name', order: 'asc' });

			const items = wrapper.vm.filteredAndSortedItems;
			expect(items[0].name).toBe('Alice');
			expect(items[1].name).toBe('Bob');
			expect(items[2].name).toBeNull();
		});
	});

	describe('选择功能', () => {
		it('应该跟踪选中的项目', () => {
			const wrapper = createWrapper();
			const primaryKey = wrapper.vm.getPrimaryKey(mockItems[0]);

			wrapper.vm.selection.add(primaryKey);
			expect(wrapper.vm.hasSelection).toBe(true);
			expect(wrapper.vm.selection.size).toBe(1);
		});

		it('应该在选择改变时发出事件', async () => {
			const wrapper = createWrapper();
			const primaryKey = wrapper.vm.getPrimaryKey(mockItems[0]);

			wrapper.vm.selection.add(primaryKey);
			await wrapper.vm.$nextTick();

			expect(wrapper.emitted('update:selection')).toBeTruthy();
		});
	});

	describe('交互事件', () => {
		it('应该在行点击时发出事件', async () => {
			const wrapper = createWrapper();
			await wrapper.vm.handleRowClick(mockItems[0]);

			expect(wrapper.emitted('update:options')).toBeTruthy();
			const emitted = wrapper.emitted('update:options')[0] as unknown[];
			expect(emitted[0]).toEqual({
				action: 'view',
				item: 1,
			});
		});

		it('应该在编辑点击时发出事件', async () => {
			const wrapper = createWrapper();
			await wrapper.vm.handleEdit(mockItems[0]);

			const emitted = wrapper.emitted('update:options')[0] as unknown[];
			expect(emitted[0]).toEqual({
				action: 'edit',
				item: 1,
			});
		});

		it('应该在删除点击时发出事件', async () => {
			const wrapper = createWrapper();
			await wrapper.vm.handleDelete(mockItems[0]);

			const emitted = wrapper.emitted('update:options')[0] as unknown[];
			expect(emitted[0]).toEqual({
				action: 'delete',
				item: 1,
			});
		});
	});

	describe('性能优化', () => {
		it('应该正确处理大量数据', () => {
			const manyItems = Array.from({ length: 10000 }, (_, i) => ({
				id: i + 1,
				name: `Item ${i + 1}`,
				email: `item${i + 1}@example.com`,
				status: i % 2 === 0 ? 'active' : 'inactive',
			}));

			const wrapper = createWrapper({ items: manyItems });

			// Should only render current page
			expect(wrapper.vm.paginatedItems.length).toBe(50);

			// But calculate correct totals
			expect(wrapper.vm.totalItems).toBe(10000);
		});

		it('应该高效过滤搜索结果', () => {
			const manyItems = Array.from({ length: 10000 }, (_, i) => ({
				id: i + 1,
				name: `Item ${i + 1}`,
				email: `item${i + 1}@example.com`,
				status: i % 2 === 0 ? 'active' : 'inactive',
			}));

			const wrapper = createWrapper({ items: manyItems });
			wrapper.vm.searchQuery = 'Item 5';
			wrapper.vm.onSearchChange();

			// Should filter efficiently
			const filtered = wrapper.vm.filteredAndSortedItems;
			expect(filtered.length).toBeGreaterThan(0);
			expect(filtered.every(item =>
				String(item.name).includes('Item 5') ||
				String(item.email).includes('Item 5')
			)).toBe(true);
		});
	});

	describe('响应式设计', () => {
		it('应该在移动端调整布局', () => {
			const wrapper = createWrapper();
			// Test responsive classes exist
			expect(wrapper.find('.table-controls').exists()).toBe(true);
			expect(wrapper.find('.search-box').exists()).toBe(true);
		});
	});

	describe('错误处理', () => {
		it('应该处理空数据集', () => {
			const wrapper = createWrapper({ items: [] });
			expect(wrapper.vm.totalItems).toBe(0);
			expect(wrapper.vm.paginatedItems).toHaveLength(0);
		});

		it('应该处理缺失的主键', () => {
			const invalidItems = [{ name: 'Test' }];
			const wrapper = createWrapper({ items: invalidItems });

			expect(() => wrapper.vm.getPrimaryKey(invalidItems[0])).not.toThrow();
		});
	});
});
