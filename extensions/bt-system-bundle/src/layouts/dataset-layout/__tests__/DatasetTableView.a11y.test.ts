import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import DatasetTableView from '../components/DatasetTableView.vue';

const mockFields = [
	{ field: 'id', name: 'ID', type: 'integer', meta: { sortable: true } },
	{ field: 'name', name: 'Name', type: 'string', meta: { sortable: true } },
	{ field: 'email', name: 'Email', type: 'string', meta: { sortable: true } },
];

const mockItems = [
	{ id: 1, name: 'Alice', email: 'alice@example.com' },
	{ id: 2, name: 'Bob', email: 'bob@example.com' },
];

const VInputStub = defineComponent({
	props: {
		modelValue: { type: String, default: '' },
		placeholder: { type: String, default: '' },
		ariaLabel: { type: String, default: undefined },
	},
	emits: ['update:modelValue'],
	setup(props, { emit, slots }) {
		return () => h('label', { class: 'v-input-stub' }, [
			slots.prepend?.(),
			h('input', {
				value: props.modelValue,
				placeholder: props.placeholder,
				'aria-label': props.ariaLabel,
				onInput: (event: Event) => {
					emit('update:modelValue', (event.target as HTMLInputElement).value);
				},
			}),
		]);
	},
});

const VButtonStub = defineComponent({
	props: {
		ariaLabel: { type: String, default: undefined },
		type: { type: String, default: 'button' },
	},
	emits: ['click'],
	setup(props, { emit, slots, attrs }) {
		return () => h('button', {
			type: props.type,
			class: attrs.class,
			'aria-label': props.ariaLabel,
			onClick: () => emit('click'),
		}, slots.default?.() ?? slots.icon?.());
	},
});

const VTableStub = defineComponent({
	props: {
		items: { type: Array, default: () => [] },
		columns: { type: Array, default: () => [] },
		ariaLabel: { type: String, default: undefined },
	},
	emits: ['click:row'],
	setup(props, { emit, slots }) {
		return () => h('table', {
			class: 'v-table-stub',
			role: 'table',
			'aria-label': props.ariaLabel,
		}, [
			h('thead', [
				h('tr', (props.columns as Array<{ field: string; name: string }>).map((column) =>
					h('th', { scope: 'col' }, column.name),
				)),
			]),
			h('tbody', (props.items as Array<Record<string, unknown>>).map((item) =>
				h('tr', {
					tabindex: 0,
					onClick: () => emit('click:row', item),
				}, [
					...(props.columns as Array<{ field: string; name: string }>).map((column) =>
						h('td', String(item[column.field] ?? '')),
					),
					h('td', slots.actions?.({ item })),
				]),
			)),
		]);
	},
});

const VEmptyStub = defineComponent({
	props: {
		title: { type: String, default: '' },
		text: { type: String, default: '' },
	},
	setup(props) {
		return () => h('div', { class: 'v-empty-stub' }, [
			h('p', { class: 'v-empty-title' }, props.title),
			h('p', { class: 'v-empty-text' }, props.text),
		]);
	},
});

const VPaginationStub = defineComponent({
	props: {
		page: { type: Number, default: 1 },
		length: { type: Number, default: 1 },
		ariaLabel: { type: String, default: undefined },
	},
	setup(props) {
		return () => h('nav', {
			class: 'v-pagination-stub',
			'aria-label': props.ariaLabel,
		}, `第 ${props.page} 页，共 ${props.length} 页`);
	},
});

const VIconStub = defineComponent({
	props: {
		name: { type: String, required: true },
	},
	setup(props) {
		return () => h('span', { 'aria-hidden': 'true', 'data-icon': props.name });
	},
});

const createWrapper = (props = {}) => mount(DatasetTableView, {
	props: {
		collection: 'test_collection',
		primaryKey: ['id'],
		fields: mockFields,
		items: mockItems,
		loading: false,
		itemsPerPage: 1,
		...props,
	},
	global: {
		stubs: {
			'v-input': VInputStub,
			'v-button': VButtonStub,
			'v-table': VTableStub,
			'v-empty': VEmptyStub,
			'v-pagination': VPaginationStub,
			'v-icon': VIconStub,
		},
	},
});

describe('DatasetTableView accessibility', () => {
	it('provides accessible names for search and row actions', () => {
		const wrapper = createWrapper();

		expect(wrapper.get('input[aria-label="搜索数据集项目"]').exists()).toBe(true);
		expect(wrapper.get('table[aria-label="数据集项目表格"]').exists()).toBe(true);
		expect(wrapper.get('button[aria-label="编辑项目"]').exists()).toBe(true);
		expect(wrapper.get('button[aria-label="删除项目"]').exists()).toBe(true);
	});

	it('announces item counts and selection updates through a live region', async () => {
		const wrapper = createWrapper();

		const status = wrapper.get('.table-info');
		expect(status.attributes('role')).toBe('status');
		expect(status.attributes('aria-live')).toBe('polite');
		expect(status.text()).toContain('1-1 / 2 项');

		wrapper.vm.selection.add(1);
		await wrapper.vm.$nextTick();

		expect(status.text()).toContain('已选择 1 项');
	});

	it('renders an accessible empty state for search results', async () => {
		const wrapper = createWrapper({ items: [] });
		await wrapper.vm.$nextTick();

		const emptyState = wrapper.get('.empty-state');
		expect(emptyState.attributes('role')).toBe('status');
		expect(emptyState.attributes('aria-live')).toBe('polite');
		expect(emptyState.text()).toContain('暂无数据');

		wrapper.vm.searchQuery = 'missing';
		await wrapper.vm.$nextTick();

		expect(emptyState.text()).toContain('未找到匹配的项');
		expect(emptyState.text()).toContain('尝试调整搜索条件');
	});

	it('exposes pagination with an accessible navigation label', () => {
		const wrapper = createWrapper();

		const pagination = wrapper.get('nav[aria-label="数据分页"]');
		expect(pagination.text()).toContain('第 1 页，共 2 页');
	});

	it('keeps action controls keyboard reachable', async () => {
		const wrapper = createWrapper();

		const editButton = wrapper.get('button[aria-label="编辑项目"]');
		await editButton.trigger('click');

		const emitted = wrapper.emitted('update:options');
		expect(emitted).toBeTruthy();
		expect(emitted?.[0]?.[0]).toEqual({
			action: 'edit',
			item: 1,
		});
	});
});
