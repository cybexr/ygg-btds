-- Migration: Create bt_user_library_permissions table
-- Version: 003
-- Description: User-library permission matrix management
-- Database: SQLite (development)
-- Directus Version: 11.x

-- Create bt_user_library_permissions table
-- Manages user permissions for specific libraries/datasets
CREATE TABLE IF NOT EXISTS bt_user_library_permissions (
    -- Primary identification
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- User and library identification
    user_id INTEGER NOT NULL REFERENCES directus_users(id) ON DELETE CASCADE,
    library_id TEXT NOT NULL, -- Collection name or library identifier

    -- Permission template
    template TEXT NOT NULL
        CHECK (template IN ('ds-descriptor-crud', 'ds-reader-read')),

    -- Permission state
    enabled INTEGER NOT NULL DEFAULT 1, -- SQLite uses INTEGER for BOOLEAN

    -- Role mapping (links to Directus permissions)
    role_id INTEGER REFERENCES directus_roles(id) ON DELETE SET NULL,

    -- Custom permissions (optional, overrides template defaults)
    custom_permissions_json TEXT, -- SQLite stores JSON as TEXT

    -- Audit fields
    created_user_id INTEGER REFERENCES directus_users(id) ON DELETE SET NULL,
    updated_user_id INTEGER REFERENCES directus_users(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL,

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

-- Note: SQLite doesn't support table comments
-- Note: SQLite doesn't support triggers with the same syntax as PostgreSQL
-- For production PostgreSQL deployment, use the .sql version instead
