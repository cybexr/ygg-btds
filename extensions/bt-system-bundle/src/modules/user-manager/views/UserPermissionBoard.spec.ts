import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UserPermissionBoard from './UserPermissionBoard.vue';

const apiMock = {
	get: vi.fn(),
	post: vi.fn(),
};

vi.mock('@directus/extensions-sdk', () => ({
	useApi: () => apiMock,
}));

const createStub = (name: string) => ({
	name,
	props: ['modelValue', 'items', 'columns', 'length', 'type'],
	emits: ['update:modelValue', 'click'],
	template: '<div><slot /><slot name="icon" /><slot name="prepend" /></div>',
});

const DialogStub = {
	name: 'v-dialog',
	props: ['modelValue'],
	template: '<div v-if="modelValue"><slot /></div>',
};

const TableStub = {
	name: 'v-table',
	props: ['items'],
	template: `
		<div class="table-stub">
			<div v-for="item in items" :key="item.id" class="table-row">
				<slot name="item-user" :item="item" />
				<slot name="item-ds-descriptor-crud" :item="item" />
				<slot name="item-ds-reader-read" :item="item" />
				<slot name="item-dataset-101" :item="item" />
			</div>
		</div>
	`,
};

const CheckboxStub = {
	name: 'v-checkbox',
	props: ['modelValue'],
	emits: ['update:modelValue'],
	template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
};

const defaultUsers = [
	{
		id: 'user-1',
		first_name: '张',
		last_name: '三',
		email: 'zhangsan@example.com',
		role: { id: 'role-1', name: 'ds-reader' },
	},
];

const defaultDatasets = [
	{
		id: 101,
		collection_name: 'library_alpha',
		display_name: 'Alpha 库',
		status: 'active',
	},
];

const mountBoard = async () => {
	apiMock.get.mockImplementation((url: string) => {
		if (url === '/users') {
			return Promise.resolve({ data: { data: defaultUsers } });
		}

		if (url === '/items/bt_dataset_registry') {
			return Promise.resolve({ data: { data: defaultDatasets } });
		}

		if (url === '/custom/permissions/current') {
			return Promise.resolve({
				data: {
					data: [
						{
							user_id: 'user-1',
							library_id: 'ds-descriptors',
							template: 'ds-reader-read',
							enabled: true,
						},
					],
				},
			});
		}

		return Promise.resolve({ data: { data: [] } });
	});
	apiMock.post.mockResolvedValue({ data: { success: true, data: { stats: {}, conflicts: [] } } });

	const wrapper = mount(UserPermissionBoard, {
		global: {
			stubs: {
				'private-view': createStub('private-view'),
				'v-breadcrumb': createStub('v-breadcrumb'),
				'v-button': createStub('v-button'),
				'v-icon': createStub('v-icon'),
				'v-input': createStub('v-input'),
				'v-select': createStub('v-select'),
				'v-table': TableStub,
				'v-checkbox': CheckboxStub,
				'v-progress-circular': createStub('v-progress-circular'),
				'v-notice': createStub('v-notice'),
				'v-pagination': createStub('v-pagination'),
				'v-dialog': DialogStub,
				'v-card': createStub('v-card'),
				'v-card-title': createStub('v-card-title'),
				'v-card-text': createStub('v-card-text'),
				'v-card-actions': createStub('v-card-actions'),
				'v-toast': createStub('v-toast'),
				'v-chip': createStub('v-chip'),
			},
			directives: {
				tooltip: () => undefined,
			},
		},
	});

	await Promise.resolve();
	await Promise.resolve();

	return wrapper;
};

describe('UserPermissionBoard batch feedback', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	it('renders summary and details for batch changes', async () => {
		const wrapper = await mountBoard();

		wrapper.vm.selectAllOnPage();
		wrapper.vm.batchTemplate = 'ds-reader-read';
		wrapper.vm.batchEnabled = true;
		await wrapper.vm.applyBatchGrant();

		expect(wrapper.vm.batchChangeDetails).toHaveLength(2);
		expect(wrapper.vm.batchChangesSummary.created).toBe(1);
		expect(wrapper.vm.batchChangesSummary.updated).toBe(1);
		expect(wrapper.vm.batchChangesSummary.deleted).toBe(0);
		expect(wrapper.find('.batch-feedback-panel').exists()).toBe(true);
		expect(wrapper.vm.isCellHighlighted('user-1', 'library_alpha', 'ds-reader-read')).toBe(true);

		wrapper.vm.showBatchDetailsDialog = true;
		await wrapper.vm.$nextTick();

		expect(wrapper.text()).toContain('批量权限变更详情');
		expect(wrapper.text()).toContain('Alpha 库');
		expect(wrapper.text()).toContain('张 三 (zhangsan@example.com)');
	});

	it('clears feedback after timeout and manual reset', async () => {
		const wrapper = await mountBoard();

		wrapper.vm.selectAllOnPage();
		await wrapper.vm.applyBatchGrant();
		expect(wrapper.vm.batchAffectedPermissions.size).toBeGreaterThan(0);

		vi.advanceTimersByTime(4000);
		await wrapper.vm.$nextTick();

		expect(wrapper.vm.batchAffectedPermissions.size).toBe(0);
		expect(wrapper.vm.batchChangeDetails).toHaveLength(0);

		wrapper.vm.selectAllOnPage();
		await wrapper.vm.applyBatchGrant();
		wrapper.vm.clearBatchFeedback();

		expect(wrapper.vm.batchAffectedPermissions.size).toBe(0);
		expect(wrapper.find('.batch-feedback-panel').exists()).toBe(false);
	});
});
