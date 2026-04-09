-- Migration: Create bt_dataset_registry table
-- Version: 001
-- Description: Core metadata table for dataset management system (SQLite version)
-- Database: SQLite (development/testing)
-- Directus Version: 11.x

-- Create bt_dataset_registry table
-- Stores metadata for all dynamically created dataset collections
CREATE TABLE IF NOT EXISTS bt_dataset_registry (
    -- Primary identification
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_name TEXT NOT NULL UNIQUE,

    -- Display information
    display_name TEXT NOT NULL,

    -- Status management
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'hidden')),

    -- Source tracking
    source_file_name TEXT,
    record_count INTEGER DEFAULT 0,

    -- Schema storage (JSON stored as TEXT in SQLite)
    field_schema_json TEXT,

    -- Import job tracking
    last_import_job_id INTEGER,

    -- Audit fields (foreign keys as INTEGER, no FK constraint in SQLite)
    created_user_id INTEGER,
    updated_user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL,

    -- Additional metadata
    description TEXT,
    tags TEXT DEFAULT '[]'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bt_dataset_registry_collection_name
    ON bt_dataset_registry(collection_name);

CREATE INDEX IF NOT EXISTS idx_bt_dataset_registry_status
    ON bt_dataset_registry(status);

CREATE INDEX IF NOT EXISTS idx_bt_dataset_registry_created_at
    ON bt_dataset_registry(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bt_dataset_registry_created_user
    ON bt_dataset_registry(created_user_id);

-- Create triggers to automatically update updated_at
CREATE TRIGGER IF NOT EXISTS trigger_update_bt_dataset_registry_updated_at
    AFTER UPDATE ON bt_dataset_registry
    FOR EACH ROW
    BEGIN
        UPDATE bt_dataset_registry
        SET updated_at = datetime('now')
        WHERE id = NEW.id;
    END;

-- Note: SQLite doesn't support COMMENT ON syntax
-- Table documentation should be maintained in separate docs or code
