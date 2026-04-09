<template>
	<div class="basic-charts-panel">
		<!-- 加载状态 -->
		<div v-if="loading" class="loading-state">
			<div class="loading-spinner"></div>
			<div class="loading-text">
				<span class="loading-message">{{ loadingMessage }}</span>
				<span v-if="loadingProgress > 0 && loadingProgress < 100" class="loading-progress">
					{{ loadingProgress }}%
				</span>
			</div>
		</div>

		<!-- 错误状态 -->
		<div v-else-if="error" class="error-state">
			<div class="error-icon">⚠️</div>
			<div class="error-content">
				<h4 class="error-title">数据加载失败</h4>
				<p class="error-message">{{ error }}</p>
				<div class="error-actions">
					<button @click="retry" class="retry-button">
						<span class="retry-icon">🔄</span>
						重试
					</button>
					<button v-if="isConfigError" @click="showConfigHelp" class="help-button">
						配置帮助
					</button>
				</div>
			</div>
		</div>

		<!-- 空状态 -->
		<div v-else-if="!chartData || chartData.length === 0" class="empty-state">
			<div class="empty-icon">📊</div>
			<div class="empty-content">
				<h4 class="empty-title">暂无数据</h4>
				<p class="empty-message">
					{{ emptyStateMessage }}
				</p>
				<button v-if="!props.collection || !props.groupBy" @click="showConfigHelp" class="config-button">
					配置图表
				</button>
			</div>
		</div>

		<!-- 图表容器 -->
		<div v-else class="chart-wrapper">
			<div class="chart-header">
				<h3 class="chart-title">{{ chartTitle }}</h3>
				<div class="chart-actions">
					<button @click="refresh" class="refresh-button" :disabled="refreshing" :title="'刷新数据'">
						<span :class="{ 'rotating': refreshing }">🔄</span>
					</button>
					<button v-if="hasData" @click="downloadChart" class="download-button" :title="'下载图表'">
						⬇️
					</button>
				</div>
			</div>
			<div ref="chartRef" class="chart-container" :class="{ 'chart-rendering': isRendering }"></div>
			<div v-if="chartData.length > 0" class="chart-footer">
				<span class="data-count">共 {{ chartData.length }} 条数据</span>
				<span v-if="lastRefreshTime" class="last-refresh">更新于 {{ lastRefreshTime }}</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount, computed } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import * as echarts from 'echarts';
import { validateCollection } from '../../layouts/dataset-layout/composables/useCollectionValidation';
import type { EChartsOption, ECharts } from 'echarts';

interface Props {
	collection?: string;
	chartType?: 'bar' | 'line' | 'pie';
	metricType?: 'count' | 'sum' | 'avg';
	metricField?: string;
	groupBy?: string;
	groupByLabelField?: string;
	limit?: number;
	colorScheme?: string;
	title?: string;
	showLegend?: boolean;
	showDataLabels?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	chartType: 'bar',
	metricType: 'count',
	limit: 20,
	colorScheme: 'default',
	showLegend: true,
	showDataLabels: false,
});

const api = useApi();
const chartRef = ref<HTMLDivElement>();
const chartInstance = ref<ECharts>();
const loading = ref(true);
const refreshing = ref(false);
const isRendering = ref(false);
const error = ref<string>('');
const chartData = ref<any[]>([]);
const loadingMessage = ref('正在加载数据...');
const loadingProgress = ref(0);
const lastRefreshTime = ref('');
const retryCount = ref(0);
const maxRetries = 3;

