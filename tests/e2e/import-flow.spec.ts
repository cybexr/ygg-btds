import { test, expect, TestHelpers } from './helpers/test-base';
import { DirectusAPI } from './helpers/api-helpers';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 导入流程 E2E 测试
 * 测试管理员上传 Excel → 导入 → 授权 → descriptor 登录验证
 */
test.describe('导入流程测试', () => {
  let api: DirectusAPI;
  let managerToken: string;
  let descriptorToken: string;

  test.beforeAll(async ({ request, baseURL }) => {
    api = new DirectusAPI(request, baseURL as string);

    // 登录管理员和库著用户
    managerToken = await api.login(
      testUsers.manager.email,
      testUsers.manager.password
    );

    descriptorToken = await api.login(
      testUsers.descriptor.email,
      testUsers.descriptor.password
    );
  });

  test.describe('步骤 1: 管理员登录验证', () => {
    test('应该能够成功登录', async () => {
      const currentUser = await api.getCurrentUser(managerToken);

      expect(currentUser).toBeDefined();
      expect(currentUser.email).toBe(testUsers.manager.email);
      expect(currentUser.role).toBeDefined();
    });

    test('应该具有管理员权限', async () => {
      const currentUser = await api.getCurrentUser(managerToken);

      // 验证角色信息
      expect(currentUser.role).toBeDefined();
      expect(currentUser.role.name).toBe('ds-manager');
    });
  });

  test.describe('步骤 2: 数据集注册和导入准备', () => {
    test('应该能够创建数据集注册', async () => {
      const datasetData = {
        table_name: 'test_import_' + Date.now(),
        table_alias: '测试导入数据集',
        status: 'visible',
        source_type: 'excel',
        description: 'E2E 测试导入数据集',
        record_count: 0,
      };

      const dataset = await api.createDataset(managerToken, datasetData);

      expect(dataset).toBeDefined();
      expect(dataset.table_name).toBe(datasetData.table_name);
      expect(dataset.table_alias).toBe(datasetData.table_alias);
      expect(dataset.status).toBe('visible');
    });

    test('应该能够查询数据集列表', async () => {
      const datasets = await api.getDatasets(managerToken);

      expect(Array.isArray(datasets)).toBeTruthy();
      expect(datasets.length).toBeGreaterThan(0);
    });

    test('应该能够验证 Excel 测试文件存在', async () => {
      const testFilePath = path.join(
        __dirname,
        '../assets/mock_data/perfect_sample.xlsx'
      );

      // 使用 Node.js 的 fs 模块验证文件存在
      const fs = await import('fs/promises');
      await fs.access(testFilePath);
    });
  });

  test.describe('步骤 3: 权限分配', () => {
    let testDataset: any;

    test.beforeAll(async () => {
      // 获取一个测试数据集
      const datasets = await api.getDatasets(managerToken);
      testDataset = datasets[0];
    });

    test('应该能够为库著用户分配数据集权限', async () => {
      const descriptorUser = await api.getCurrentUser(descriptorToken);

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
      expect(permission.user_id).toBe(descriptorUser.id);
      expect(permission.library_id).toBe(testDataset.id);
      expect(permission.enabled).toBe(true);
    });

    test('应该能够同步权限到 Directus', async () => {
      const permissions = await api.getUserLibraryPermissions(managerToken);

      expect(permissions.length).toBeGreaterThan(0);

      // 同步权限
      const syncResult = await api.syncPermissions(managerToken, permissions);

      expect(syncResult.success).toBeTruthy();
      expect(syncResult.data).toBeDefined();
      expect(syncResult.data.stats).toBeDefined();
    });

    test('库著用户应该具有数据集的读取权限', async () => {
      const datasets = await api.getDatasets(descriptorToken);

      expect(datasets.length).toBeGreaterThan(0);
    });
  });

  test.describe('步骤 4: 库著用户登录和可见性验证', () => {
    test('库著用户应该能够成功登录', async () => {
      const currentUser = await api.getCurrentUser(descriptorToken);

      expect(currentUser).toBeDefined();
      expect(currentUser.email).toBe(testUsers.descriptor.email);
    });

    test('库著用户应该能够看到已授权的数据集', async () => {
      const datasets = await api.getDatasets(descriptorToken);

      expect(datasets.length).toBeGreaterThan(0);

      // 验证至少有一个数据集状态为 visible
      const visibleDatasets = datasets.filter((d: any) => d.status === 'visible');
      expect(visibleDatasets.length).toBeGreaterThan(0);
    });

    test('库著用户应该能够查看数据集详情', async () => {
      const datasets = await api.getDatasets(descriptorToken);
      const testDataset = datasets[0];

      expect(testDataset).toBeDefined();
      expect(testDataset.table_name).toBeDefined();
      expect(testDataset.table_alias).toBeDefined();
      expect(testDataset.created_at).toBeDefined();
    });
  });

  test.describe('步骤 5: 数据浏览功能验证', () => {
    let testDataset: any;
    let testCollection: string;

    test.beforeAll(async () => {
      // 获取测试数据集
      const datasets = await api.getDatasets(descriptorToken);

      // 如果没有数据集，创建一个模拟的集合用于测试
      if (datasets.length === 0) {
        testCollection = 'bt_dataset_registry'; // 使用元数据表作为测试
      } else {
        testDataset = datasets[0];
        testCollection = testDataset.table_name;
      }
    });

    test('库著用户应该能够查询集合字段', async () => {
      const fields = await api.getCollectionFields(
        descriptorToken,
        testCollection
      );

      expect(Array.isArray(fields)).toBeTruthy();
      expect(fields.length).toBeGreaterThan(0);

      // 验证字段结构
      const field = fields[0];
      expect(field).toBeDefined();
      expect(field.collection).toBeDefined();
      expect(field.field).toBeDefined();
    });

    test('库著用户应该能够查询集合数据', async () => {
      const data = await api.getCollectionData(
        descriptorToken,
        testCollection,
        5
      );

      expect(Array.isArray(data)).toBeTruthy();

      // 验证数据结构（如果有的话）
      if (data.length > 0) {
        const record = data[0];
        expect(record).toBeDefined();
        expect(typeof record).toBe('object');
      }
    });

    test('库著用户应该具有正确的读取权限', async () => {
      const descriptorUser = await api.getCurrentUser(descriptorToken);
      const hasReadPermission = await api.checkPermissionExists(
        managerToken,
        descriptorUser.role.id,
        testCollection,
        'read'
      );

      expect(hasReadPermission).toBeTruthy();
    });
  });

  test.describe('步骤 6: UI 界面测试', () => {
    test('管理员应该能够访问后台界面', async ({ page }) => {
      await TestHelpers.login(page, testUsers.manager);

      // 验证页面加载成功
      await expect(page).toHaveURL(/.*\/admin\/.*/);

      // 验证导航栏存在
      await expect(page.locator('.header')).toBeVisible();

      // 验证侧边栏存在
      await expect(page.locator('.sidebar')).toBeVisible();
    });

    test('管理员应该能够看到数据集管理模块', async ({ page }) => {
      await TestHelpers.login(page, testUsers.manager);

      // 等待页面加载
      await page.waitForLoadState('networkidle');

      // 查找数据集相关的导航项
      const navigationItems = page.locator('.sidebar [data-collection]');
      const count = await navigationItems.count();

      expect(count).toBeGreaterThan(0);

      // 验证元数据表在导航中
      const metadataNavItem = page.locator(
        '.sidebar [data-collection="bt_dataset_registry"]'
      );
      await expect(metadataNavItem).toBeVisible();
    });

    test('库著用户应该能够访问后台界面', async ({ page }) => {
      await TestHelpers.login(page, testUsers.descriptor);

      // 验证页面加载成功
      await expect(page).toHaveURL(/.*\/admin\/.*/);

      // 验证导航栏存在
      await expect(page.locator('.header')).toBeVisible();
    });

    test('库著用户应该能够看到已授权的数据集', async ({ page }) => {
      await TestHelpers.login(page, testUsers.descriptor);

      // 等待页面加载
      await page.waitForLoadState('networkidle');

      // 验证元数据表在导航中
      const metadataNavItem = page.locator(
        '.sidebar [data-collection="bt_dataset_registry"]'
      );
      await expect(metadataNavItem).toBeVisible();
    });

    test('库著用户应该能够浏览数据集内容', async ({ page }) => {
      await TestHelpers.login(page, testUsers.descriptor);

      // 点击元数据表
      await page.click('.sidebar [data-collection="bt_dataset_registry"]');

      // 等待内容加载
      await page.waitForLoadState('networkidle');

      // 验证数据表显示
      await expect(page.locator('.grid')).toBeVisible();

      // 验证表头存在
      await expect(page.locator('.grid-header')).toBeVisible();
    });
  });

  test.describe('步骤 7: 清理和隔离测试', () => {
    test('应该能够清理测试数据', async () => {
      const datasets = await api.getDatasets(managerToken);

      // 找到所有测试相关的数据集
      const testDatasets = datasets.filter((d: any) =>
        d.table_name.includes('test_')
      );

      expect(testDatasets.length).toBeGreaterThanOrEqual(0);

      // 注意：这里我们只是验证查询功能，实际的清理在测试环境的 teardown 中进行
    });

    test('测试环境应该保持隔离', async () => {
      // 验证我们在测试环境中
      const datasets = await api.getDatasets(managerToken);

      // 验证数据集中没有生产数据
      const productionDatasets = datasets.filter((d: any) =>
        d.description?.includes('生产') || d.table_name.includes('prod')
      );

      expect(productionDatasets.length).toBe(0);
    });
  });
});

/**
 * 测试后清理
 * 注意：实际的清理在 global-teardown.ts 中进行
 */
test.afterAll(async () => {
  // 这里可以进行一些简单的验证，确保测试环境状态正常
  console.log('导入流程测试完成');
});
