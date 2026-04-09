import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DatasetRegistryList from '../DatasetRegistryList.vue';

const apiMock = {
	get: vi.fn(),
	post: vi.fn(),
	delete: vi.fn(),
	patch: vi.fn(),
};

const userStoreMock = {
	currentUser: {
		role: {
			name: 'ds-manager',
		},
	},
};

vi.mock('@directus/extensions-sdk', () => ({
	useApi: () => apiMock,
	useUserStore: () => userStoreMock,
}));

const dataset = {
	id: 1,
	collection_name: 'bt_test_dataset',
	display_name: '测试数据集',
	status: 'active' as const,
	source_file_name: 'test.xlsx',
	record_count: 128,
	description: '用于测试的描述',
	tags: ['test'],
	created_at: '2026-04-09T00:00:00.000Z',
	updated_at: '2026-04-09T00:00:00.000Z',
};

const createWrapper = async () => {
	const wrapper = mount(DatasetRegistryList, {
		global: {
			stubs: {
				'v-table': {
					props: ['items'],
					template: `
						<div class="v-table-stub">
							<div v-for="item in items" :key="item.id" class="table-row">
								<slot name="item-actions" :item="item" />
							</div>
						</div>
					`,
				},
				'v-input': {
					props: ['modelValue', 'placeholder', 'id'],
					emits: ['update:modelValue'],
					template: `
						<input
							:id="id"
							:value="modelValue"
							:placeholder="placeholder"
							@input="$emit('update:modelValue', $event.target.value)"
						/>
					`,
				},
				'v-button': {
					props: ['disabled', 'loading', 'color'],
					emits: ['click'],
					template: `
						<button
							:disabled="disabled || loading"
							:data-color="color"
							@click="$emit('click')"
						>
							<slot name="icon" />
							<slot />
						</button>
					`,
				},
				'v-dialog': {
					props: ['modelValue'],
					emits: ['update:modelValue'],
					template: '<div v-if="modelValue" class="dialog-stub"><slot /></div>',
				},
				'v-card': { template: '<div class="card-stub"><slot /></div>' },
				'v-card-title': { template: '<div class="card-title-stub"><slot /></div>' },
				'v-card-text': { template: '<div class="card-text-stub"><slot /></div>' },
				'v-card-actions': { template: '<div class="card-actions-stub"><slot /></div>' },
				'v-icon': { props: ['name'], template: '<i class="icon-stub">{{ name }}</i>' },
				'v-chip': { template: '<span><slot /></span>' },
				'v-notice': { template: '<div class="notice-stub"><slot /></div>' },
				'v-select': { template: '<select />' },
				'v-pagination': { template: '<div class="pagination-stub" />' },
				'v-toast': { template: '<div class="toast-stub"><slot /></div>' },
			},
		},
	});

	await wrapper.vm.$nextTick();
	return wrapper;
};

describe('DatasetRegistryList', () => {
	beforeEach(() => {
		apiMock.get.mockResolvedValue({
			data: {
				data: [dataset],
			},
		});
		apiMock.post.mockResolvedValue({});
		apiMock.delete.mockResolvedValue({});
		apiMock.patch.mockResolvedValue({});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('为管理员渲染带危险态样式的操作按钮', async () => {
		const wrapper = await createWrapper();

		const dangerButtons = wrapper.findAll('.danger-action');
		expect(dangerButtons).toHaveLength(2);
		expect(dangerButtons[0].text()).toContain('清空');
		expect(dangerButtons[1].text()).toContain('删除');
		expect(wrapper.html()).toContain('danger-action__label');
	});

	it('打开清空对话框时需要倒计时和精确名称确认', async () => {
		vi.useFakeTimers();
		const wrapper = await createWrapper();

		wrapper.vm.confirmTruncate(dataset);
		await wrapper.vm.$nextTick();

		expect(wrapper.vm.truncateDialog).toBe(true);
		expect(wrapper.vm.confirmCountdown).toBe(3);
		expect(wrapper.vm.canConfirmDangerAction).toBe(false);
		expect(wrapper.text()).toContain('此操作不可恢复');

		wrapper.vm.confirmationInput = '测试数据集';
		await wrapper.vm.$nextTick();
		expect(wrapper.vm.canConfirmDangerAction).toBe(false);

		vi.advanceTimersByTime(3000);
		await wrapper.vm.$nextTick();

		expect(wrapper.vm.confirmCountdown).toBe(0);
		expect(wrapper.vm.canConfirmDangerAction).toBe(true);
		expect(wrapper.text()).toContain('确认清空');
	});

	it('删除确认必须大小写完全匹配数据集名称', async () => {
		vi.useFakeTimers();
		const wrapper = await createWrapper();

		wrapper.vm.confirmDelete(dataset);
		await wrapper.vm.$nextTick();

		wrapper.vm.confirmationInput = '测试数据集 ';
		vi.advanceTimersByTime(3000);
		await wrapper.vm.$nextTick();
		expect(wrapper.vm.canConfirmDangerAction).toBe(false);

		wrapper.vm.confirmationInput = '测试数据集';
		await wrapper.vm.$nextTick();
		expect(wrapper.vm.canConfirmDangerAction).toBe(true);
	});

	it('关闭危险操作对话框时重置确认状态', async () => {
		vi.useFakeTimers();
		const wrapper = await createWrapper();

		wrapper.vm.confirmDelete(dataset);
		wrapper.vm.confirmationInput = '测试数据集';
		await wrapper.vm.$nextTick();

		wrapper.vm.handleDeleteDialogClose(false);
		await wrapper.vm.$nextTick();

		expect(wrapper.vm.deleteDialog).toBe(false);
		expect(wrapper.vm.selectedItem).toBeNull();
		expect(wrapper.vm.confirmationInput).toBe('');
		expect(wrapper.vm.confirmCountdown).toBe(0);
	});
});