const chartTitle = computed(() => {
	if (props.title) return props.title;

	const metricNames = {
		count: '计数',
		sum: '求和',
		avg: '平均值',
	};

	const chartTypeNames = {
		bar: '柱状图',
		line: '折线图',
		pie: '饼图',
	};

	let title = `${metricNames[props.metricType]}`;
	if (props.metricField) {
		title += ` ${props.metricField}`;
	}
	if (props.groupBy) {
		title += ` 按 ${props.groupBy}`;
	}
	title += ` ${chartTypeNames[props.chartType]}`;

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

const isConfigError = computed(() => {
	return !props.collection || !props.groupBy;
});

const hasData = computed(() => {
	return chartData.value && chartData.value.length > 0;
});

const emptyStateMessage = computed(() => {
	if (!props.collection) {
		return '请选择数据集以开始';
	}
	if (!props.groupBy) {
		return '请选择分组字段以生成图表';
	}
	return '当前数据集为空，请检查数据源或调整筛选条件';
});

const updateLastRefreshTime = () => {
	const now = new Date();
	lastRefreshTime.value = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
};

const formatTime = (seconds: number): string => {
	if (seconds < 60) {
		return `${seconds}秒`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}分${remainingSeconds}秒`;
};

const fetchChartData = async (isRetry = false): Promise<void> => {
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

	// 如果是刷新操作，使用 refreshing 状态
	if (isRetry) {
		refreshing.value = true;
	} else {
		loading.value = true;
	}
	error.value = '';
	loadingProgress.value = 0;
	loadingMessage.value = '正在验证数据集...';

	const startTime = Date.now();

	try {
		// 模拟加载进度
		const progressInterval = setInterval(() => {
			if (loadingProgress.value < 90) {
				loadingProgress.value += 10;
				if (loadingProgress.value <= 30) {
					loadingMessage.value = '正在验证数据集...';
				} else if (loadingProgress.value <= 60) {
					loadingMessage.value = '正在聚合数据...';
				} else {
					loadingMessage.value = '正在生成图表...';
				}
			}
		}, 200);

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

		loadingMessage.value = '正在获取数据...';
		const response = await api.get(`/items/${collectionValidation.sanitized}`, { params: query });
		chartData.value = response.data.data || [];

		clearInterval(progressInterval);
		loadingProgress.value = 100;

		// 计算加载时间
		const loadTime = Math.round((Date.now() - startTime) / 1000);
		if (loadTime > 1) {
			loadingMessage.value = `加载完成 (用时 ${formatTime(loadTime)})`;
		} else {
			loadingMessage.value = '加载完成';
		}

		// 重置重试计数
		if (!isRetry) {
			retryCount.value = 0;
		}

		updateLastRefreshTime();

		// 延迟清除加载状态，让用户看到完成状态
		setTimeout(() => {
			loading.value = false;
			refreshing.value = false;
			loadingProgress.value = 0;
		}, 500);
	} catch (err: any) {
		loading.value = false;
		refreshing.value = false;
		loadingProgress.value = 0;

		// 增强错误消息
		if (err.response?.status === 404) {
			error.value = `数据集 "${props.collection}" 不存在或无权访问`;
		} else if (err.response?.status === 403) {
			error.value = '没有访问此数据集的权限';
		} else if (err.response?.status === 500) {
			error.value = '服务器错误，请稍后重试';
		} else if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
			error.value = '请求超时，请检查网络连接后重试';
		} else if (err.message.includes('Network Error')) {
			error.value = '网络连接失败，请检查网络设置';
		} else {
			error.value = err.message || '数据加载失败，请重试';
		}

		console.error('Error fetching chart data:', err);
	}
};

const retry = async () => {
	if (retryCount.value >= maxRetries) {
		error.value = `重试次数已达上限 (${maxRetries}次)，请稍后再试或检查配置`;
		return;
	}

	retryCount.value++;
	loadingMessage.value = `正在重试 (${retryCount.value}/${maxRetries})...`;
	await fetchChartData(true);
};

const refresh = async () => {
	if (refreshing.value) return;
	await fetchChartData(true);
};

const showConfigHelp = () => {
	// 这里可以打开配置面板或显示帮助信息
	const helpMessage = `
图表配置说明：
1. 数据集：选择要分析的数据表
2. 分组字段：选择用于分组的字段（如：状态、类别等）
3. 图表类型：选择柱状图、折线图或饼图
4. 指标类型：选择计数、求和或平均值
5. 指标字段：对于求和/平均值，需要选择数值字段

提示：确保已配置正确的数据集和分组字段。
	`;
	alert(helpMessage);
};

const downloadChart = () => {
	if (!chartInstance.value) return;

	const url = chartInstance.value.getDataURL({
		type: 'png',
		pixelRatio: 2,
		backgroundColor: '#fff',
	});

	const link = document.createElement('a');
	link.download = `chart-${props.collection}-${Date.now()}.png`;
	link.href = url;
	link.click();
};

const renderChart = () => {
	if (!chartRef.value || !chartInstance.value) return;

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
			trigger: props.chartType === 'pie' ? 'item' : 'axis',
			axisPointer: {
				type: 'shadow',
			},
		},
		legend: props.showLegend ? {
			top: 'bottom',
		} : undefined,
		color: getColors(),
	};

	if (props.chartType === 'pie') {
		const pieData = chartData.value.map((item) => {
			const key = props.groupByLabelField && item[props.groupByLabelField]
				? item[props.groupByLabelField]
				: item[props.groupBy];

			const valueKey = Object.keys(item).find((k) =>
				k.startsWith('count') || k.startsWith('sum') || k.startsWith('avg')
			);

			return {
				name: key,
				value: item[valueKey || 'count'],
			};
		});

		option.series = [
			{
				type: 'pie',
				radius: '70%',
				data: pieData,
				emphasis: {
					itemStyle: {
						shadowBlur: 10,
						shadowOffsetX: 0,
						shadowColor: 'rgba(0, 0, 0, 0.5)',
					},
				},
				label: {
					show: props.showDataLabels,
					formatter: '{b}: {c} ({d}%)',
				},
			},
		];
	} else {
		const categories = chartData.value.map((item) =>
			props.groupByLabelField && item[props.groupByLabelField]
				? item[props.groupByLabelField]
				: item[props.groupBy]
		);

		const valueKey = Object.keys(chartData.value[0] || {}).find((k) =>
			k.startsWith('count') || k.startsWith('sum') || k.startsWith('avg')
		) || 'count';

		const values = chartData.value.map((item) => item[valueKey]);

		option.xAxis = {
			type: 'category',
			data: categories,
			axisLabel: {
				interval: 0,
				rotate: categories.some((c) => String(c).length > 5) ? 45 : 0,
			},
		};

		option.yAxis = {
			type: 'value',
		};

		option.grid = {
			left: '3%',
			right: '4%',
			bottom: '3%',
			containLabel: true,
		};

		option.series = [
			{
				type: props.chartType,
				data: values,
				itemStyle: {
					borderRadius: props.chartType === 'bar' ? [4, 4, 0, 0] : undefined,
				},
				label: {
					show: props.showDataLabels,
					position: 'top',
				},
				areaStyle: props.chartType === 'line' ? {} : undefined,
				smooth: props.chartType === 'line',
			} as any,
		];
	}

	chartInstance.value.setOption(option, true);
};

const initChart = () => {
	if (!chartRef.value) return;

	if (chartInstance.value) {
		chartInstance.value.dispose();
	}

	chartInstance.value = echarts.init(chartRef.value);
	isRendering.value = true;

	// 使用动画配置
	const animationDuration = 800;
	const animationEasing = 'cubicOut';

	// 先渲染基础图表
	renderChart();

	// 设置动画完成后标志
	setTimeout(() => {
		isRendering.value = false;
	}, animationDuration);

	window.addEventListener('resize', handleResize);
};

const handleResize = () => {
	if (chartInstance.value) {
		chartInstance.value.resize();
	}
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
		() => props.chartType,
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
	[() => props.colorScheme, () => props.showLegend, () => props.showDataLabels, () => props.title],
	() => {
		renderChart();
	},
	{ deep: true }
);
</script>

<style scoped>
.basic-charts-panel {
	width: 100%;
	height: 100%;
	min-height: 300px;
	position: relative;
}

.chart-wrapper {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 300px;
}

.chart-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 12px 16px;
	border-bottom: 1px solid var(--border-normal);
	background: var(--background-subdued);
}

.chart-title {
	margin: 0;
	font-size: 14px;
	font-weight: 600;
	color: var(--foreground-normal);
}

.chart-actions {
	display: flex;
	gap: 8px;
}

.refresh-button,
.download-button {
	background: transparent;
	border: 1px solid var(--border-normal);
	border-radius: 4px;
	padding: 4px 8px;
	cursor: pointer;
	transition: all 0.2s ease;
	display: flex;
	align-items: center;
	justify-content: center;
	min-width: 32px;
}

.refresh-button:hover:not(:disabled),
.download-button:hover {
	background: var(--background-hover);
	border-color: var(--foreground-subdued);
}

.refresh-button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.refresh-button .rotating {
	animation: rotate 1s linear infinite;
}

@keyframes rotate {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}

.chart-container {
	flex: 1;
	width: 100%;
	min-height: 250px;
	position: relative;
	transition: opacity 0.3s ease;
}

.chart-container.chart-rendering {
	opacity: 0.7;
}

.chart-footer {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 8px 16px;
	font-size: 12px;
	color: var(--foreground-subdued);
	background: var(--background-subdued);
	border-top: 1px solid var(--border-normal);
}

.data-count,
.last-refresh {
	display: flex;
	align-items: center;
	gap: 4px;
}

/* 加载状态 */
.loading-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	height: 100%;
	min-height: 300px;
	gap: 16px;
}

.loading-spinner {
	width: 40px;
	height: 40px;
	border: 3px solid var(--background-subdued);
	border-top-color: var(--primary);
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.loading-text {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
}

.loading-message {
	color: var(--foreground-normal);
	font-size: 14px;
}

.loading-progress {
	color: var(--foreground-subdued);
	font-size: 12px;
}

/* 错误状态 */
.error-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	height: 100%;
	min-height: 300px;
	padding: 24px;
	gap: 16px;
	text-align: center;
}

.error-icon {
	font-size: 48px;
}

.error-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-width: 400px;
}

.error-title {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	color: var(--danger);
}

.error-message {
	margin: 0;
	font-size: 14px;
	color: var(--foreground-subdued);
	line-height: 1.5;
}

.error-actions {
	display: flex;
	gap: 8px;
	justify-content: center;
	margin-top: 8px;
}

.retry-button,
.help-button,
.config-button {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 8px 16px;
	border: none;
	border-radius: 4px;
	font-size: 14px;
	cursor: pointer;
	transition: all 0.2s ease;
}

.retry-button {
	background: var(--primary);
	color: var(--primary-text);
}

.retry-button:hover {
	background: var(--primary-125);
}

.retry-icon {
	font-size: 16px;
}

.help-button,
.config-button {
	background: var(--background-subdued);
	color: var(--foreground-normal);
	border: 1px solid var(--border-normal);
}

.help-button:hover,
.config-button:hover {
	background: var(--background-hover);
	border-color: var(--foreground-subdued);
}

/* 空状态 */
.empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	height: 100%;
	min-height: 300px;
	padding: 24px;
	gap: 16px;
	text-align: center;
}

.empty-icon {
	font-size: 64px;
	opacity: 0.5;
}

.empty-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-width: 400px;
}

.empty-title {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	color: var(--foreground-normal);
}

.empty-message {
	margin: 0;
	font-size: 14px;
	color: var(--foreground-subdued);
	line-height: 1.5;
}

/* 响应式调整 */
@media (max-width: 768px) {
	.chart-header {
		padding: 8px 12px;
	}

	.chart-title {
		font-size: 12px;
	}

	.chart-footer {
		padding: 6px 12px;
		font-size: 11px;
	}

	.error-state,
	.empty-state {
		padding: 16px;
	}

	.error-content,
	.empty-content {
		max-width: 100%;
	}
}
</style>
