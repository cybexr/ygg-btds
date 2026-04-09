import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 测试配置
 * 基于 Directus v11 扩展的 BTDMS 系统测试环境
 */
export default defineConfig({
  // 测试文件位置
  testDir: './',

  // 测试文件匹配模式
  testMatch: '**/*.spec.ts',

  // 完全并行运行测试（每个测试文件独立运行）
  fullyParallel: true,

  // 测试失败时禁止重试（确保测试结果可靠）
  retries: 0,

  // 并发工作进程数（Docker 环境中建议设置为 1）
  workers: 1,

  // 测试超时时间（30秒）
  timeout: 30 * 1000,

  // 期望断言超时时间（5秒）
  expect: {
    timeout: 5 * 1000,
  },

  // 失败时生成测试报告
  reporter: [
    ['html', {
      outputFolder: '../../test-results/e2e-report',
      open: 'never',
    }],
    ['json', {
      outputFile: '../../test-results/e2e-results.json',
    }],
    ['junit', {
      outputFile: '../../test-results/e2e-junit.xml',
    }],
    ['list'],
  ],

  use: {
    // 基础 URL（Directus 测试实例）
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:8080',

    // 追踪失败测试（重放时使用）
    trace: 'retain-on-failure',

    // 截图配置
    screenshot: 'only-on-failure',

    // 视频录制
    video: 'retain-on-failure',

    // 浏览器上下文选项
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,

    // 导航超时
    navigationTimeout: 15 * 1000,

    // 操作超时
    actionTimeout: 10 * 1000,
  },

  // 测试项目配置（多浏览器支持）
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // 暂时禁用其他浏览器以加快测试速度
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // 测试运行前的全局设置
  globalSetup: require.resolve('./global-setup'),

  // 测试运行后的全局清理
  globalTeardown: require.resolve('./global-teardown'),

  // 开发服务器（可选，用于本地开发）
  // webServer: {
  //   command: 'docker-compose -f docker-compose.test.yml up',
  //   port: 8080,
  //   timeout: 120 * 1000,
  //   reuseExistingServer: !process.env.CI,
  // },
});
