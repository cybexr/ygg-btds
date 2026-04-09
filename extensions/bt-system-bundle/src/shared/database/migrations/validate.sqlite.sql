-- Validation script for bt_dataset_registry table structure (SQLite version)
-- Run this after migration to verify all required fields exist

-- SQLite validation
SELECT 'Validating bt_dataset_registry table structure...' AS message;

-- Check table exists
SELECT
    CASE
        WHEN COUNT(*) > 0 THEN 'Table bt_dataset_registry exists'
        ELSE 'ERROR: Table bt_dataset_registry does not exist'
    END AS validation_result
FROM sqlite_master
WHERE type='table' AND name='bt_dataset_registry';

-- Display table structure
SELECT '--- Table Structure ---' AS section;
PRAGMA table_info(bt_dataset_registry);

-- Display indexes
SELECT '--- Indexes ---' AS section;
SELECT
    name AS index_name,
    sql AS index_definition
FROM sqlite_master
WHERE type='index' AND tbl_name='bt_dataset_registry' AND name NOT LIKE 'sqlite_%';

-- Display triggers
SELECT '--- Triggers ---' AS section;
SELECT
    name AS trigger_name,
    sql AS trigger_definition
FROM sqlite_master
WHERE type='trigger' AND tbl_name='bt_dataset_registry';

-- Validate all required columns exist
WITH required_columns AS (
    SELECT 'id' AS column_name UNION
    SELECT 'collection_name' UNION
    SELECT 'display_name' UNION
    SELECT 'status' UNION
    SELECT 'source_file_name' UNION
    SELECT 'record_count' UNION
    SELECT 'field_schema_json' UNION
    SELECT 'last_import_job_id' UNION
    SELECT 'created_user_id' UNION
    SELECT 'updated_user_id' UNION
    SELECT 'created_at' UNION
    SELECT 'updated_at' UNION
    SELECT 'description' UNION
    SELECT 'tags'
),
existing_columns AS (
    SELECT name FROM pragma_table_info('bt_dataset_registry')
)
SELECT
    CASE
        WHEN COUNT(*) = 14 THEN 'All required columns exist'
        ELSE 'ERROR: Missing columns - found ' || COUNT(*) || ' of 14 required'
    END AS column_validation
FROM required_columns rc
LEFT JOIN existing_columns ec ON rc.column_name = ec.name
WHERE ec.name IS NOT NULL;

SELECT 'Validation complete!' AS message;
