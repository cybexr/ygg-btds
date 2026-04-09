-- E2E 测试数据库初始化脚本
-- 创建核心元数据表和基础测试用户

-- ============================================
-- 1. 核心元数据表（bt_dataset_registry）
-- ============================================
CREATE TABLE IF NOT EXISTS bt_dataset_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR(255) NOT NULL UNIQUE,
  table_alias VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'visible',
  source_type VARCHAR(50) NOT NULL DEFAULT 'excel',
  created_by UUID REFERENCES directus_users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  description TEXT,
  record_count INTEGER DEFAULT 0,
  INDEX idx_status (status),
  INDEX idx_created_by (created_by)
);

-- 添加表注释
COMMENT ON TABLE bt_dataset_registry IS '业务数据集注册中心表，记录所有动态生成的业务表信息';
COMMENT ON COLUMN bt_dataset_registry.table_name IS '动态生成的 Directus Collection 名称';
COMMENT ON COLUMN bt_dataset_registry.table_alias IS '业务中文别名';
COMMENT ON COLUMN bt_dataset_registry.status IS '可见状态: visible-可见, hidden-隐藏';
COMMENT ON COLUMN bt_dataset_registry.source_type IS '数据来源类型: excel, csv, api';

-- ============================================
-- 2. 创建测试用户角色
-- ============================================

-- 库管角色 (ds-manager)
INSERT INTO directus_roles (id, name, icon, description, admin_access, app_access)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'ds-manager',
  'manage',
  '系统库管 - 具有所有库的管理权限',
  true,
  true
) ON CONFLICT (id) DO NOTHING;

-- 库著角色 (ds-descriptor)
INSERT INTO directus_roles (id, name, icon, description, admin_access, app_access)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'ds-descriptor',
  'description',
  '库著 - 具有授权库的编辑和描述权限',
  false,
  true
) ON CONFLICT (id) DO NOTHING;

-- 库查角色 (ds-reader)
INSERT INTO directus_roles (id, name, icon, description, admin_access, app_access)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'ds-reader',
  'visibility',
  '库查 - 具有授权库的只读权限',
  false,
  true
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 3. 创建测试用户
-- ============================================

-- 测试管理员 (ds-manager)
INSERT INTO directus_users (id, first_name, last_name, email, password, role, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Test',
  'Manager',
  'manager@test.btdms.local',
  '$2a$12$test_hash_replace_with_real', -- 将在首次登录时更新
  '00000000-0000-0000-0000-000000000001',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- 测试库著 (ds-descriptor)
INSERT INTO directus_users (id, first_name, last_name, email, password, role, status)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Test',
  'Descriptor',
  'descriptor@test.btdms.local',
  '$2a$12$test_hash_replace_with_real',
  '00000000-0000-0000-0000-000000000002',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- 测试库查 (ds-reader)
INSERT INTO directus_users (id, first_name, last_name, email, password, role, status)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'Test',
  'Reader',
  'reader@test.btdms.local',
  '$2a$12$test_hash_replace_with_real',
  '00000000-0000-0000-0000-000000000003',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 4. 配置基础权限
-- ============================================

-- 库管拥有所有权限
INSERT INTO directus_permissions (role, collection, action, permissions, validation, fields)
VALUES
  -- 管理员对元数据表的完全权限
  ('00000000-0000-0000-0000-000000000001', 'bt_dataset_registry', 'create', '{"_admin":true}', '{}', null),
  ('00000000-0000-0000-0000-000000000001', 'bt_dataset_registry', 'read', '{"_admin":true}', '{}', null),
  ('00000000-0000-0000-0000-000000000001', 'bt_dataset_registry', 'update', '{"_admin":true}', '{}', null),
  ('00000000-0000-0000-0000-000000000001', 'bt_dataset_registry', 'delete', '{"_admin":true}', '{}', null)
ON CONFLICT DO NOTHING;

-- 库著和库查对元数据表的只读权限
INSERT INTO directus_permissions (role, collection, action, permissions, validation, fields)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'bt_dataset_registry', 'read', '{"_admin":true}', '{}', null),
  ('00000000-0000-0000-0000-000000000003', 'bt_dataset_registry', 'read', '{"_admin":true}', '{}', null)
ON CONFLICT DO NOTHING;

-- ============================================
-- 5. 创建测试辅助函数
-- ============================================

-- 函数：更新元数据表的 updated_at 字段
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 触发器：自动更新 updated_at
DROP TRIGGER IF EXISTS update_bt_dataset_registry_updated_at ON bt_dataset_registry;
CREATE TRIGGER update_bt_dataset_registry_updated_at
  BEFORE UPDATE ON bt_dataset_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 初始化完成
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'BTDMS 测试数据库初始化完成';
  RAISE NOTICE '测试用户创建：';
  RAISE NOTICE '  - manager@test.btdms.local (库管)';
  RAISE NOTICE '  - descriptor@test.btdms.local (库著)';
  RAISE NOTICE '  - reader@test.btdms.local (库查)';
  RAISE NOTICE '默认密码: password (需在首次登录时更新)';
  RAISE NOTICE '========================================';
END $$;
