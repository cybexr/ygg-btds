import { test as base } from '@playwright/test';

/**
 * 测试基础类型定义
 */
export interface TestUser {
  email: string;
  password: string;
  role: 'manager' | 'descriptor' | 'reader';
  name: string;
}

/**
 * 测试用户配置
 */
export const testUsers: Record<string, TestUser> = {
  manager: {
    email: 'manager@test.btdms.local',
    password: 'password',
    role: 'manager',
    name: 'Test Manager',
  },
  descriptor: {
    email: 'descriptor@test.btdms.local',
    password: 'password',
    role: 'descriptor',
    name: 'Test Descriptor',
  },
  reader: {
    email: 'reader@test.btdms.local',
    password: 'password',
    role: 'reader',
    name: 'Test Reader',
  },
};

/**
 * 扩展测试基础类，添加自定义 fixtures
 */
export const test = base.extend<{
  baseURL: string;
  loginPage: string;
}>({
  // 使用环境变量或默认值
  baseURL: async ({}, use) => {
    await use(process.env.TEST_BASE_URL || 'http://localhost:8080');
  },

  // Directus 登录页面路径
  loginPage: async ({ baseURL }, use) => {
    await use(`${baseURL}/admin/login`);
  },
});

/**
 * 测试辅助函数
 */
export class TestHelpers {
  /**
   * 登录 Directus
   */
  static async login(page, user: TestUser) {
    await page.goto('/admin/login');
    await page.fill('input[type="email"]', user.email);
    await page.fill('input[type="password"]', user.password);
    await page.click('button[type="submit"]');

    // 等待登录成功（跳转到后台页面）
    await page.waitForURL('**/admin/**', { timeout: 10000 });
  }

  /**
   * 等待 API 响应
   */
  static async waitForAPIResponse(page, urlPattern: string) {
    return page.waitForResponse(
      response => response.url().includes(urlPattern),
      { timeout: 10000 }
    );
  }

  /**
   * 上传测试文件
   */
  static async uploadFile(page, fileInput, filePath: string) {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await fileInput.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);
  }

  /**
   * 断言元素可见
   */
  static async assertVisible(page, selector: string) {
    await page.waitForSelector(selector, { state: 'visible' });
  }

  /**
   * 断言元素包含文本
   */
  static async assertTextContains(page, selector: string, text: string) {
    const element = page.locator(selector);
    await element.waitFor({ state: 'visible' });
    await element.containText(text);
  }
}

export { expect } from '@playwright/test';
