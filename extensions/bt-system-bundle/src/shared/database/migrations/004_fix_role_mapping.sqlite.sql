-- Migration: Fix bt_user_library_permissions role mapping
-- Version: 004
-- Description: Repair historical role_id data for SQLite development databases
-- Database: SQLite

-- SQLite 003 migration has no trigger, so only repair existing rows here.
UPDATE bt_user_library_permissions
SET role_id = (
    SELECT role
    FROM directus_users
    WHERE directus_users.id = bt_user_library_permissions.user_id
)
WHERE enabled = 1
  AND (
    role_id IS NULL
    OR role_id = user_id
  )
  AND EXISTS (
    SELECT 1
    FROM directus_users
    WHERE directus_users.id = bt_user_library_permissions.user_id
      AND directus_users.role IS NOT NULL
  );
