<template>
	<div class="line-chart-panel">
		<div v-if="loading" class="loading-state">
			<span>加载中...</span>
		</div>
		<div v-else-if="error" class="error-state">
			<span>{{ error }}</span>
		</div>
		<div v-else-if="!chartData || chartData.length === 0" class="empty-state">
			<span>暂无数据</span>
		</div>
		<div v-else ref="chartRef" class="chart-container"></div>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount, computed } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import * as echarts from 'echarts';
import { validateCollection } from '../../../layouts/dataset-layout/composables/useCollectionValidation';
import type { EChartsOption, ECharts } from 'echarts';

interface Props {
	collection?: string;
	metricType?: 'count' | 'sum' | 'avg';
	metricField?: string;
	groupBy?: string;
	groupByLabelField?: string;
	limit?: number;
	colorScheme?: string;
	title?: string;
	showLegend?: boolean;
	showDataLabels?: boolean;
	smooth?: boolean;
	showArea?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	metricType: 'count',
	limit: 20,
	colorScheme: 'default',
	showLegend: true,
	showDataLabels: false,
	smooth: true,
	showArea: false,
});

const api = useApi();
const chartRef = ref<HTMLDivElement>();
const chartInstance = ref<ECharts>();
const loading = ref(true);
const error = ref<string>('');
const chartData = ref<any[]>([]);

const chartTitle = computed(() => {
	if (props.title) return props.title;

	const metricNames = {
		count: '计数',
		sum: '求和',
		avg: '平均值',
	};

	let title = `${metricNames[props.metricType]}`;
	if (props.metricField) {
		title += ` ${props.metricField}`;
	}
	if (props.groupBy) {
		title += ` 按 ${props.groupBy}`;
	}
	title += ' 折线图';

	return title;
});

const colorSchemes: Record<string, string[]> = {
	default: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'],
	bright: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f7d794', '#778beb', '#e77f67', '#cf6a87', '#786fa6'],
	pastel: ['#ffd93d', '#6bcf7f', '#4d96ff', '#ff6b9d', '#c9b1ff', '#ffb347', '#77dd77', '#b39eb5'],
	dark: ['#2c3e50', '#34495e', '#7f8c8d', '#95a5a6', '#bdc3c7', '#1abc9c', '#16a085', '#27ae60'],
};

const getColors = (): string[] => {
	return colorSchemes[props.colorScheme] || colorSchemes.default;
};

const fetchChartData = async () => {
	if (!props.collection || !props.groupBy) {
		error.value = '请选择数据集和分组字段';
		loading.value = false;
		return;
	}

	const collectionValidation = validateCollection(props.collection);
	if (!collectionValidation.isValid) {
		error.value = collectionValidation.error;
		loading.value = false;
		chartData.value = [];
		return;
	}

	loading.value = true;
	error.value = '';

	try {
		const query: any = {
			aggregate: {
				groupBy: props.groupBy,
			},
			limit: props.limit,
		};

		if (props.groupByLabelField) {
			query.fields = [props.groupBy, props.groupByLabelField];
		} else {
			query.fields = [props.groupBy];
		}

		switch (props.metricType) {
			case 'count':
				query.aggregate.count = '*';
				break;
			case 'sum':
				if (!props.metricField) {
					throw new Error('求和指标需要选择指标字段');
				}
				query.aggregate.sum = [props.metricField];
				break;
			case 'avg':
				if (!props.metricField) {
					throw new Error('平均值指标需要选择指标字段');
				}
				query.aggregate.avg = [props.metricField];
				break;
		}

		const response = await api.get(`/items/${collectionValidation.sanitized}`, { params: query });
		chartData.value = response.data.data || [];
	} catch (err: any) {
		error.value = err.message || '数据加载失败';
		console.error('Error fetching chart data:', err);
	} finally {
		loading.value = false;
	}
};

const renderChart = () => {
	if (!chartRef.value || !chartInstance.value) return;

	const categories = chartData.value.map((item) =>
		props.groupByLabelField && item[props.groupByLabelField]
			? item[props.groupByLabelField]
			: item[props.groupBy]
	);

	const valueKey = Object.keys(chartData.value[0] || {}).find((k) =>
		k.startsWith('count') || k.startsWith('sum') || k.startsWith('avg')
	) || 'count';

	const values = chartData.value.map((item) => item[valueKey]);

	const option: EChartsOption = {
		title: {
			text: chartTitle.value,
			left: 'center',
			textStyle: {
				fontSize: 16,
				fontWeight: 600,
			},
		},
		tooltip: {
			trigger: 'axis',
			axisPointer: {
				type: 'cross',
			},
		},
		legend: props.showLegend ? {
			top: 'bottom',
		} : undefined,
		color: getColors(),
		xAxis: {
			type: 'category',
			data: categories,
			axisLabel: {
				interval: 0,
				rotate: categories.some((c) => String(c).length > 5) ? 45 : 0,
			},
			boundaryGap: false,
		},
		yAxis: {
			type: 'value',
		},
		grid: {
			left: '3%',
			right: '4%',
			bottom: '3%',
			containLabel: true,
		},
		series: [
			{
				type: 'line',
				data: values,
				smooth: props.smooth,
				label: {
					show: props.showDataLabels,
					position: 'top',
				},
				areaStyle: props.showArea ? {
					opacity: 0.3,
				} : undefined,
			},
		],
	};

	chartInstance.value.setOption(option, true);
};

const initChart = () => {
	if (!chartRef.value) return;

	if (chartInstance.value) {
		chartInstance.value.dispose();
	}

	chartInstance.value = echarts.init(chartRef.value);
	renderChart();

	window.addEventListener('resize', handleResize);
};

const handleResize = () => {
	if (chartInstance.value) {
		chartInstance.value.resize();
	}
};

const exportChart = () => {
	if (!chartInstance.value) return;
	const url = chartInstance.value.getDataURL({
		type: 'png',
		pixelRatio: 2,
		backgroundColor: '#fff',
	});
	const link = document.createElement('a');
	link.download = `line-chart-${Date.now()}.png`;
	link.href = url;
	link.click();
};

onMounted(async () => {
	await fetchChartData();
	initChart();
});

onBeforeUnmount(() => {
	if (chartInstance.value) {
		chartInstance.value.dispose();
		chartInstance.value = undefined;
	}
	window.removeEventListener('resize', handleResize);
});

watch(
	[
		() => props.collection,
		() => props.metricType,
		() => props.metricField,
		() => props.groupBy,
		() => props.limit,
	],
	async () => {
		await fetchChartData();
		renderChart();
	},
	{ deep: true }
);

watch(
	[
		() => props.colorScheme,
		() => props.showLegend,
		() => props.showDataLabels,
		() => props.title,
		() => props.smooth,
		() => props.showArea,
	],
	() => {
		renderChart();
	},
	{ deep: true }
);

defineExpose({
	exportChart,
});
</script>

<style scoped>
.line-chart-panel {
	width: 100%;
	height: 100%;
	min-height: 300px;
}

.chart-container {
	width: 100%;
	height: 100%;
	min-height: 300px;
}

.loading-state,
.error-state,
.empty-state {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 100%;
	min-height: 300px;
	color: var(--foreground-subdued);
	font-size: 14px;
}

.error-state {
	color: var(--danger);
}
</style>
