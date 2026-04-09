import { describe, it, expect } from 'vitest';

describe('Basic Charts Panel Configuration', () => {
	it('should have correct panel id', () => {
		const panelId = 'basic-charts-pack';
		expect(panelId).toBe('basic-charts-pack');
		expect(panelId).toBeTruthy();
	});

	it('should have correct panel name', () => {
		const panelName = 'Basic Charts Pack';
		expect(panelName).toBe('Basic Charts Pack');
		expect(panelName).toBeTruthy();
	});

	it('should have all required option fields', () => {
		const requiredOptions = [
			'collection',
			'chartType',
			'metricType',
			'metricField',
			'groupBy',
			'groupByLabelField',
			'limit',
			'colorScheme',
			'title',
			'showLegend',
			'showDataLabels',
		];

		expect(requiredOptions).toHaveLength(11);
		requiredOptions.forEach(option => {
			expect(option).toBeTruthy();
			expect(typeof option).toBe('string');
		});
	});

	it('should have correct chart type choices', () => {
		const chartTypeChoices = [
			{ text: '柱状图', value: 'bar' },
			{ text: '折线图', value: 'line' },
			{ text: '饼图', value: 'pie' },
		];

		expect(chartTypeChoices).toHaveLength(3);
		expect(chartTypeChoices[0].value).toBe('bar');
		expect(chartTypeChoices[1].value).toBe('line');
		expect(chartTypeChoices[2].value).toBe('pie');
	});

	it('should have correct metric type choices', () => {
		const metricTypeChoices = [
			{ text: '计数', value: 'count' },
			{ text: '求和', value: 'sum' },
			{ text: '平均值', value: 'avg' },
		];

		expect(metricTypeChoices).toHaveLength(3);
		expect(metricTypeChoices[0].value).toBe('count');
		expect(metricTypeChoices[1].value).toBe('sum');
		expect(metricTypeChoices[2].value).toBe('avg');
	});

	it('should have correct color scheme choices', () => {
		const colorSchemeChoices = [
			{ text: '默认', value: 'default' },
			{ text: '明亮', value: 'bright' },
			{ text: '柔和', value: 'pastel' },
			{ text: '深色', value: 'dark' },
		];

		expect(colorSchemeChoices).toHaveLength(4);
		expect(colorSchemeChoices[0].value).toBe('default');
		expect(colorSchemeChoices[1].value).toBe('bright');
		expect(colorSchemeChoices[2].value).toBe('pastel');
		expect(colorSchemeChoices[3].value).toBe('dark');
	});
});
