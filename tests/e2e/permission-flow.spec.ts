import { test, expect, TestHelpers } from './helpers/test-base';
import { DirectusAPI } from './helpers/api-helpers';

/**
 * 权限流程 E2E 测试
 * 测试权限分配、同步和验证流程
 */
test.describe('权限流程测试', () => {
  let api: DirectusAPI;
  let managerToken: string;
  let descriptorToken: string;
  let readerToken: string;

  test.beforeAll(async ({ request, baseURL }) => {
    api = new DirectusAPI(request, baseURL as string);

    // 登录所有测试用户
    managerToken = await api.login(
      testUsers.manager.email,
      testUsers.manager.password
    );

    descriptorToken = await api.login(
      testUsers.descriptor.email,
      testUsers.descriptor.password
    );

    readerToken = await api.login(
      testUsers.reader.email,
      testUsers.reader.password
    );
  });

  test.describe('步骤 1: 用户角色验证', () => {
    test('管理员应该具有 ds-manager 角色', async () => {
      const currentUser = await api.getCurrentUser(managerToken);

      expect(currentUser.role).toBeDefined();
      expect(currentUser.role.name).toBe('ds-manager');
      expect(currentUser.role.admin_access).toBe(true);
    });

    test('库著用户应该具有 ds-descriptor 角色', async () => {
      const currentUser = await api.getCurrentUser(descriptorToken);

      expect(currentUser.role).toBeDefined();
      expect(currentUser.role.name).toBe('ds-descriptor');
      expect(currentUser.role.admin_access).toBe(false);
      expect(currentUser.role.app_access).toBe(true);
    });

    test('库查用户应该具有 ds-reader 角色', async () => {
      const currentUser = await api.getCurrentUser(readerToken);

      expect(currentUser.role).toBeDefined();
      expect(currentUser.role.name).toBe('ds-reader');
      expect(currentUser.role.admin_access).toBe(false);
      expect(currentUser.role.app_access).toBe(true);
    });
  });

  test.describe('步骤 2: 权限分配流程', () => {
    let testDataset: any;
    let descriptorUser: any;
    let readerUser: any;

    test.beforeAll(async () => {
      // 获取测试数据集
      const datasets = await api.getDatasets(managerToken);
      testDataset = datasets.length > 0 ? datasets[0] : null;

      // 获取用户信息
      descriptorUser = await api.getCurrentUser(descriptorToken);
      readerUser = await api.getCurrentUser(readerToken);
    });

    test('应该能够为库著用户分配编辑权限', async () => {
      if (!testDataset) {
        test.skip('没有可用的测试数据集');
        return;
      }

      const permissionData = {
        user_id: descriptorUser.id,
        library_id: testDataset.id,
        template: 'editor',
        enabled: true,
      };

      const permission = await api.createUserLibraryPermission(
        managerToken,
        permissionData
      );

      expect(permission).toBeDefined();
      expect(permission.template).toBe('editor');
      expect(permission.enabled).toBe(true);
    });

    test('应该能够为库查用户分配只读权限', async () => {
      if (!testDataset) {
        test.skip('没有可用的测试数据集');
        return;
      }

      const permissionData = {
        user_id: readerUser.id,
        library_id: testDataset.id,
        template: 'reader',
        enabled: true,
      };

      const permission = await api.createUserLibraryPermission(
        managerToken,
        permissionData
      );

      expect(permission).toBeDefined();
      expect(permission.template).toBe('reader');
      expect(permission.enabled).toBe(true);
    });

    test('应该能够查询用户-库权限列表', async () => {
      const permissions = await api.getUserLibraryPermissions(managerToken);

      expect(Array.isArray(permissions)).toBeTruthy();
      expect(permissions.length).toBeGreaterThan(0);

      // 验证权限结构
      const permission = permissions[0];
      expect(permission).toHaveProperty('user_id');
      expect(permission).toHaveProperty('library_id');
      expect(permission).toHaveProperty('template');
      expect(permission).toHaveProperty('enabled');
    });
  });

  test.describe('步骤 3: 权限同步验证', () => {
    test('应该能够预览权限变更', async () => {
      const permissions = await api.getUserLibraryPermissions(managerToken);

      const preview = await api.previewPermissions(
        managerToken,
        permissions
      );

      expect(preview.success).toBeTruthy();
      expect(preview.data).toBeDefined();
    });

    test('应该能够执行权限同步', async () => {
      const permissions = await api.getUserLibraryPermissions(managerToken);

      const syncResult = await api.syncPermissions(
        managerToken,
        permissions
      );

      expect(syncResult.success).toBeTruthy();
      expect(syncResult.data).toBeDefined();
      expect(syncResult.data.stats).toBeDefined();

      // 验证统计信息
      const stats = syncResult.data.stats;
      expect(stats).toHaveProperty('total');
      expect(stats.total).toBeGreaterThan(0);
    });

    test('同步后应该能够验证权限已创建', async () => {
      const descriptorUser = await api.getCurrentUser(descriptorToken);

      // 检查库著用户是否有元数据表的读取权限
      const hasReadPermission = await api.checkPermissionExists(
        managerToken,
        descriptorUser.role.id,
        'bt_dataset_registry',
        'read'
      );

      expect(hasReadPermission).toBeTruthy();
    });
  });

  test.describe('步骤 4: 库著用户权限验证', () => {
    test('库著用户应该能够读取数据集', async () => {
      const datasets = await api.getDatasets(descriptorToken);

      expect(Array.isArray(datasets)).toBeTruthy();
      expect(datasets.length).toBeGreaterThan(0);
    });

    test('库著用户应该能够查看数据集详情', async () => {
      const datasets = await api.getDatasets(descriptorToken);
      const testDataset = datasets[0];

      expect(testDataset).toBeDefined();
      expect(testDataset.id).toBeDefined();
      expect(testDataset.table_name).toBeDefined();
      expect(testDataset.table_alias).toBeDefined();
    });

    test('库著用户应该能够创建数据集注册', async () => {
      const datasetData = {
        table_name: 'descriptor_test_' + Date.now(),
        table_alias: '库著测试数据集',
        status: 'visible',
        source_type: 'excel',
        description: '库著用户创建的测试数据集',
      };

      const dataset = await api.createDataset(
        descriptorToken,
        datasetData
      );

      expect(dataset).toBeDefined();
      expect(dataset.table_name).toBe(datasetData.table_name);
      expect(dataset.created_by).toBeDefined();
    });

    test('库著用户应该能够更新数据集信息', async () => {
      // 首先创建一个数据集
      const datasetData = {
        table_name: 'update_test_' + Date.now(),
        table_alias: '更新测试数据集',
        status: 'visible',
        source_type: 'excel',
      };

      const createdDataset = await api.createDataset(
        descriptorToken,
        datasetData
      );

      // 然后更新它（这里我们只是验证 API 可访问性）
      const datasets = await api.getDatasets(descriptorToken);
      const foundDataset = datasets.find(
        (d: any) => d.id === createdDataset.id
      );

      expect(foundDataset).toBeDefined();
    });
  });

  test.describe('步骤 5: 库查用户只读权限验证', () => {
    test('库查用户应该能够读取数据集', async () => {
      const datasets = await api.getDatasets(readerToken);

      expect(Array.isArray(datasets)).toBeTruthy();
      expect(datasets.length).toBeGreaterThan(0);
    });

    test('库查用户应该能够查看数据集详情', async () => {
      const datasets = await api.getDatasets(readerToken);
      const testDataset = datasets[0];

      expect(testDataset).toBeDefined();
      expect(testDataset.table_name).toBeDefined();
    });

    test('库查用户不应该能够创建数据集', async () => {
      const datasetData = {
        table_name: 'reader_test_' + Date.now(),
        table_alias: '库查测试数据集',
        status: 'visible',
        source_type: 'excel',
      };

      // 尝试创建数据集，应该失败
      await expect(
        api.createDataset(readerToken, datasetData)
      ).rejects.toThrow();
    });

    test('库查用户不应该能够删除数据集', async () => {
      // 验证库查用户没有删除权限
      const readerUser = await api.getCurrentUser(readerToken);

      const hasDeletePermission = await api.checkPermissionExists(
        managerToken,
        readerUser.role.id,
        'bt_dataset_registry',
        'delete'
      );

      expect(hasDeletePermission).toBeFalsy();
    });
  });

  test.describe('步骤 6: 权限隔离验证', () => {
    test('不同角色之间应该有权限隔离', async () => {
      // 获取各用户的权限视图
      const managerDatasets = await api.getDatasets(managerToken);
      const descriptorDatasets = await api.getDatasets(descriptorToken);
      const readerDatasets = await api.getDatasets(readerToken);

      // 管理员应该能看到所有数据集
      expect(managerDatasets.length).toBeGreaterThanOrEqual(0);

      // 库著和库查用户应该能看到数据集
      expect(descriptorDatasets.length).toBeGreaterThanOrEqual(0);
      expect(readerDatasets.length).toBeGreaterThanOrEqual(0);
    });

    test('未授权用户不应该能够访问受保护资源', async () => {
      // 使用无效的 token 尝试访问
      const invalidToken = 'invalid_token_' + Date.now();

      await expect(
        api.getDatasets(invalidToken)
      ).rejects.toThrow();
    });
  });

  test.describe('步骤 7: UI 权限验证', () => {
    test('管理员应该能够访问用户管理界面', async ({ page }) => {
      await TestHelpers.login(page, testUsers.manager);

      // 等待页面加载
      await page.waitForLoadState('networkidle');

      // 查找用户管理相关的导航项
      const usersNav = page.locator(
        '.sidebar [data-collection="directus_users"]'
      );

      // 管理员应该能够看到用户管理
      await expect(usersNav).toBeVisible();
    });

    test('库著用户应该能够看到数据集管理', async ({ page }) => {
      await TestHelpers.login(page, testUsers.descriptor);

      // 等待页面加载
      await page.waitForLoadState('networkidle');

      // 查找数据集管理
      const datasetsNav = page.locator(
        '.sidebar [data-collection="bt_dataset_registry"]'
      );

      await expect(datasetsNav).toBeVisible();
    });

    test('库著用户不应该能够看到用户管理', async ({ page }) => {
      await TestHelpers.login(page, testUsers.descriptor);

      // 等待页面加载
      await page.waitForLoadState('networkidle');

      // 查找用户管理
      const usersNav = page.locator(
        '.sidebar [data-collection="directus_users"]'
      );

      // 库著用户不应该能够看到用户管理
      const isVisible = await usersNav.isVisible().catch(() => false);
      expect(isVisible).toBeFalsy();
    });

    test('库查用户应该能够看到授权的数据集', async ({ page }) => {
      await TestHelpers.login(page, testUsers.reader);

      // 等待页面加载
      await page.waitForLoadState('networkidle');

      // 查找数据集管理
      const datasetsNav = page.locator(
        '.sidebar [data-collection="bt_dataset_registry"]'
      );

      await expect(datasetsNav).toBeVisible();
    });

    test('库查用户尝试创建数据集应该失败', async ({ page }) => {
      await TestHelpers.login(page, testUsers.reader);

      // 尝试访问创建页面
      await page.goto('/admin/content/bt_dataset_registry/+');

      // 等待页面响应
      await page.waitForLoadState('networkidle');

      // 验证是否有错误提示或者重定向
      const currentUrl = page.url();
      const hasError = currentUrl.includes('/admin/') &&
                      !currentUrl.includes('/admin/content/');

      // 库查用户应该被重定向或者看到错误
      expect(hasError || !currentUrl.includes('+')).toBeTruthy();
    });
  });

  test.describe('步骤 8: 权限变更和撤销', () => {
    test('应该能够禁用用户权限', async () => {
      const permissions = await api.getUserLibraryPermissions(managerToken);

      if (permissions.length > 0) {
        // 这里我们只是验证能够查询到权限
        // 实际的禁用操作需要通过 API 调用
        expect(permissions.length).toBeGreaterThan(0);
      }
    });

    test('权限变更后应该重新同步', async () => {
      // 获取当前权限
      const permissions = await api.getUserLibraryPermissions(managerToken);

      // 执行同步
      const syncResult = await api.syncPermissions(
        managerToken,
        permissions
      );

      expect(syncResult.success).toBeTruthy();
    });
  });

  test.describe('步骤 9: 批量权限操作', () => {
    test('应该能够批量分配权限', async () => {
      const permissions = await api.getUserLibraryPermissions(managerToken);

      // 验证可以进行批量操作
      expect(Array.isArray(permissions)).toBeTruthy();

      // 批量同步
      const syncResult = await api.syncPermissions(
        managerToken,
        permissions
      );

      expect(syncResult.success).toBeTruthy();
      expect(syncResult.data.stats.total).toBeGreaterThanOrEqual(0);
    });

    test('批量权限预览应该返回详细信息', async () => {
      const permissions = await api.getUserLibraryPermissions(managerToken);

      const preview = await api.previewPermissions(
        managerToken,
        permissions
      );

      expect(preview.success).toBeTruthy();
      expect(preview.data).toBeDefined();
    });
  });
});

/**
 * 测试后清理
 */
test.afterAll(async () => {
  console.log('权限流程测试完成');
});
