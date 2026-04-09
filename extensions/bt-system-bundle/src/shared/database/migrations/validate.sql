-- Validation script for bt_dataset_registry table structure
-- Run this after migration to verify all required fields exist

-- PostgreSQL validation
\echo 'Validating bt_dataset_registry table structure...'

-- Check table exists
DO $$
DECLARE
    table_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'bt_dataset_registry'
    ) INTO table_exists;

    IF NOT table_exists THEN
        RAISE EXCEPTION 'Table bt_dataset_registry does not exist';
    END IF;

    RAISE NOTICE 'Table bt_dataset_registry exists';
END $$;

-- Check all required columns exist
DO $$
DECLARE
    missing_columns TEXT[];
    required_columns TEXT[] := ARRAY[
        'id', 'collection_name', 'display_name', 'status',
        'source_file_name', 'record_count', 'field_schema_json',
        'last_import_job_id', 'created_user_id', 'updated_user_id',
        'created_at', 'updated_at', 'description', 'tags'
    ];
    col_name TEXT;
BEGIN
    FOREACH col_name IN ARRAY required_columns
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'bt_dataset_registry'
            AND column_name = col_name
        ) THEN
            missing_columns := array_append(missing_columns, col_name);
        END IF;
    END LOOP;

    IF array_length(missing_columns, 1) > 0 THEN
        RAISE EXCEPTION 'Missing columns: %', array_to_string(missing_columns, ', ');
    END IF;

    RAISE NOTICE 'All required columns exist';
END $$;

-- Check indexes exist
DO $$
DECLARE
    missing_indexes TEXT[];
    required_indexes TEXT[] := ARRAY[
        'idx_bt_dataset_registry_collection_name',
        'idx_bt_dataset_registry_status',
        'idx_bt_dataset_registry_created_at',
        'idx_bt_dataset_registry_created_user'
    ];
    idx_name TEXT;
BEGIN
    FOREACH idx_name IN ARRAY required_indexes
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE indexname = idx_name
        ) THEN
            missing_indexes := array_append(missing_indexes, idx_name);
        END IF;
    END LOOP;

    IF array_length(missing_indexes, 1) > 0 THEN
        RAISE EXCEPTION 'Missing indexes: %', array_to_string(missing_indexes, ', ');
    END IF;

    RAISE NOTICE 'All required indexes exist';
END $$;

-- Check status constraint exists
DO $$
DECLARE
    constraint_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname LIKE '%bt_dataset_registry%status%'
        AND con_type = 'c'
    ) INTO constraint_exists;

    IF NOT constraint_exists THEN
        RAISE EXCEPTION 'Status check constraint does not exist';
    END IF;

    RAISE NOTICE 'Status constraint exists';
END $$;

-- Display table structure
\echo ''
\echo 'Table Structure:'
\d bt_dataset_registry

\echo ''
\echo 'Column Details:'
SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'bt_dataset_registry'
ORDER BY ordinal_position;

\echo ''
\echo 'Indexes:'
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'bt_dataset_registry';

\echo ''
\echo 'Constraints:'
SELECT
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
JOIN pg_class cl ON cl.oid = c.conrelid
WHERE cl.relname = 'bt_dataset_registry';

\echo ''
\echo 'Validation complete!'
