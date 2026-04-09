#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const layoutDir = __dirname;
const errors = [];
const warnings = [];

console.log('🔍 Verifying Dataset Layout Structure...\n');

// Check file structure
const requiredFiles = [
	{ path: 'index.ts', description: 'Layout registration entry point' },
	{ path: 'layout.vue', description: 'Main layout component' },
	{ path: 'shims.d.ts', description: 'TypeScript type definitions' },
];

requiredFiles.forEach(file => {
	const filePath = path.join(layoutDir, file.path);
	if (!fs.existsSync(filePath)) {
		errors.push(`Missing required file: ${file.path} (${file.description})`);
	} else {
		console.log(`✅ Found ${file.path}`);
	}
});

// Check index.ts content
const indexPath = path.join(layoutDir, 'index.ts');
if (fs.existsSync(indexPath)) {
	const indexContent = fs.readFileSync(indexPath, 'utf8');

	if (indexContent.includes('defineLayout')) {
		console.log('✅ index.ts uses defineLayout from SDK');
	} else {
		errors.push('index.ts should use defineLayout from @directus/extensions-sdk');
	}

	if (indexContent.includes("id: 'dataset-layout'")) {
		console.log('✅ Layout ID is correctly set');
	} else {
		warnings.push('Layout ID might not be set correctly');
	}

	if (indexContent.includes('import LayoutComponent')) {
		console.log('✅ Layout component is imported');
	} else {
		errors.push('Layout component should be imported in index.ts');
	}
}

// Check layout.vue content
const layoutPath = path.join(layoutDir, 'layout.vue');
if (fs.existsSync(layoutPath)) {
	const layoutContent = fs.readFileSync(layoutPath, 'utf8');

	if (layoutContent.includes('template')) {
		console.log('✅ layout.vue has template section');
	} else {
		errors.push('layout.vue should have a template section');
	}

	if (layoutContent.includes('script')) {
		console.log('✅ layout.vue has script section');
	} else {
		errors.push('layout.vue should have a script section');
	}

	if (layoutContent.includes('defineProps')) {
		console.log('✅ layout.vue uses defineProps');
	} else {
		warnings.push('layout.vue should use defineProps for type safety');
	}

	// Check for key features
	const features = [
		{ name: 'Table view', pattern: /table.*view/i },
		{ name: 'Card view', pattern: /card.*view/i },
		{ name: 'Search functionality', pattern: /search/i },
		{ name: 'Filter functionality', pattern: /filter/i },
		{ name: 'Selection', pattern: /selection/i },
	];

	features.forEach(feature => {
		if (feature.pattern.test(layoutContent)) {
			console.log(`✅ ${feature.name} is implemented`);
		} else {
			warnings.push(`${feature.name} might not be fully implemented`);
		}
	});
}

// Check shims.d.ts content
const shimsPath = path.join(layoutDir, 'shims.d.ts');
if (fs.existsSync(shimsPath)) {
	const shimsContent = fs.readFileSync(shimsPath, 'utf8');
	if (shimsContent.includes('*.vue')) {
		console.log('✅ shims.d.ts has Vue type declarations');
	} else {
		warnings.push('shims.d.ts should include Vue type declarations');
	}
}

// Summary
console.log('\n📊 Summary:');
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);

if (errors.length > 0) {
	console.log('\n❌ Errors:');
	errors.forEach(error => console.log(`  - ${error}`));
	process.exit(1);
}

if (warnings.length > 0) {
	console.log('\n⚠️  Warnings:');
	warnings.forEach(warning => console.log(`  - ${warning}`));
}

console.log('\n✅ Dataset Layout structure is valid!');
process.exit(0);
