-- Migration: Fix bt_user_library_permissions role mapping
-- Version: 004
-- Description: Stop reusing user_id as role_id and repair existing mappings
-- Database: PostgreSQL

-- Remove the broken trigger that copied user_id into role_id.
DROP TRIGGER IF EXISTS trigger_ensure_bt_user_library_permissions_role ON bt_user_library_permissions;
DROP FUNCTION IF EXISTS ensure_bt_user_library_permissions_role();

-- Backfill invalid role mappings from each user's current Directus role.
UPDATE bt_user_library_permissions AS ulp
SET role_id = du.role
FROM directus_users AS du
WHERE du.id = ulp.user_id
  AND ulp.enabled = true
  AND du.role IS NOT NULL
  AND (
    ulp.role_id IS NULL
    OR ulp.role_id = ulp.user_id
  );

-- Fail fast on new writes that omit role_id for enabled permissions.
CREATE OR REPLACE FUNCTION ensure_bt_user_library_permissions_role()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.enabled = true AND NEW.role_id IS NULL THEN
        RAISE EXCEPTION 'bt_user_library_permissions.role_id must reference directus_roles.id when enabled';
    END IF;

    IF NEW.role_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM directus_roles
        WHERE id = NEW.role_id
    ) THEN
        RAISE EXCEPTION 'bt_user_library_permissions.role_id % does not exist in directus_roles', NEW.role_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ensure_bt_user_library_permissions_role
    BEFORE INSERT OR UPDATE ON bt_user_library_permissions
    FOR EACH ROW
    EXECUTE FUNCTION ensure_bt_user_library_permissions_role();

-- Surface any remaining rows that still need manual remediation.
DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO invalid_count
    FROM bt_user_library_permissions
    WHERE enabled = true
      AND role_id IS NULL;

    IF invalid_count > 0 THEN
        RAISE WARNING '% enabled bt_user_library_permissions rows still have NULL role_id after migration', invalid_count;
    END IF;
END;
$$;

