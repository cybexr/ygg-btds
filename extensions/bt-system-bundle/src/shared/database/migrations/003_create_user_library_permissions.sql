-- Migration: Create bt_user_library_permissions table
-- Version: 003
-- Description: User-library permission matrix management
-- Database: PostgreSQL (primary) / SQLite (development)
-- Directus Version: 11.x

-- Create bt_user_library_permissions table
-- Manages user permissions for specific libraries/datasets
CREATE TABLE IF NOT EXISTS bt_user_library_permissions (
    -- Primary identification
    id SERIAL PRIMARY KEY,

    -- User and library identification
    user_id INTEGER NOT NULL REFERENCES directus_users(id) ON DELETE CASCADE,
    library_id VARCHAR(255) NOT NULL, -- Collection name or library identifier

    -- Permission template
    template VARCHAR(100) NOT NULL
        CHECK (template IN ('ds-descriptor-crud', 'ds-reader-read')),

    -- Permission state
    enabled BOOLEAN NOT NULL DEFAULT true,

    -- Role mapping (links to Directus permissions)
    role_id INTEGER REFERENCES directus_roles(id) ON DELETE SET NULL,

    -- Custom permissions (optional, overrides template defaults)
    custom_permissions_json JSONB,

    -- Audit fields
    created_user_id INTEGER REFERENCES directus_users(id) ON DELETE SET NULL,
    updated_user_id INTEGER REFERENCES directus_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- Ensure unique user-library-template combination
    CONSTRAINT unique_user_library_template UNIQUE (user_id, library_id, template)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bt_user_library_permissions_user_id ON bt_user_library_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_bt_user_library_permissions_library_id ON bt_user_library_permissions(library_id);
CREATE INDEX IF NOT EXISTS idx_bt_user_library_permissions_template ON bt_user_library_permissions(template);
CREATE INDEX IF NOT EXISTS idx_bt_user_library_permissions_enabled ON bt_user_library_permissions(enabled);
CREATE INDEX IF NOT EXISTS idx_bt_user_library_permissions_role_id ON bt_user_library_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_bt_user_library_permissions_created_at ON bt_user_library_permissions(created_at DESC);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_bt_user_library_permissions_user_library ON bt_user_library_permissions(user_id, library_id);

-- Add comment for table documentation
COMMENT ON TABLE bt_user_library_permissions IS 'User-library permission matrix for managing granular access to datasets and libraries';

-- Add column comments
COMMENT ON COLUMN bt_user_library_permissions.user_id IS 'Reference to the user in directus_users';
COMMENT ON COLUMN bt_user_library_permissions.library_id IS 'Library or dataset collection identifier';
COMMENT ON COLUMN bt_user_library_permissions.template IS 'Permission template: ds-descriptor-crud (full access) or ds-reader-read (read only)';
COMMENT ON COLUMN bt_user_library_permissions.enabled IS 'Whether the permission is currently active';
COMMENT ON COLUMN bt_user_library_permissions.role_id IS 'Link to Directus role for system-level permission enforcement';
COMMENT ON COLUMN bt_user_library_permissions.custom_permissions_json IS 'Optional JSON override of template default permissions';
COMMENT ON COLUMN bt_user_library_permissions.created_user_id IS 'User who granted this permission';
COMMENT ON COLUMN bt_user_library_permissions.updated_user_id IS 'User who last modified this permission';

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_bt_user_library_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_bt_user_library_permissions_updated_at ON bt_user_library_permissions;
CREATE TRIGGER trigger_update_bt_user_library_permissions_updated_at
    BEFORE UPDATE ON bt_user_library_permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_bt_user_library_permissions_updated_at();

-- Create trigger to automatically create role_id if not set
CREATE OR REPLACE FUNCTION ensure_bt_user_library_permissions_role()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role_id IS NULL AND NEW.enabled = true THEN
        -- Create a unique role for this user-library combination if needed
        -- For now, we'll use the user_id as the role identifier
        -- In Directus, permissions can be assigned directly to users via user-specific roles
        NEW.role_id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for role management
DROP TRIGGER IF EXISTS trigger_ensure_bt_user_library_permissions_role ON bt_user_library_permissions;
CREATE TRIGGER trigger_ensure_bt_user_library_permissions_role
    BEFORE INSERT ON bt_user_library_permissions
    FOR EACH ROW
    EXECUTE FUNCTION ensure_bt_user_library_permissions_role();
