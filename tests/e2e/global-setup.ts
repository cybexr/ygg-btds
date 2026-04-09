import { FullConfig } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Playwright 全局设置
 * 在所有测试运行前执行，用于初始化测试环境
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test environment setup...');

  // 设置测试环境变量
  process.env.TEST_ENV = 'e2e';
  process.env.NODE_ENV = 'test';

  // 验证测试环境是否就绪
  const baseURL = process.env.TEST_BASE_URL || 'http://localhost:8080';
  console.log(`📡 Testing against: ${baseURL}`);

  // 等待测试服务就绪（最多等待 60 秒）
  const maxRetries = 12;
  const retryDelay = 5000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${baseURL}/health`);
      if (response.ok) {
        console.log('✅ Test environment is ready');
        break;
      }
    } catch (error) {
      if (i === maxRetries - 1) {
        throw new Error(
          `❌ Test environment not ready after ${maxRetries * retryDelay / 1000}s. ` +
          'Make sure docker-compose.test.yml is running.'
        );
      }
      console.log(`⏳ Waiting for test environment... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  // 运行种子数据脚本
  console.log('🌱 Seeding test data...');
  try {
    const seedScript = path.join(__dirname, '../scripts/seed-test-data.ts');
    execSync(`npx tsx ${seedScript}`, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        DIRECTUS_URL: baseURL,
      },
    });
    console.log('✅ Test data seeded successfully');
  } catch (error) {
    console.log('⚠️  Warning: Test data seeding failed, tests may not work properly');
    console.log('   Make sure dependencies are installed: npm install');
  }

  console.log('✅ E2E test environment setup completed');
}

export default globalSetup;
