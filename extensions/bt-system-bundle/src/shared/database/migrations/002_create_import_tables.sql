-- Migration: Create import tracking and audit log tables
-- Version: 002
-- Description: Import job tracking, error logging, permission sync, and action audit tables
-- Database: PostgreSQL (primary) / SQLite (development)
-- Directus Version: 11.x

-- Create bt_import_jobs table
-- Tracks the status and progress of data import jobs
CREATE TABLE IF NOT EXISTS bt_import_jobs (
    -- Primary identification
    id SERIAL PRIMARY KEY,

    -- Job identification
    job_identifier VARCHAR(255) NOT NULL UNIQUE,
    dataset_registry_id INTEGER REFERENCES bt_dataset_registry(id) ON DELETE CASCADE,

    -- Job information
    source_file_name VARCHAR(512) NOT NULL,
    file_size_bytes BIGINT,

    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),

    -- Progress tracking
    total_rows INTEGER DEFAULT 0,
    processed_rows INTEGER DEFAULT 0,
    failed_rows INTEGER DEFAULT 0,
    success_rows INTEGER DEFAULT 0,

    -- Timing information
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    estimated_completion_at TIMESTAMP,

    -- Error tracking
    error_summary TEXT,
    has_errors BOOLEAN DEFAULT FALSE,

    -- Import configuration
    import_options JSONB DEFAULT '{}'::jsonb,
    batch_size INTEGER DEFAULT 1000,

    -- Audit fields
    created_user_id INTEGER REFERENCES directus_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create bt_import_errors table
