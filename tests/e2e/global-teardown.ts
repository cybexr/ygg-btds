import { FullConfig } from '@playwright/test';

/**
 * Playwright 全局清理
 * 在所有测试运行后执行，用于清理测试环境
 */
async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting E2E test environment teardown...');

  // 清理临时测试数据（可选）
  // 这里可以添加清理测试数据的逻辑
  // 例如：删除测试期间创建的动态表、清理上传的文件等

  console.log('✅ E2E test environment teardown completed');
}

export default globalTeardown;
