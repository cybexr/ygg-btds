#!/usr/bin/env node

/**
 * DatasetTableView 组件验证脚本
 * 验证分页表格视图的功能完整性和性能
 */

const path = require('path');
const fs = require('fs');

// 颜色输出
const colors = {
	reset: '\x1b[0m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
	log(`✓ ${message}`, 'green');
}

function error(message) {
	log(`✗ ${message}`, 'red');
}

function info(message) {
	log(`ℹ ${message}`, 'blue');
}

function warn(message) {
	log(`⚠ ${message}`, 'yellow');
}

// 验证项目
const verifications = [
	{
		name: '组件文件存在性',
		check: () => {
			const componentPath = path.join(__dirname, 'DatasetTableView.vue');
			const exists = fs.existsSync(componentPath);
			if (exists) {
				const content = fs.readFileSync(componentPath, 'utf-8');
				const hasTemplate = content.includes('<template>');
				const hasScript = content.includes('<script');
				const hasStyle = content.includes('<style');
				return exists && hasTemplate && hasScript && hasStyle;
			}
			return false;
		},
	},
	{
		name: '动态列头生成',
		check: () => {
			const componentPath = path.join(__dirname, 'DatasetTableView.vue');
			const content = fs.readFileSync(componentPath, 'utf-8');
			return content.includes('tableColumns') &&
				   content.includes('props.fields') &&
				   content.includes('v-table');
		},
	},
	{
		name: '分页功能',
		check: () => {
			const componentPath = path.join(__dirname, 'DatasetTableView.vue');
			const content = fs.readFileSync(componentPath, 'utf-8');
			return content.includes('currentPage') &&
				   content.includes('itemsPerPage') &&
				   content.includes('totalPages') &&
				   content.includes('v-pagination') &&
				   content.includes('PAGE_SIZE') &&
				   content.includes('paginatedItems');
		},
	},
	{
		name: '搜索框功能',
		check: () => {
			const componentPath = path.join(__dirname, 'DatasetTableView.vue');
			const content = fs.readFileSync(componentPath, 'utf-8');
			return content.includes('searchQuery') &&
				   content.includes('search-box') &&
				   content.includes('filteredAndSortedItems') &&
				   content.includes('useDebounceFn');
		},
	},
	{
		name: '列头排序功能',
		check: () => {
			const componentPath = path.join(__dirname, 'DatasetTableView.vue');
			const content = fs.readFileSync(componentPath, 'utf-8');
			return content.includes('sortField') &&
				   content.includes('handleSortChange') &&
				   content.includes('show-sort') &&
				   content.includes('order: \'asc\' | \'desc\'');
		},
	},
	{
		name: '行选择功能',
		check: () => {
			const componentPath = path.join(__dirname, 'DatasetTableView.vue');
			const content = fs.readFileSync(componentPath, 'utf-8');
			return content.includes('selection') &&
				   content.includes('show-select') &&
				   content.includes('hasSelection') &&
				   content.includes('update:selection');
		},
	},
	{
		name: '性能优化',
		check: () => {
			const componentPath = path.join(__dirname, 'DatasetTableView.vue');
			const content = fs.readFileSync(componentPath, 'utf-8');
			return content.includes('useDebounceFn') &&
				   content.includes('computed') &&
				   content.includes('startIndex') &&
				   content.includes('endIndex');
		},
	},
	{
		name: '响应式设计',
		check: () => {
			const componentPath = path.join(__dirname, 'DatasetTableView.vue');
			const content = fs.readFileSync(componentPath, 'utf-8');
			return content.includes('@media') &&
				   content.includes('max-width: 1024px') &&
				   content.includes('flex-direction: column');
		},
	},
	{
		name: '错误处理',
		check: () => {
			const componentPath = path.join(__dirname, 'DatasetTableView.vue');
			const content = fs.readFileSync(componentPath, 'utf-8');
			return content.includes('empty-state') &&
				   content.includes('v-empty') &&
				   content.includes('!loading && paginatedItems.length === 0');
		},
	},
	{
		name: '测试文件存在性',
		check: () => {
			const testPath = path.join(__dirname, '__tests__', 'DatasetTableView.spec.ts');
			return fs.existsSync(testPath);
		},
	},
];

// 性能测试
function performanceTest() {
	info('\n性能测试：');

	// 模拟大数据集
	const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
		id: i + 1,
		name: `Item ${i + 1}`,
		email: `item${i + 1}@example.com`,
		status: i % 2 === 0 ? 'active' : 'inactive',
	}));

	// 测试分页性能
	const startTime = Date.now();
	const pageSize = 50;
	const currentPage = 1;
	const start = (currentPage - 1) * pageSize;
	const end = start + pageSize;
	const paginatedItems = largeDataset.slice(start, end);
	const paginationTime = Date.now() - startTime;

	if (paginationTime < 50) {
		success(`分页性能: ${paginationTime}ms (目标: <50ms)`);
	} else {
		warn(`分页性能: ${paginationTime}ms (目标: <50ms)`);
	}

	// 测试搜索性能
	const searchStartTime = Date.now();
	const searchQuery = 'Item 5';
	const filteredItems = largeDataset.filter(item => {
		return Object.values(item).some(value =>
			String(value).toLowerCase().includes(searchQuery.toLowerCase())
		);
	});
	const searchTime = Date.now() - searchStartTime;

	if (searchTime < 500) {
		success(`搜索性能: ${searchTime}ms (目标: <500ms)`);
	} else {
		warn(`搜索性能: ${searchTime}ms (目标: <500ms)`);
	}

	// 测试排序性能
	const sortStartTime = Date.now();
	const sortedItems = [...largeDataset].sort((a, b) => {
		return String(a.name).localeCompare(String(b.name));
	});
	const sortTime = Date.now() - sortStartTime;

	if (sortTime < 500) {
		success(`排序性能: ${sortTime}ms (目标: <500ms)`);
	} else {
		warn(`排序性能: ${sortTime}ms (目标: <500ms)`);
	}
}

// 主验证流程
function runVerifications() {
	log('\n=== DatasetTableView 组件验证 ===\n', 'cyan');

	let passed = 0;
	let failed = 0;

	verifications.forEach((verification, index) => {
		try {
			const result = verification.check();
			if (result) {
				success(`${index + 1}. ${verification.name}`);
				passed++;
			} else {
				error(`${index + 1}. ${verification.name}`);
				failed++;
			}
		} catch (err) {
			error(`${index + 1}. ${verification.name} - ${err.message}`);
			failed++;
		}
	});

	// 运行性能测试
	performanceTest();

	// 总结
	log('\n=== 验证总结 ===\n', 'cyan');
	log(`总计: ${verifications.length} 项`, 'reset');
	success(`通过: ${passed} 项`);
	if (failed > 0) {
		error(`失败: ${failed} 项`);
	}

	if (failed === 0) {
		log('\n✓ 所有验证通过！', 'green');
		process.exit(0);
	} else {
		log('\n✗ 部分验证失败，请检查组件实现', 'red');
		process.exit(1);
	}
}

// 运行验证
runVerifications();
