<template>
	<div class="raw-database-manager">
		<!-- 主界面 -->
		<private-view v-if="!showImportWizard" title="原始库管理">
			<template #headline>
				<v-breadcrumb :items="[{ title: '原始库管理', disabled: true }]" />
			</template>

			<template #title-outer:prepend>
				<v-button class="header-icon" rounded disabled icon>
					<template #icon>
						<v-icon name="database" />
					</template>
				</v-button>
			</template>

			<template #actions>
				<v-button
					v-tooltip.bottom="导入数据集"
					icon="add"
					rounded
					@click="createNewDataset"
				/>
			</template>

			<div class="content">
				<v-info
					icon="database"
					title="原始库管理"
					type="info"
					center
				>
					管理已导入的数据集，包括查看详情、切换可见性、清空库表等操作。
				</v-info>

				<div class="dataset-list">
					<DatasetRegistryList />
				</div>
			</div>
		</private-view>

		<!-- 导入向导 -->
		<ImportWizard v-if="showImportWizard" @close="showImportWizard = false" />
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import DatasetRegistryList from './views/DatasetRegistryList.vue';
import ImportWizard from './views/ImportWizard.vue';

const showImportWizard = ref(false);

const createNewDataset = () => {
	showImportWizard.value = true;
};
</script>

<style scoped>
.raw-database-manager {
	height: 100%;
}

.content {
	padding: 20px;
}

.dataset-list {
	margin-top: 20px;
}
</style>
