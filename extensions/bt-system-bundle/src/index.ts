import { defineExtension } from '@directus/extensions-sdk';

export default defineExtension({
	id: 'bt-system-bundle',
	name: 'BT System Bundle',
	icon: 'box',
	version: '1.0.0',
	minVersion: '11.0.0',
	type: 'bundle',

	entries: [
		{
			type: 'endpoint',
			name: 'excel-importer',
			source: './src/endpoints/excel-importer/index.ts',
		},
		{
			type: 'endpoint',
			name: 'permission-sync',
			source: './src/endpoints/permission-sync/index.ts',
		},
		{
			type: 'hook',
			name: 'import-validator',
			source: './src/hooks/import-validator/index.ts',
		},
		{
			type: 'module',
			name: 'raw-database-manager',
			source: './src/modules/raw-database-manager/index.ts',
		},
		{
			type: 'module',
			name: 'user-manager',
			source: './src/modules/user-manager/index.ts',
		},
		{
			type: 'layout',
			name: 'dataset-layout',
			source: './src/layouts/dataset-layout/index.ts',
		},
		{
			type: 'panel',
			name: 'basic-charts-pack',
			source: './src/panels/basic-charts-pack/index.ts',
		},
	],
});
