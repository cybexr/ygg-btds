# Database Migrations

This directory contains SQL migration files for the BT Dataset Management System.

## Migration Files

### 001_create_registry.sql
**Database**: PostgreSQL (Production)
**Purpose**: Creates the `bt_dataset_registry` table - the core metadata table for all dataset collections.

#### Table Structure

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PRIMARY KEY | Auto-incrementing primary key |
| `collection_name` | VARCHAR(255) UNIQUE | Unique Directus collection name (e.g., `bt_customer_data_2024`) |
| `display_name` | VARCHAR(255) | Human-readable name (e.g., "Customer Data 2024") |
| `status` | VARCHAR(50) | Dataset status: `draft`/`active`/`hidden` |
| `source_file_name` | VARCHAR(512) | Original Excel file name |
| `record_count` | INTEGER | Total records in dataset |
| `field_schema_json` | JSONB | Field schema definition |
| `last_import_job_id` | INTEGER | Reference to last import job |
| `created_user_id` | INTEGER FK | Creator user ID |
| `updated_user_id` | INTEGER FK | Last updater user ID |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp (auto-updated) |
| `description` | TEXT | Dataset description |
| `tags` | JSONB | Category tags array |

#### Indexes
- `idx_bt_dataset_registry_collection_name`: Unique lookup by collection name
- `idx_bt_dataset_registry_status`: Filter by status
- `idx_bt_dataset_registry_created_at`: Sort by creation time
- `idx_bt_dataset_registry_created_user`: Filter by creator

#### Triggers
- `trigger_update_bt_dataset_registry_updated_at`: Auto-update `updated_at` on row modification

### 001_create_registry.sqlite.sql
**Database**: SQLite (Development/Testing)
**Purpose**: SQLite-compatible version of the registry table for local development.

#### Key Differences from PostgreSQL Version
- Uses `INTEGER PRIMARY KEY AUTOINCREMENT` instead of `SERIAL`
- JSON stored as `TEXT` instead of `JSONB`
- Foreign key constraints omitted (SQLite limitation)
- Timestamps stored as `TEXT` in ISO8601 format
- Different trigger syntax for auto-updating `updated_at`

## Usage

### Applying Migrations

#### PostgreSQL (Production)
```bash
psql -h localhost -U directus -d directus -f 001_create_registry.sql
```

#### SQLite (Development)
```bash
sqlite3 directus.db < 001_create_registry.sqlite.sql
```

### Rollback
To rollback migration 001:
```sql
DROP TABLE IF EXISTS bt_dataset_registry;
DROP FUNCTION IF EXISTS update_bt_dataset_registry_updated_at();
```

## Validation

After applying migration, verify table structure:

```sql
-- PostgreSQL
\d bt_dataset_registry

-- SQLite
.schema bt_dataset_registry
```

Check if all required columns exist:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'bt_dataset_registry'
ORDER BY ordinal_position;
```

## Integration with Directus

This migration should be applied during Directus extension installation:
1. Extension hook detects installation
2. Loads appropriate migration file based on database type
3. Executes migration SQL
4. Verifies table creation
5. Logs success/failure

## Status Constraints

The `status` column uses CHECK constraint to enforce valid values:
- `draft`: Dataset being imported or configured
- `active`: Dataset visible in navigation and fully functional
- `hidden`: Dataset temporarily hidden from navigation (not deleted)

## Schema JSON Format

The `field_schema_json` column stores field definitions:
```json
{
  "fields": [
    {
      "name": "customer_name",
      "type": "string",
      "nullable": false,
      "length": 255
    },
    {
      "name": "amount",
      "type": "decimal",
      "precision": 10,
      "scale": 2
    }
  ]
}
```
