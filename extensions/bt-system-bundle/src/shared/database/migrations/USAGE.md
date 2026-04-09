# Migration Usage Guide

This guide explains how to use the database migrations in the BT Dataset Management System.

## Quick Start

### 1. Automatic Migration (Recommended)

The migrations will be automatically applied when the Directus extension is installed:

```typescript
// In your extension's index.ts or hook file
import { initializeDatabase } from './shared/database/migrations';

export default {
	id: 'bt-system-bundle',
	hook: 'init', // or 'install'
	handler: async ({ database, getSchema }) => {
		const databaseType = process.env.DB_CLIENT === 'pg' ? 'postgresql' : 'sqlite';

		try {
			await initializeDatabase(database, databaseType);
			console.info('Database initialized successfully');
		} catch (error) {
			console.error('Database initialization failed:', error);
			throw error;
		}
	},
};
```

### 2. Manual Migration (Development)

For local development, you can apply migrations manually:

#### PostgreSQL
```bash
# Using psql
psql -h localhost -U directus -d directus \
  -f extensions/bt-system-bundle/src/shared/database/migrations/001_create_registry.sql

# Verify
psql -h localhost -U directus -d directus \
  -f extensions/bt-system-bundle/src/shared/database/migrations/validate.sql
```

#### SQLite
```bash
# Using sqlite3
sqlite3 directus.db < extensions/bt-system-bundle/src/shared/database/migrations/001_create_registry.sqlite.sql

# Verify
sqlite3 directus.db < extensions/bt-system-bundle/src/shared/database/migrations/validate.sqlite.sql
```

## Migration Files

| File | Purpose | Database |
|------|---------|----------|
| `001_create_registry.sql` | Creates registry table (production) | PostgreSQL |
| `001_create_registry.sqlite.sql` | Creates registry table (development) | SQLite |
| `validate.sql` | Validates table structure | PostgreSQL |
| `validate.sqlite.sql` | Validates table structure | SQLite |
| `index.ts` | Migration runner logic | Both |
| `test.ts` | Test utilities | Both |

## Table Structure

After migration, the `bt_dataset_registry` table will be available:

```typescript
// Example usage in your endpoint
import { defineEndpoint } from '@directus/extensions-sdk';

export default defineEndpoint((router, { database }) => {
	// Query the registry table
	const datasets = await database
		.select('*')
		.from('bt_dataset_registry')
		.where({ status: 'active' });

	// Create a new dataset entry
	await database.insert({
		collection_name: 'bt_customer_data_2024',
		display_name: 'Customer Data 2024',
		status: 'active',
		source_file_name: 'customers.xlsx',
		record_count: 0,
		field_schema_json: { fields: [] },
	}).into('bt_dataset_registry');
});
```

## Validation

After applying migrations, verify the table structure:

### Check Table Exists
```sql
-- PostgreSQL
SELECT EXISTS (
	SELECT FROM information_schema.tables
	WHERE table_name = 'bt_dataset_registry'
);

-- SQLite
SELECT name FROM sqlite_master
WHERE type='table' AND name='bt_dataset_registry';
```

### Check Column Types
```sql
-- PostgreSQL
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'bt_dataset_registry'
ORDER BY ordinal_position;

-- SQLite
PRAGMA table_info(bt_dataset_registry);
```

### Test the Migration
```typescript
import { runMigrationTests } from './shared/database/migrations/test';

// Run validation tests
const results = runMigrationTests();
const allPassed = results.every(r => r.success);

if (allPassed) {
	console.info('All migration tests passed!');
}
```

## Status Values

The `status` column accepts these values:

| Status | Description |
|--------|-------------|
| `draft` | Dataset is being imported or configured |
| `active` | Dataset is visible in navigation and functional |
| `hidden` | Dataset is temporarily hidden (not deleted) |

## JSON Schema Format

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

## Troubleshooting

### Migration Fails
- Check database connection settings in `.env`
- Verify database user has CREATE TABLE permissions
- Review migration logs for specific error messages

### Table Already Exists
- Migrations use `IF NOT EXISTS` to avoid conflicts
- To recreate, drop the table first: `DROP TABLE bt_dataset_registry;`

### Permission Errors
- Ensure the database user has necessary permissions:
  - PostgreSQL: CREATE, SELECT, INSERT, UPDATE, DELETE
  - SQLite: File system write permissions

## Rollback

To rollback the migration:

```typescript
import { rollbackMigration } from './shared/database/migrations';

await rollbackMigration({
	db: database,
	databaseType: 'postgresql',
	migrationsPath: __dirname,
	logger: console,
}, 1); // Rollback version 001
```

Or manually:
```sql
-- PostgreSQL
DROP TABLE IF EXISTS bt_dataset_registry CASCADE;
DROP FUNCTION IF EXISTS update_bt_dataset_registry_updated_at();

-- SQLite
DROP TABLE IF EXISTS bt_dataset_registry;
```

## Best Practices

1. **Always backup** before running migrations in production
2. **Test migrations** in development environment first
3. **Use transactions** for complex migration sequences
4. **Version control** all migration files
5. **Document breaking changes** in migration comments
6. **Validate** after each migration using provided validation scripts

## Next Steps

After successful migration:
1. Implement Excel import endpoint
2. Create dynamic collection generation logic
3. Build user interface for dataset management
4. Add authorization and permission checks
5. Implement dataset status workflows
