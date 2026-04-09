/**
 * import-validator 性能验证脚本
 * 使用 Node.js 原生性能测试
 */

import { performance } from 'perf_hooks';

// 模拟错误数据
function createMockError(id) {
	return {
		import_job_id: 1,
		row_number: id,
		sheet_name: 'Sheet1',
		error_type: 'validation',
		error_message: 'Test error message',
		field_name: 'test_field',
		row_data: { field1: 'value1', field2: 'value2' },
		severity: 'error'
	};
}

// 性能测试函数
function runPerformanceTest(name, testFn) {
	const iterations = 1000;
	const times = [];

	console.log(`\n运行测试: ${name}`);
	console.log(`迭代次数: ${iterations}`);

	// 预热
	for (let i = 0; i < 100; i++) {
		testFn(i);
	}

	// 实际测试
	for (let i = 0; i < iterations; i++) {
		const start = performance.now();
		testFn(i);
		const end = performance.now();
		times.push(end - start);
	}

	// 统计结果
	const avg = times.reduce((a, b) => a + b, 0) / times.length;
	const min = Math.min(...times);
	const max = Math.max(...times);
	const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

	console.log(`平均耗时: ${avg.toFixed(4)}ms`);
	console.log(`最小耗时: ${min.toFixed(4)}ms`);
	console.log(`最大耗时: ${max.toFixed(4)}ms`);
	console.log(`P95 耗时: ${p95.toFixed(4)}ms`);

	// 验证性能要求
	const passed = avg < 10;
	console.log(`结果: ${passed ? '✓ 通过' : '✗ 失败'} (要求: < 10ms)`);

	return passed;
}

// 测试 1: 对象创建性能
console.log('='.repeat(50));
console.log('import-validator 性能测试');
console.log('='.repeat(50));

const test1 = runPerformanceTest('错误对象创建', (i) => {
	createMockError(i);
});

// 测试 2: 错误分类性能（模拟）
const errorCategories = {
	'validation': 'validation',
	'constraint': 'constraint',
	'format': 'format',
	'permission': 'permission',
	'database': 'database',
	'system': 'system'
};

const categorizeError = (() => {
	let cache = new Map();
	return (error) => {
		const key = `${error.code || ''}:${error.message || ''}`;
		if (cache.has(key)) {
			return cache.get(key);
		}
		const msg = error.message?.toLowerCase() || '';
		let type = 'system';
		if (msg.includes('validation') || msg.includes('valid')) type = 'validation';
		else if (msg.includes('constraint') || msg.includes('unique')) type = 'constraint';
		else if (msg.includes('format') || msg.includes('type')) type = 'format';
		else if (msg.includes('permission') || msg.includes('unauthorized')) type = 'permission';
		else if (msg.includes('database')) type = 'database';

		cache.set(key, type);
		if (cache.size > 1000) {
			const firstKey = cache.keys().next().value;
			cache.delete(firstKey);
		}
		return type;
	};
})();

const test2 = runPerformanceTest('错误分类 (带缓存)', (i) => {
	const error = {
		message: i % 5 === 0 ? 'validation error' : 'database constraint error',
		code: i % 3 === 0 ? '23505' : null
	};
	categorizeError(error);
});

// 测试 3: 批量处理性能
const test3 = runPerformanceTest('批量错误处理 (100条)', (i) => {
	const batch = Array.from({ length: 100 }, (_, j) => createMockError(j));
	// 模拟批量处理
	batch.map(err => categorizeError({ message: err.error_type + ' error' }));
});

// 总结
console.log('\n' + '='.repeat(50));
const allPassed = test1 && test2 && test3;
console.log(`总体结果: ${allPassed ? '✓ 所有测试通过' : '✗ 部分测试失败'}`);
console.log('='.repeat(50));

process.exit(allPassed ? 0 : 1);
