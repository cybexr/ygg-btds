// 面板配置验证脚本
const fs = require('fs');
const path = require('path');

console.log('开始验证基础图表面板配置...\n');

const indexPath = path.join(__dirname, 'index.ts');
const panelPath = path.join(__dirname, 'panel.vue');

// 检查文件是否存在
console.log('1. 检查文件存在性...');
if (!fs.existsSync(indexPath)) {
	console.error('❌ index.ts 文件不存在');
	process.exit(1);
}
console.log('✅ index.ts 文件存在');

if (!fs.existsSync(panelPath)) {
	console.error('❌ panel.vue 文件不存在');
	process.exit(1);
}
console.log('✅ panel.vue 文件存在');

// 检查文件内容
console.log('\n2. 检查 index.ts 内容...');
const indexContent = fs.readFileSync(indexPath, 'utf8');

const requiredFields = [
	'basic-charts-pack',
	'collection',
	'chartType',
	'metricType',
	'metricField',
	'groupBy',
	'colorScheme',
	'title',
	'showLegend',
	'showDataLabels'
];

let allFieldsPresent = true;
requiredFields.forEach(field => {
	if (!indexContent.includes(field)) {
		console.error(`❌ 缺少必需字段: ${field}`);
		allFieldsPresent = false;
	}
});

if (allFieldsPresent) {
	console.log('✅ 所有必需字段都存在');
}

// 检查图表类型
console.log('\n3. 检查图表类型选项...');
const chartTypes = ['bar', 'line', 'pie'];
const allChartTypesPresent = chartTypes.every(type =>
	indexContent.includes(`'${type}'`) || indexContent.includes(`"${type}"`)
);

if (allChartTypesPresent) {
	console.log('✅ 图表类型选项完整 (柱状图、折线图、饼图)');
} else {
	console.error('❌ 图表类型选项不完整');
}

// 检查指标类型
console.log('\n4. 检查指标类型选项...');
const metricTypes = ['count', 'sum', 'avg'];
const allMetricTypesPresent = metricTypes.every(type =>
	indexContent.includes(`'${type}'`) || indexContent.includes(`"${type}"`)
);

if (allMetricTypesPresent) {
	console.log('✅ 指标类型选项完整 (计数、求和、平均值)');
} else {
	console.error('❌ 指标类型选项不完整');
}

// 检查颜色主题
console.log('\n5. 检查颜色主题选项...');
const colorSchemes = ['default', 'bright', 'pastel', 'dark'];
const allColorSchemesPresent = colorSchemes.every(scheme =>
	indexContent.includes(`'${scheme}'`) || indexContent.includes(`"${scheme}"`)
);

if (allColorSchemesPresent) {
	console.log('✅ 颜色主题选项完整 (默认、明亮、柔和、深色)');
} else {
	console.error('❌ 颜色主题选项不完整');
}

// 检查 panel.vue 内容
console.log('\n6. 检查 panel.vue 内容...');
const panelContent = fs.readFileSync(panelPath, 'utf8');

const requiredVueContent = [
	'echarts',
	'fetchChartData',
	'renderChart',
	'useApi',
	'chartType',
	'metricType'
];

let allVueContentPresent = true;
requiredVueContent.forEach(content => {
	if (!panelContent.includes(content)) {
		console.error(`❌ panel.vue 缺少必需内容: ${content}`);
		allVueContentPresent = false;
	}
});

if (allVueContentPresent) {
	console.log('✅ panel.vue 包含所有必需功能');
}

// 检查 bundle 注册
console.log('\n7. 检查 bundle 主入口文件注册...');
const bundleIndexPath = path.join(__dirname, '../../index.ts');
if (fs.existsSync(bundleIndexPath)) {
	const bundleContent = fs.readFileSync(bundleIndexPath, 'utf8');
	if (bundleContent.includes('basic-charts-pack') &&
		bundleContent.includes('panel')) {
		console.log('✅ 面板已在 bundle 中注册');
	} else {
		console.error('❌ 面板未在 bundle 中注册');
	}
} else {
	console.error('❌ bundle 主入口文件不存在');
}

console.log('\n========================================');
console.log('验证完成！');
console.log('========================================');