-- Stores detailed error information for each failed row during import
CREATE TABLE IF NOT EXISTS bt_import_errors (
    -- Primary identification
    id SERIAL PRIMARY KEY,

    -- Job reference
    import_job_id INTEGER NOT NULL REFERENCES bt_import_jobs(id) ON DELETE CASCADE,

    -- Row identification
    row_number INTEGER NOT NULL,
    sheet_name VARCHAR(255),

    -- Error details
    error_type VARCHAR(100),
    error_message TEXT NOT NULL,
    field_name VARCHAR(255),

    -- Row data snapshot
    row_data JSONB,

    -- Severity and categorization
    severity VARCHAR(50) DEFAULT 'error'
        CHECK (severity IN ('info', 'warning', 'error', 'critical')),

    -- Resolution tracking
    is_resolved BOOLEAN DEFAULT FALSE,
    resolution_notes TEXT,

    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create bt_permission_sync_logs table
-- Tracks permission synchronization operations for dataset collections
CREATE TABLE IF NOT EXISTS bt_permission_sync_logs (
    -- Primary identification
    id SERIAL PRIMARY KEY,

    -- Sync operation details
    operation_type VARCHAR(50) NOT NULL
        CHECK (operation_type IN ('create', 'update', 'delete', 'bulk_sync')),

    -- Target collection
    collection_name VARCHAR(255) NOT NULL,
    dataset_registry_id INTEGER REFERENCES bt_dataset_registry(id) ON DELETE CASCADE,

    -- Permission details
    permission_type VARCHAR(50),
    role_id INTEGER REFERENCES directus_roles(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES directus_users(id) ON DELETE SET NULL,

    -- Sync status
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),

    -- Operation details
    permissions_before JSONB,
    permissions_after JSONB,
    changes_made JSONB,

    -- Error tracking
    error_message TEXT,

    -- Audit fields
    performed_by_user_id INTEGER REFERENCES directus_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create bt_action_audit_logs table
-- Comprehensive audit log for high-risk operations and system actions
CREATE TABLE IF NOT EXISTS bt_action_audit_logs (
    -- Primary identification
    id SERIAL PRIMARY KEY,

    -- Action details
    action_type VARCHAR(100) NOT NULL,
    action_category VARCHAR(50) NOT NULL
        CHECK (action_category IN ('dataset_import', 'dataset_delete', 'permission_change', 'schema_change', 'bulk_operation', 'system_config')),

    -- Target identification
    target_type VARCHAR(100),
    target_id VARCHAR(255),
    target_name VARCHAR(255),

    -- Operation details
    operation_details JSONB,
    changes_summary TEXT,

    -- User context
    performed_by_user_id INTEGER REFERENCES directus_users(id) ON DELETE SET NULL,
    performed_by_role_id INTEGER REFERENCES directus_roles(id) ON DELETE SET NULL,
    user_ip_address VARCHAR(45),
    user_agent TEXT,

    -- Result tracking
    status VARCHAR(50) NOT NULL DEFAULT 'success'
        CHECK (status IN ('success', 'failed', 'partial')),
    result_message TEXT,

    -- Risk assessment
    risk_level VARCHAR(50) DEFAULT 'medium'
        CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),

    -- Approval tracking (for high-risk operations)
    requires_approval BOOLEAN DEFAULT FALSE,
    approved_by_user_id INTEGER REFERENCES directus_users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,

    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create indexes for bt_import_jobs
CREATE INDEX IF NOT EXISTS idx_bt_import_jobs_job_identifier ON bt_import_jobs(job_identifier);
CREATE INDEX IF NOT EXISTS idx_bt_import_jobs_dataset_registry_id ON bt_import_jobs(dataset_registry_id);
CREATE INDEX IF NOT EXISTS idx_bt_import_jobs_status ON bt_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_bt_import_jobs_created_at ON bt_import_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bt_import_jobs_created_user ON bt_import_jobs(created_user_id);
CREATE INDEX IF NOT EXISTS idx_bt_import_jobs_has_errors ON bt_import_jobs(has_errors) WHERE has_errors = TRUE;

-- Create indexes for bt_import_errors
CREATE INDEX IF NOT EXISTS idx_bt_import_errors_import_job_id ON bt_import_errors(import_job_id);
CREATE INDEX IF NOT EXISTS idx_bt_import_errors_row_number ON bt_import_errors(row_number);
CREATE INDEX IF NOT EXISTS idx_bt_import_errors_severity ON bt_import_errors(severity);
CREATE INDEX IF NOT EXISTS idx_bt_import_errors_is_resolved ON bt_import_errors(is_resolved) WHERE is_resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_bt_import_errors_error_type ON bt_import_errors(error_type);
CREATE INDEX IF NOT EXISTS idx_bt_import_errors_created_at ON bt_import_errors(created_at DESC);

-- Create indexes for bt_permission_sync_logs
CREATE INDEX IF NOT EXISTS idx_bt_permission_sync_logs_collection_name ON bt_permission_sync_logs(collection_name);
CREATE INDEX IF NOT EXISTS idx_bt_permission_sync_logs_dataset_registry_id ON bt_permission_sync_logs(dataset_registry_id);
CREATE INDEX IF NOT EXISTS idx_bt_permission_sync_logs_operation_type ON bt_permission_sync_logs(operation_type);
CREATE INDEX IF NOT EXISTS idx_bt_permission_sync_logs_status ON bt_permission_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_bt_permission_sync_logs_performed_by_user_id ON bt_permission_sync_logs(performed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_bt_permission_sync_logs_role_id ON bt_permission_sync_logs(role_id);
CREATE INDEX IF NOT EXISTS idx_bt_permission_sync_logs_created_at ON bt_permission_sync_logs(created_at DESC);

-- Create indexes for bt_action_audit_logs
CREATE INDEX IF NOT EXISTS idx_bt_action_audit_logs_action_type ON bt_action_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_bt_action_audit_logs_action_category ON bt_action_audit_logs(action_category);
CREATE INDEX IF NOT EXISTS idx_bt_action_audit_logs_target_type_id ON bt_action_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_bt_action_audit_logs_performed_by_user_id ON bt_action_audit_logs(performed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_bt_action_audit_logs_status ON bt_action_audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_bt_action_audit_logs_risk_level ON bt_action_audit_logs(risk_level);
CREATE INDEX IF NOT EXISTS idx_bt_action_audit_logs_created_at ON bt_action_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bt_action_audit_logs_requires_approval ON bt_action_audit_logs(requires_approval) WHERE requires_approval = TRUE;

-- Add table comments
COMMENT ON TABLE bt_import_jobs IS 'Tracks data import job status, progress, and results for dataset uploads';
COMMENT ON TABLE bt_import_errors IS 'Stores detailed error information for each failed row during data import';
COMMENT ON TABLE bt_permission_sync_logs IS 'Logs all permission synchronization operations for dataset collections';
COMMENT ON TABLE bt_action_audit_logs IS 'Comprehensive audit log for high-risk operations and system actions';

-- Add column comments for bt_import_jobs
COMMENT ON COLUMN bt_import_jobs.job_identifier IS 'Unique identifier for the import job (UUID)';
COMMENT ON COLUMN bt_import_jobs.dataset_registry_id IS 'Reference to the dataset registry entry being imported';
COMMENT ON COLUMN bt_import_jobs.source_file_name IS 'Name of the uploaded source file';
COMMENT ON COLUMN bt_import_jobs.file_size_bytes IS 'Size of the source file in bytes';
COMMENT ON COLUMN bt_import_jobs.status IS 'Current job status: pending, running, completed, failed, cancelled';
COMMENT ON COLUMN bt_import_jobs.total_rows IS 'Total number of rows to import';
COMMENT ON COLUMN bt_import_jobs.processed_rows IS 'Number of rows processed so far';
COMMENT ON COLUMN bt_import_jobs.failed_rows IS 'Number of rows that failed to import';
COMMENT ON COLUMN bt_import_jobs.success_rows IS 'Number of rows successfully imported';
COMMENT ON COLUMN bt_import_jobs.started_at IS 'Timestamp when the import job started';
COMMENT ON COLUMN bt_import_jobs.completed_at IS 'Timestamp when the import job completed';
COMMENT ON COLUMN bt_import_jobs.estimated_completion_at IS 'Estimated completion time based on progress';
COMMENT ON COLUMN bt_import_jobs.error_summary IS 'Summary of errors if the job failed';
COMMENT ON COLUMN bt_import_jobs.has_errors IS 'Flag indicating if any errors occurred during import';
COMMENT ON COLUMN bt_import_jobs.import_options IS 'JSON configuration options used for import';
COMMENT ON COLUMN bt_import_jobs.batch_size IS 'Number of rows processed per batch';

-- Add column comments for bt_import_errors
COMMENT ON COLUMN bt_import_errors.import_job_id IS 'Reference to the import job';
COMMENT ON COLUMN bt_import_errors.row_number IS 'Row number in the source file';
COMMENT ON COLUMN bt_import_errors.sheet_name IS 'Sheet name for Excel files';
COMMENT ON COLUMN bt_import_errors.error_type IS 'Type of error (validation, constraint, format, etc.)';
COMMENT ON COLUMN bt_import_errors.error_message IS 'Detailed error message';
COMMENT ON COLUMN bt_import_errors.field_name IS 'Name of the field that caused the error';
COMMENT ON COLUMN bt_import_errors.row_data IS 'Snapshot of the row data that failed';
COMMENT ON COLUMN bt_import_errors.severity IS 'Error severity: info, warning, error, critical';
COMMENT ON COLUMN bt_import_errors.is_resolved IS 'Flag indicating if the error has been resolved';
COMMENT ON COLUMN bt_import_errors.resolution_notes IS 'Notes on how the error was resolved';

-- Add column comments for bt_permission_sync_logs
COMMENT ON COLUMN bt_permission_sync_logs.operation_type IS 'Type of sync operation: create, update, delete, bulk_sync';
COMMENT ON COLUMN bt_permission_sync_logs.collection_name IS 'Name of the collection being synced';
COMMENT ON COLUMN bt_permission_sync_logs.dataset_registry_id IS 'Reference to the dataset registry';
COMMENT ON COLUMN bt_permission_sync_logs.permission_type IS 'Type of permission (read, create, update, delete, etc.)';
COMMENT ON COLUMN bt_permission_sync_logs.role_id IS 'Role ID if syncing role permissions';
COMMENT ON COLUMN bt_permission_sync_logs.user_id IS 'User ID if syncing user permissions';
COMMENT ON COLUMN bt_permission_sync_logs.status IS 'Sync status: pending, in_progress, completed, failed';
COMMENT ON COLUMN bt_permission_sync_logs.permissions_before IS 'Permission state before sync';
COMMENT ON COLUMN bt_permission_sync_logs.permissions_after IS 'Permission state after sync';
COMMENT ON COLUMN bt_permission_sync_logs.changes_made IS 'Summary of changes made during sync';
COMMENT ON COLUMN bt_permission_sync_logs.error_message IS 'Error message if sync failed';
COMMENT ON COLUMN bt_permission_sync_logs.performed_by_user_id IS 'User who performed the sync operation';

-- Add column comments for bt_action_audit_logs
COMMENT ON COLUMN bt_action_audit_logs.action_type IS 'Specific action performed (e.g., delete_dataset, change_permissions)';
COMMENT ON COLUMN bt_action_audit_logs.action_category IS 'Category of action: dataset_import, dataset_delete, permission_change, schema_change, bulk_operation, system_config';
COMMENT ON COLUMN bt_action_audit_logs.target_type IS 'Type of target (collection, field, permission, etc.)';
COMMENT ON COLUMN bt_action_audit_logs.target_id IS 'ID of the target entity';
COMMENT ON COLUMN bt_action_audit_logs.target_name IS 'Name of the target entity';
COMMENT ON COLUMN bt_action_audit_logs.operation_details IS 'Detailed JSON of operation parameters and data';
COMMENT ON COLUMN bt_action_audit_logs.changes_summary IS 'Human-readable summary of changes';
COMMENT ON COLUMN bt_action_audit_logs.performed_by_user_id IS 'User who performed the action';
COMMENT ON COLUMN bt_action_audit_logs.performed_by_role_id IS 'Role of the user who performed the action';
COMMENT ON COLUMN bt_action_audit_logs.user_ip_address IS 'IP address of the user';
COMMENT ON COLUMN bt_action_audit_logs.user_agent IS 'User agent string of the client';
COMMENT ON COLUMN bt_action_audit_logs.status IS 'Action result status: success, failed, partial';
COMMENT ON COLUMN bt_action_audit_logs.result_message IS 'Detailed result message';
COMMENT ON COLUMN bt_action_audit_logs.risk_level IS 'Risk level: low, medium, high, critical';
COMMENT ON COLUMN bt_action_audit_logs.requires_approval IS 'Flag indicating if action required approval';
COMMENT ON COLUMN bt_action_audit_logs.approved_by_user_id IS 'User who approved the action';
COMMENT ON COLUMN bt_action_audit_logs.approved_at IS 'Timestamp when approval was granted';

-- Create function to update updated_at timestamp for bt_import_jobs
CREATE OR REPLACE FUNCTION update_bt_import_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at for bt_import_jobs
CREATE TRIGGER trigger_update_bt_import_jobs_updated_at
    BEFORE UPDATE ON bt_import_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_bt_import_jobs_updated_at();
