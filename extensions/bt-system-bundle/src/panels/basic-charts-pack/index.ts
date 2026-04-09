import { definePanel } from '@directus/extensions-sdk';
import BasicChartsPanel from './panel.vue';

export default definePanel({
	id: 'basic-charts-pack',
	name: 'Basic Charts Pack',
	icon: 'chart_box',
	description: '基础图表面板 - 支持柱状图、折线图、饼图',
	component: BasicChartsPanel,
	options: [
		{
			field: 'collection',
			name: '数据集',
			type: 'string',
			meta: {
				interface: 'system-collection',
				options: {
					includeSystem: false,
				},
			},
		},
		{
			field: 'chartType',
			name: '图表类型',
			type: 'string',
			meta: {
				interface: 'select-dropdown',
				options: {
					choices: [
						{ text: '柱状图', value: 'bar' },
						{ text: '折线图', value: 'line' },
						{ text: '饼图', value: 'pie' },
					],
				},
			},
			default: 'bar',
		},
		{
			field: 'metricType',
			name: '指标类型',
			type: 'string',
			meta: {
				interface: 'select-dropdown',
				options: {
					choices: [
						{ text: '计数', value: 'count' },
						{ text: '求和', value: 'sum' },
						{ text: '平均值', value: 'avg' },
					],
				},
			},
			default: 'count',
		},
		{
			field: 'metricField',
			name: '指标字段',
			type: 'string',
			meta: {
				interface: 'select-dropdown',
				options: {
					choices: null,
				},
				conditions: [
					{
						operator: 'neq',
						field: 'metricType',
						value: 'count',
					},
				],
			},
		},
		{
			field: 'groupBy',
			name: '分组字段',
			type: 'string',
			meta: {
				interface: 'select-dropdown',
				options: {
					choices: null,
				},
			},
		},
		{
			field: 'groupByLabelField',
			name: '分组标签字段',
			type: 'string',
			meta: {
				interface: 'select-dropdown',
				options: {
					choices: null,
				},
				note: '可选：用于显示更友好的分组标签',
			},
		},
		{
			field: 'limit',
			name: '数据限制',
			type: 'integer',
			meta: {
				interface: 'input',
				options: {
					placeholder: '默认: 20',
				},
				note: '限制返回的分组数量，避免图表过于密集',
			},
			default: 20,
		},
		{
			field: 'colorScheme',
			name: '颜色主题',
			type: 'string',
			meta: {
				interface: 'select-dropdown',
				options: {
					choices: [
						{ text: '默认', value: 'default' },
						{ text: '明亮', value: 'bright' },
						{ text: '柔和', value: 'pastel' },
						{ text: '深色', value: 'dark' },
					],
				},
			},
			default: 'default',
		},
		{
			field: 'title',
			name: '图表标题',
			type: 'string',
			meta: {
				interface: 'input',
				options: {
					placeholder: '留空则自动生成',
				},
			},
		},
		{
			field: 'showLegend',
			name: '显示图例',
			type: 'boolean',
			meta: {
				interface: 'boolean',
			},
			default: true,
		},
		{
			field: 'showDataLabels',
			name: '显示数据标签',
			type: 'boolean',
			meta: {
				interface: 'boolean',
			},
			default: false,
		},
	],
});
