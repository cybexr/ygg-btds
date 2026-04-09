-- Migration: Create bt_dataset_registry table
-- Version: 001
-- Description: Core metadata table for dataset management system
-- Database: PostgreSQL (primary) / SQLite (development)
-- Directus Version: 11.x

-- Create bt_dataset_registry table
-- Stores metadata for all dynamically created dataset collections
CREATE TABLE IF NOT EXISTS bt_dataset_registry (
    -- Primary identification
    id SERIAL PRIMARY KEY,
    collection_name VARCHAR(255) NOT NULL UNIQUE,

    -- Display information
    display_name VARCHAR(255) NOT NULL,

    -- Status management
    status VARCHAR(50) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'hidden')),

    -- Source tracking
    source_file_name VARCHAR(512),
    record_count INTEGER DEFAULT 0,

    -- Schema storage
    field_schema_json JSONB,

    -- Import job tracking
    last_import_job_id INTEGER,

    -- Audit fields
    created_user_id INTEGER REFERENCES directus_users(id) ON DELETE SET NULL,
    updated_user_id INTEGER REFERENCES directus_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- Additional metadata
    description TEXT,
    tags JSONB DEFAULT '[]'::jsonb
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bt_dataset_registry_collection_name ON bt_dataset_registry(collection_name);
CREATE INDEX IF NOT EXISTS idx_bt_dataset_registry_status ON bt_dataset_registry(status);
CREATE INDEX IF NOT EXISTS idx_bt_dataset_registry_created_at ON bt_dataset_registry(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bt_dataset_registry_created_user ON bt_dataset_registry(created_user_id);

-- Add comment for table documentation
COMMENT ON TABLE bt_dataset_registry IS 'Core metadata registry for all dynamically created dataset collections in the business data management system';

-- Add column comments
COMMENT ON COLUMN bt_dataset_registry.collection_name IS 'Unique identifier for the Directus collection (e.g., bt_customer_data_2024)';
COMMENT ON COLUMN bt_dataset_registry.display_name IS 'Human-readable name for the dataset (e.g., Customer Data 2024)';
COMMENT ON COLUMN bt_dataset_registry.status IS 'Current status: draft (being imported), active (visible in navigation), hidden (temporarily hidden)';
COMMENT ON COLUMN bt_dataset_registry.source_file_name IS 'Original uploaded Excel file name';
COMMENT ON COLUMN bt_dataset_registry.record_count IS 'Total number of records in the dataset';
COMMENT ON COLUMN bt_dataset_registry.field_schema_json IS 'JSON schema defining field types and configurations';
COMMENT ON COLUMN bt_dataset_registry.last_import_job_id IS 'Reference to the last import job for this dataset';
COMMENT ON COLUMN bt_dataset_registry.created_user_id IS 'User who created this dataset record';
COMMENT ON COLUMN bt_dataset_registry.updated_user_id IS 'User who last updated this dataset record';
COMMENT ON COLUMN bt_dataset_registry.description IS 'Detailed description of the dataset purpose and content';
COMMENT ON COLUMN bt_dataset_registry.tags IS 'JSON array of tags for categorization and filtering';

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_bt_dataset_registry_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_bt_dataset_registry_updated_at
    BEFORE UPDATE ON bt_dataset_registry
    FOR EACH ROW
    EXECUTE FUNCTION update_bt_dataset_registry_updated_at();

-- Create default admin dataset entry (optional - for system initialization)
-- This will be inserted during system setup, not migration
