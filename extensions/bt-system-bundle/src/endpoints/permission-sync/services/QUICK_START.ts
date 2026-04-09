/**
 * Quick Start Example - Permission Template Service
 * 快速开始示例 - 权限模板服务
 */

import { PermissionTemplateService, BusinessRole } from './services';
import type { DirectusPermission } from '../types';

/**
 * 示例 1: 为新导入的数据集设置权限
 */
async function example1_SetupPermissionsForNewDataset() {
	// 获取数据库连接（假设从上下文获取）
	const database = getDatabase(); // 实现中需要替换为实际的数据库获取方法
	const service = new PermissionTemplateService(database);

	// 为新数据集设置描述者权限
	const result = await service.syncPermissions(
		'bt_my_dataset',           // 集合名称
		BusinessRole.DESCRIPTOR,   // 业务角色
		'role-123',                // Directus 角色 ID
		456                        // 执行用户 ID
	);

	console.log('权限设置结果:', result.success ? '成功' : '失败');
	console.log('创建的权限数:', result.permissions_created);
}

/**
 * 示例 2: 预览权限变更
 */
async function example2_PreviewPermissionChanges() {
	const database = getDatabase();
	const service = new PermissionTemplateService(database);

	// 预览将读取者权限降级为只读
	const preview = await service.previewPermissions(
		'bt_my_dataset',
		BusinessRole.READER,
		'role-123'
	);

	console.log('权限变更预览:');
	console.log('- 将创建:', preview.summary.to_create);
	console.log('- 将更新:', preview.summary.to_update);
	console.log('- 将删除:', preview.summary.to_delete);
	console.log('- 无变化:', preview.summary.unchanged);
}

/**
 * 示例 3: 批量设置多个数据集的权限
 */
async function example3_BatchSetPermissions() {
	const database = getDatabase();
	const service = new PermissionTemplateService(database);

	// 批量为多个数据集设置只读权限
	const datasets = ['bt_dataset_1', 'bt_dataset_2', 'bt_dataset_3'];

	const results = await service.batchSyncPermissions(
		datasets,
		BusinessRole.READER,
		'role-123',
		456
	);

	// 统计结果
	const successCount = results.filter(r => r.success).length;
	console.log(`批量设置完成: ${successCount}/${results.length} 成功`);
}

/**
 * 示例 4: 验证权限配置
 */
async function example4_ValidatePermissions() {
	const database = getDatabase();
	const service = new PermissionTemplateService(database);

	// 生成权限配置
	const permissions = service.generatePermissionsFromTemplate(
		'bt_my_dataset',
		BusinessRole.DESCRIPTOR,
		'role-123'
	);

	// 验证权限配置
	const validation = service.validatePermissions(permissions);

	if (validation.valid) {
		console.log('权限配置有效');
	} else {
		console.error('权限配置错误:', validation.errors);
	}
}

/**
 * 示例 5: 检测权限冲突
 */
async function example5_DetectConflicts() {
	const database = getDatabase();
	const service = new PermissionTemplateService(database);

	// 检测权限冲突
	const conflicts = await service.detectConflicts(
		'bt_my_dataset',
		'role-123'
	);

	if (conflicts.length > 0) {
		console.warn('发现权限冲突:', conflicts);
	} else {
		console.log('无权限冲突');
	}
}

/**
 * 示例 6: 回滚权限
 */
async function example6_RollbackPermissions() {
	const database = getDatabase();
	const service = new PermissionTemplateService(database);

	// 获取最近的回滚点
	const rollbackPoints = await service.getRollbackPoints(
		'bt_my_dataset',
		'role-123',
		5  // 最近 5 个同步点
	);

	if (rollbackPoints.length > 0) {
		console.log('可用的回滚点:');
		rollbackPoints.forEach((point, index) => {
			console.log(`${index + 1}. ${point.timestamp.toISOString()} (ID: ${point.sync_log_id})`);
		});

		// 回滚到最新的同步点
		const success = await service.rollbackToSyncPoint(
			rollbackPoints[0].sync_log_id,
			456  // 用户 ID
		);

		console.log('回滚' + (success ? '成功' : '失败'));
	} else {
		console.log('没有可用的回滚点');
	}
}

/**
 * 示例 7: 干运行模式（仅预览不实际执行）
 */
