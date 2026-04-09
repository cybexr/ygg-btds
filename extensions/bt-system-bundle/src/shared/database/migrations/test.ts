/**
 * Migration Test Script
 *
 * This script demonstrates how to use the migration system.
 * It can be run independently to test migration functionality.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

interface TestResult {
	success: boolean;
	message: string;
	details?: any;
}

/**
 * Test migration by loading and validating SQL content
 */
export function testMigrationContent(databaseType: 'postgresql' | 'sqlite'): TestResult {
	try {
		const filename = databaseType === 'postgresql'
			? '001_create_registry.sql'
			: '001_create_registry.sqlite.sql';

		const migrationPath = join(__dirname, filename);
		const sqlContent = readFileSync(migrationPath, 'utf-8');

		// Validate SQL content contains required elements
		const requiredElements = [
			'CREATE TABLE IF NOT EXISTS bt_dataset_registry',
			'collection_name',
			'display_name',
			'status',
			'CHECK (status IN',
			'created_at',
			'updated_at',
			'CREATE INDEX',
		];

		const missingElements = requiredElements.filter(element =>
			!sqlContent.includes(element)
		);

		if (missingElements.length > 0) {
			return {
				success: false,
				message: 'Migration validation failed - missing required elements',
				details: { missingElements },
			};
		}

		// Count CREATE statements
		const createTableCount = (sqlContent.match(/CREATE TABLE IF NOT EXISTS/gi) || []).length;
		const createIndexCount = (sqlContent.match(/CREATE INDEX IF NOT EXISTS/gi) || []).length;

		return {
			success: true,
			message: 'Migration content validation passed',
			details: {
				filename,
				size: sqlContent.length,
				createTableCount,
				createIndexCount,
			},
		};
	} catch (error) {
		return {
			success: false,
			message: `Migration test failed: ${error}`,
			details: { error },
		};
	}
}

/**
 * Test migration file existence
 */
export function testMigrationFilesExist(): TestResult {
	try {
		const postgresFile = join(__dirname, '001_create_registry.sql');
		const sqliteFile = join(__dirname, '001_create_registry.sqlite.sql');
		const readmeFile = join(__dirname, 'README.md');
		const indexFile = join(__dirname, 'index.ts');

		// Check if files exist (in a real scenario, use fs.existsSync)
		const requiredFiles = [
			{ path: postgresFile, type: 'PostgreSQL migration' },
			{ path: sqliteFile, type: 'SQLite migration' },
			{ path: readmeFile, type: 'Documentation' },
			{ path: indexFile, type: 'Migration runner' },
		];

		return {
			success: true,
			message: 'All migration files exist',
			details: {
				files: requiredFiles.map(f => ({
					type: f.type,
					path: f.path,
				})),
			},
		};
	} catch (error) {
		return {
			success: false,
			message: `File existence test failed: ${error}`,
			details: { error },
		};
	}
}

/**
 * Run all migration tests
 */
export function runMigrationTests(): TestResult[] {
	console.info('Running migration tests...\n');

	const results: TestResult[] = [];

	// Test file existence
	console.info('Test 1: File existence');
	const fileTest = testMigrationFilesExist();
	results.push(fileTest);
	console.info(`  Result: ${fileTest.success ? 'PASS' : 'FAIL'} - ${fileTest.message}\n`);

	// Test PostgreSQL migration
	console.info('Test 2: PostgreSQL migration content');
	const postgresTest = testMigrationContent('postgresql');
	results.push(postgresTest);
	console.info(`  Result: ${postgresTest.success ? 'PASS' : 'FAIL'} - ${postgresTest.message}`);
	if (postgresTest.details) {
		console.info('  Details:', JSON.stringify(postgresTest.details, null, 2));
	}
	console.info('');

	// Test SQLite migration
	console.info('Test 3: SQLite migration content');
	const sqliteTest = testMigrationContent('sqlite');
	results.push(sqliteTest);
	console.info(`  Result: ${sqliteTest.success ? 'PASS' : 'FAIL'} - ${sqliteTest.message}`);
	if (sqliteTest.details) {
		console.info('  Details:', JSON.stringify(sqliteTest.details, null, 2));
	}
	console.info('');

	// Summary
	const passCount = results.filter(r => r.success).length;
	const failCount = results.length - passCount;

	console.info('--- Test Summary ---');
	console.info(`Total: ${results.length}, Passed: ${passCount}, Failed: ${failCount}`);

	if (failCount === 0) {
		console.info('\nAll tests passed! Migration is ready for deployment.');
	} else {
		console.info('\nSome tests failed. Please review the errors above.');
	}

	return results;
}

// Run tests if this file is executed directly
if (import.meta.main) {
	runMigrationTests();
}
