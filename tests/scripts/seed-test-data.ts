#!/usr/bin/env node
/**
 * 测试数据种子脚本
 * 为 E2E 测试创建初始测试数据
 */

import { createClient } from '@directus/sdk';

// Directus 客户端配置
const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.btdms.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin_test_password';

// 测试用户配置
const TEST_USERS = [
  {
    email: 'manager@test.btdms.local',
    password: 'password',
    role: '00000000-0000-0000-0000-000000000001',
    first_name: 'Test',
    last_name: 'Manager',
  },
  {
    email: 'descriptor@test.btdms.local',
    password: 'password',
    role: '00000000-0000-0000-0000-000000000002',
    first_name: 'Test',
    last_name: 'Descriptor',
  },
  {
    email: 'reader@test.btdms.local',
    password: 'password',
    role: '00000000-0000-0000-0000-000000000003',
    first_name: 'Test',
    last_name: 'Reader',
  },
];

// 测试数据集配置
const TEST_DATASETS = [
  {
    table_name: 'test_customers_2024',
    table_alias: '测试客户数据',
    status: 'visible',
    source_type: 'excel',
    description: 'E2E 测试用的客户数据集',
    record_count: 100,
  },
  {
    table_name: 'test_products_2024',
    table_alias: '测试产品数据',
    status: 'visible',
    source_type: 'excel',
    description: 'E2E 测试用的产品数据集',
    record_count: 50,
  },
];

/**
 * 主函数
 */
async function main() {
  console.log('🌱 开始为 E2E 测试创建种子数据...');

  try {
    // 创建 Directus 客户端
    const client = createClient(DIRECTUS_URL);

    // 登录管理员账户
    console.log('🔐 登录管理员账户...');
    await client.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    console.log('✅ 管理员登录成功');

    // 更新测试用户密码（确保密码正确）
    console.log('👥 更新测试用户密码...');
    for (const user of TEST_USERS) {
      try {
        await client.request({
          method: 'PATCH',
          path: '/users',
          body: {
            filter: { email: { _eq: user.email } },
            data: { password: user.password },
          },
        });
        console.log(`✅ 已更新用户: ${user.email}`);
      } catch (error) {
        console.log(`⚠️  用户更新失败或已存在: ${user.email}`);
      }
    }

    // 创建测试数据集
    console.log('📊 创建测试数据集...');
    for (const dataset of TEST_DATASETS) {
      try {
        const existing = await client.request({
          method: 'GET',
          path: '/items/bt_dataset_registry',
          params: {
            filter: { table_name: { _eq: dataset.table_name } },
          },
        });

        if (existing.data.length === 0) {
          await client.request({
            method: 'POST',
            path: '/items/bt_dataset_registry',
            body: dataset,
          });
          console.log(`✅ 已创建数据集: ${dataset.table_alias}`);
        } else {
          console.log(`ℹ️  数据集已存在: ${dataset.table_alias}`);
        }
      } catch (error) {
        console.log(`⚠️  数据集创建失败: ${dataset.table_alias}`, error.message);
      }
    }

    // 创建用户-库权限关系
    console.log('🔐 创建用户-库权限关系...');
    const datasets = await client.request({
      method: 'GET',
      path: '/items/bt_dataset_registry',
    });

    const descriptorUser = await client.request({
      method: 'GET',
      path: '/users',
      params: {
        filter: { email: { _eq: 'descriptor@test.btdms.local' } },
      },
    });

    const readerUser = await client.request({
      method: 'GET',
      path: '/users',
      params: {
        filter: { email: { _eq: 'reader@test.btdms.local' } },
      },
    });

    if (datasets.data.length > 0 && descriptorUser.data.length > 0) {
      const datasetId = datasets.data[0].id;

      // 为库著用户创建权限
      try {
        await client.request({
          method: 'POST',
          path: '/items/bt_user_library_permissions',
          body: {
            user_id: descriptorUser.data[0].id,
            library_id: datasetId,
            template: 'editor',
            enabled: true,
          },
        });
        console.log('✅ 已为库著用户创建权限');
      } catch (error) {
        console.log('⚠️  库著用户权限创建失败或已存在');
      }

      // 为库查用户创建权限
      if (readerUser.data.length > 0) {
        try {
          await client.request({
            method: 'POST',
            path: '/items/bt_user_library_permissions',
            body: {
              user_id: readerUser.data[0].id,
              library_id: datasetId,
              template: 'reader',
              enabled: true,
            },
          });
          console.log('✅ 已为库查用户创建权限');
        } catch (error) {
          console.log('⚠️  库查用户权限创建失败或已存在');
        }
      }
    }

    console.log('');
    console.log('✅ 测试数据种子创建完成！');
    console.log('');
    console.log('测试用户账户:');
    console.log('  - manager@test.btdms.local / password');
    console.log('  - descriptor@test.btdms.local / password');
    console.log('  - reader@test.btdms.local / password');
    console.log('');

  } catch (error) {
    console.error('❌ 种子数据创建失败:', error);
    process.exit(1);
  }
}

// 运行脚本
main().catch((error) => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});