async function example7_DryRunMode() {
	const database = getDatabase();
	const service = new PermissionTemplateService(database);

	// 使用干运行模式预览权限变更
	const result = await service.syncPermissions(
		'bt_my_dataset',
		BusinessRole.DESCRIPTOR,
		'role-123',
		456,   // 用户 ID
		true   // dry run = true
	);

	console.log('干运行结果:');
	console.log('- 集合:', result.collection);
	console.log('- 预计创建:', result.permissions_created);
	console.log('- 预计更新:', result.permissions_updated);
	console.log('- 预计删除:', result.permissions_deleted);
	console.log('注意：这是干运行，未实际修改权限');
}

/**
 * 示例 8: 完整的权限管理工作流
 */
async function example8_CompleteWorkflow() {
	const database = getDatabase();
	const service = new PermissionTemplateService(database);

	console.log('=== 权限管理工作流 ===\n');

	// 步骤 1: 验证权限配置
	console.log('步骤 1: 验证权限配置');
	const permissions = service.generatePermissionsFromTemplate(
		'bt_my_dataset',
		BusinessRole.DESCRIPTOR,
		'role-123'
	);

	const validation = service.validatePermissions(permissions);
	if (!validation.valid) {
		console.error('权限配置验证失败:', validation.errors);
		return;
	}
	console.log('✓ 权限配置验证通过\n');

	// 步骤 2: 检测冲突
	console.log('步骤 2: 检测权限冲突');
	const conflicts = await service.detectConflicts('bt_my_dataset', 'role-123');
	if (conflicts.length > 0) {
		console.warn('⚠ 发现权限冲突:', conflicts);
	} else {
		console.log('✓ 无权限冲突\n');
	}

	// 步骤 3: 预览变更
	console.log('步骤 3: 预览权限变更');
	const preview = await service.previewPermissions(
		'bt_my_dataset',
		BusinessRole.DESCRIPTOR,
		'role-123'
	);

	console.log('变更摘要:', preview.summary);
	console.log();

	// 步骤 4: 执行同步
	console.log('步骤 4: 执行权限同步');
	const syncResult = await service.syncPermissions(
		'bt_my_dataset',
		BusinessRole.DESCRIPTOR,
		'role-123',
		456  // 用户 ID
	);

	if (syncResult.success) {
		console.log('✓ 权限同步成功');
		console.log(`  - 创建: ${syncResult.permissions_created}`);
		console.log(`  - 更新: ${syncResult.permissions_updated}`);
		console.log(`  - 删除: ${syncResult.permissions_deleted}`);
		console.log(`  - 日志 ID: ${syncResult.sync_log_id}`);
		console.log();

		// 步骤 5: 保存回滚点信息
		console.log('步骤 5: 保存回滚点信息');
		console.log(`如需回滚，可使用日志 ID: ${syncResult.sync_log_id}`);
	} else {
		console.error('✗ 权限同步失败:', syncResult.errors);
	}
}

/**
 * 辅助函数：获取数据库连接
 * 注意：实际使用时需要替换为真实的数据库获取方法
 */
function getDatabase(): any {
	// 这里应该返回实际的 Knex 数据库连接
	// 例如: return getDatabaseFromContext() 或 return databaseService.getConnection()
	throw new Error('请实现 getDatabase() 方法以获取数据库连接');
}

// 导出示例函数
export {
	example1_SetupPermissionsForNewDataset,
	example2_PreviewPermissionChanges,
	example3_BatchSetPermissions,
	example4_ValidatePermissions,
	example5_DetectConflicts,
	example6_RollbackPermissions,
	example7_DryRunMode,
	example8_CompleteWorkflow,
};

// 使用说明
console.log(`
权限模板服务快速开始示例
========================

本文件包含了权限模板服务的常见使用场景示例。

运行示例：
1. 实现 getDatabase() 方法以获取数据库连接
2. 调用相应的示例函数

示例列表：
- example1_SetupPermissionsForNewDataset: 为新数据集设置权限
- example2_PreviewPermissionChanges: 预览权限变更
- example3_BatchSetPermissions: 批量设置权限
- example4_ValidatePermissions: 验证权限配置
- example5_DetectConflicts: 检测权限冲突
- example6_RollbackPermissions: 回滚权限
- example7_DryRunMode: 干运行模式
- example8_CompleteWorkflow: 完整工作流

更多信息请参考 README.md 文档。
`);
