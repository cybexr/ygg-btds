<template>
	<div class="permission-checkbox">
		<v-checkbox
			:model-value="checked"
			@update:model-value="handleChange"
			:disabled="disabled"
			:indeterminate="indeterminate"
		/>
	</div>
</template>

<script setup lang="ts">
interface Props {
	user: {
		id: string;
		first_name: string;
		last_name: string;
		email: string;
		role?: {
			id: string;
			name: string;
		};
	};
	datasetId: string;
	template: string;
	checked: boolean;
	disabled?: boolean;
	indeterminate?: boolean;
}

interface Emits {
	(e: 'change', userId: string, datasetId: string, template: string, enabled: boolean): void;
}

const props = withDefaults(defineProps<Props>(), {
	disabled: false,
	indeterminate: false
});

const emit = defineEmits<Emits>();

const handleChange = (enabled: boolean) => {
	emit('change', props.user.id, props.datasetId, props.template, enabled);
};
</script>

<style scoped>
.permission-checkbox {
	display: flex;
	justify-content: center;
	align-items: center;
	width: 100%;
	height: 100%;
}

:deep(.v-checkbox) {
	margin: 0;
	justify-content: center;
}
</style>
