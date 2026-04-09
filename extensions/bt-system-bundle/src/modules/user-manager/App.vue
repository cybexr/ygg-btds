<template>
	<div class="user-manager-container">
		<UserPermissionBoard />
	</div>
</template>

<script setup lang="ts">
	import UserPermissionBoard from './views/UserPermissionBoard.vue';
</script>

<style scoped>
.user-manager-container {
	width: 100%;
	height: 100%;
}
</style>
