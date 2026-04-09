import { test, expect } from './helpers/test-base';

/**
 * 环境检查测试
 * 验证测试环境是否正常工作
 */

test.describe('测试环境验证', () => {
  test('应该能够访问 Directus 实例', async ({ page, baseURL }) => {
    await page.goto(baseURL as string);

    // 检查页面标题
    await expect(page).toHaveTitle(/Directus/);

    // 检查是否重定向到登录页面
    await expect(page).toHaveURL(/.*\/admin\/login/);
  });

  test('应该显示登录表单', async ({ page, loginPage }) => {
    await page.goto(loginPage);

    // 检查登录表单元素
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('测试用户可以登录', async ({ page }) => {
    const { manager } = testUsers;

    await page.goto('/admin/login');
    await page.fill('input[type="email"]', manager.email);
    await page.fill('input[type="password"]', manager.password);
    await page.click('button[type="submit"]');

    // 等待跳转到后台页面
    await page.waitForURL('**/admin/**', { timeout: 10000 });

    // 验证登录成功
    await expect(page.locator('.header')).toBeVisible();
  });

  test('元数据表应该可访问', async ({ page, request }) => {
    const { manager } = testUsers;

    // 获取认证 token
    const loginResponse = await request.post('/auth/login', {
      data: {
        email: manager.email,
        password: manager.password,
      },
    });

    expect(loginResponse.ok()).toBeTruthy();

    const { data } = await loginResponse.json();
    const token = data.access_token;

    // 查询元数据表
    const registryResponse = await request.get('/items/bt_dataset_registry', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(registryResponse.ok()).toBeTruthy();

    const { data: registryData } = await registryResponse.json();
    expect(Array.isArray(registryData)).toBeTruthy();
  });
});
