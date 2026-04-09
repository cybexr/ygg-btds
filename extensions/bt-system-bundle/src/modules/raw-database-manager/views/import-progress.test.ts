import test from 'node:test';
import assert from 'node:assert/strict';

import {
	formatPercentage,
	formatRemainingTime,
	getEstimatedTimeRemaining,
	getProgressPercentage,
	getProgressText,
	getProgressValue,
	isProgressIndeterminate,
	normalizeProgressMetrics,
	shouldEstimateTime,
} from './import-progress.ts';

test('normalizeProgressMetrics 应钳制超过总数的已处理数量', () => {
	assert.deepEqual(normalizeProgressMetrics(100, 120), {
		processed: 100,
		total: 100,
		hasMetrics: true,
	});
});

test('getProgressPercentage 应在缺少后端 progress 时基于 processed/total 计算', () => {
	assert.equal(
		getProgressPercentage({
			status: 'processing',
			total: 200,
			processed: 50,
		}),
		'25%',
	);
	assert.equal(getProgressValue({ status: 'processing', total: 200, processed: 50 }), 25);
});

test('getProgressPercentage 应处理空值和整数格式', () => {
	assert.equal(getProgressPercentage(null), '0%');
	assert.equal(formatPercentage(33.3), '33.3%');
	assert.equal(formatPercentage(50), '50%');
});

test('getProgressText 应显示处理文案', () => {
	assert.equal(getProgressText({ status: 'processing', total: 100, processed: 30 }), '已处理 30 / 100 条记录');
	assert.equal(getProgressText({ status: 'processing', total: 0, processed: 0 }), '正在等待导入统计信息...');
});

test('isProgressIndeterminate 应仅在缺少统计信息时返回 true', () => {
	assert.equal(isProgressIndeterminate({ status: 'processing', total: 0, processed: 0 }), true);
	assert.equal(isProgressIndeterminate({ status: 'processing', total: 10, processed: 2 }), false);
});

test('shouldEstimateTime 和 getEstimatedTimeRemaining 应按阈值控制剩余时间展示', () => {
	const earlySnapshot = {
		status: 'processing' as const,
		total: 100,
		processed: 8,
	};
	assert.equal(shouldEstimateTime(earlySnapshot, 0, 4000), false);
	assert.equal(getEstimatedTimeRemaining(earlySnapshot, 0, 4000), '计算中...');

	const steadySnapshot = {
		status: 'processing' as const,
		total: 100,
		processed: 50,
	};
	assert.equal(shouldEstimateTime(steadySnapshot, 1000, 11000), true);
	assert.equal(getEstimatedTimeRemaining(steadySnapshot, 1000, 11000), '10秒');
});

test('formatRemainingTime 应输出友好的中文格式', () => {
	assert.equal(formatRemainingTime(0), '0秒');
	assert.equal(formatRemainingTime(10_000), '10秒');
	assert.equal(formatRemainingTime(125_000), '2分5秒');
	assert.equal(formatRemainingTime(3_780_000), '1小时3分钟');
});
