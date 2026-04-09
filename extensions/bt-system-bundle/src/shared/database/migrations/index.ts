/**
 * Migration Runner for BT Dataset Management System
 *
 * This module handles database migration execution during Directus extension installation.
 * It supports both PostgreSQL (production) and SQLite (development) environments.
 */

import type { Database } from 'bun:sqlite';
import type { Pool, PoolClient } from 'pg';

export interface MigrationContext {
	/** Database client (PostgreSQL Pool or SQLite instance) */
	db: Pool | Database | any;

	/** Database type: 'postgresql' | 'sqlite' */
	databaseType: 'postgresql' | 'sqlite';

	/** Migration files directory path */
	migrationsPath: string;

	/** Logger function */
	logger?: {
		info: (message: string) => void;
		warn: (message: string) => void;
		error: (message: string) => void;
	};
}

export interface MigrationFile {
	/** Migration file name */
	name: string;

	/** Migration version number */
	version: number;

	/** SQL content */
	sql: string;
}

/**
 * Load migration files from the migrations directory
 */
export async function loadMigrations(
	migrationsPath: string,
	databaseType: 'postgresql' | 'sqlite'
): Promise<MigrationFile[]> {
	// This would typically use filesystem access
	// For now, return the migration we created
	const baseMigration = databaseType === 'postgresql'
		? '001_create_registry.sql'
		: '001_create_registry.sqlite.sql';

	return [{
		name: baseMigration,
		version: 1,
		sql: '', // Will be loaded from filesystem
	}];
}

/**
 * Execute a single migration
 */
export async function executeMigration(
	context: MigrationContext,
	migration: MigrationFile
): Promise<boolean> {
	const { db, databaseType, logger } = context;

	try {
		logger?.info(`Executing migration: ${migration.name}`);

		if (databaseType === 'postgresql') {
			// PostgreSQL execution
			const client = db as Pool;
			await client.query(migration.sql);
		} else {
			// SQLite execution
			const sqlite = db as Database;
			sqlite.exec(migration.sql);
		}

		logger?.info(`Migration ${migration.name} completed successfully`);
		return true;
	} catch (error) {
		logger?.error(`Migration ${migration.name} failed: ${error}`);
		throw error;
	}
}

/**
 * Verify that a migration was applied successfully
 */
export async function verifyMigration(
	context: MigrationContext,
	migration: MigrationFile
): Promise<boolean> {
	const { db, databaseType } = context;

	try {
		if (databaseType === 'postgresql') {
			const client = db as Pool;
			const result = await client.query(`
				SELECT EXISTS (
					SELECT FROM information_schema.tables
					WHERE table_name = 'bt_dataset_registry'
				);
			`);
			return result.rows[0].exists;
		} else {
			const sqlite = db as Database;
			const result = sqlite.query(`
				SELECT name FROM sqlite_master
				WHERE type='table' AND name='bt_dataset_registry'
			`);
			return result !== null && result.length > 0;
		}
	} catch (error) {
		console.error('Verification failed:', error);
		return false;
	}
}

/**
 * Run all pending migrations
 */
export async function runMigrations(context: MigrationContext): Promise<void> {
	const { migrationsPath, databaseType, logger } = context;

	logger?.info(`Starting migrations for ${databaseType} database`);

	const migrations = await loadMigrations(migrationsPath, databaseType);

	for (const migration of migrations) {
		const success = await executeMigration(context, migration);

		if (!success) {
			throw new Error(`Migration ${migration.name} failed`);
		}

		const verified = await verifyMigration(context, migration);
		if (!verified) {
			throw new Error(`Migration ${migration.name} verification failed`);
		}

		logger?.info(`Migration ${migration.name} applied and verified`);
	}

	logger?.info('All migrations completed successfully');
}

/**
 * Rollback a specific migration (use with caution)
 */
export async function rollbackMigration(
	context: MigrationContext,
	version: number
): Promise<void> {
	const { db, databaseType, logger } = context;

	logger?.warn(`Rolling back migration version ${version}`);

	try {
		if (databaseType === 'postgresql') {
			const client = db as Pool;
			await client.query('DROP TABLE IF EXISTS bt_dataset_registry CASCADE;');
			await client.query('DROP FUNCTION IF EXISTS update_bt_dataset_registry_updated_at();');
		} else {
			const sqlite = db as Database;
			sqlite.exec('DROP TABLE IF EXISTS bt_dataset_registry;');
		}

		logger?.info(`Rollback of version ${version} completed`);
	} catch (error) {
		logger?.error(`Rollback failed: ${error}`);
		throw error;
	}
}

/**
 * Migration initialization hook for Directus extension
 */
export async function initializeDatabase(
	db: any,
	databaseType: 'postgresql' | 'sqlite'
): Promise<void> {
	const context: MigrationContext = {
		db,
		databaseType,
		migrationsPath: __dirname,
		logger: {
			info: (msg) => console.info(`[Migration] ${msg}`),
			warn: (msg) => console.warn(`[Migration] ${msg}`),
			error: (msg) => console.error(`[Migration] ${msg}`),
		},
	};

	try {
		await runMigrations(context);
	} catch (error) {
		console.error('Database initialization failed:', error);
		throw error;
	}
}
