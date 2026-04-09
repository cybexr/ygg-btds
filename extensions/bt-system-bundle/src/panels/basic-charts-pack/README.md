# Basic Charts Pack - Directus 面板扩展

## 概述

基础图表面板扩展为 Directus Insights 提供了强大的数据可视化功能，支持柱状图、折线图和饼图三种图表类型。

## 功能特性

- **多种图表类型**：柱状图、折线图、饼图
- **灵活的指标计算**：计数、求和、平均值
- **数据分组**：支持按任意字段分组
- **颜色主题**：四种预设颜色主题
- **响应式设计**：自适应容器大小
- **交互式提示**：鼠标悬停显示详细数据

## 配置选项

### 1. 数据集 (collection)
选择要可视化的数据集集合。

### 2. 图表类型 (chartType)
- `bar` - 柱状图：适合分类数据比较
- `line` - 折线图：适合趋势分析
- `pie` - 饼图：适合占比展示

### 3. 指标类型 (metricType)
- `count` - 计数：记录数量统计
- `sum` - 求和：数值字段求和
- `avg` - 平均值：数值字段平均

### 4. 指标字段 (metricField)
当指标类型为"求和"或"平均值"时，需要选择要计算的数值字段。

### 5. 分组字段 (groupBy)
选择用于数据分组的字段。

### 6. 分组标签字段 (groupByLabelField)
可选：用于显示更友好的分组标签。

### 7. 数据限制 (limit)
限制返回的分组数量，默认为 20，避免图表过于密集。

### 8. 颜色主题 (colorScheme)
- `default` - 默认主题
- `bright` - 明亮主题
- `pastel` - 柔和主题
- `dark` - 深色主题

### 9. 图表标题 (title)
自定义图表标题，留空则自动生成。

### 10. 显示图例 (showLegend)
是否显示图表图例。

### 11. 显示数据标签 (showDataLabels)
是否在图表上显示数据值。

## 使用示例

### 示例 1：按状态统计订单数量
```json
{
  "collection": "orders",
  "chartType": "bar",
  "metricType": "count",
  "groupBy": "status",
  "colorScheme": "default",
  "title": "订单状态分布",
  "showLegend": true,
  "showDataLabels": true
}
```

### 示例 2：按月统计销售总额
```json
{
  "collection": "orders",
  "chartType": "line",
  "metricType": "sum",
  "metricField": "total_amount",
  "groupBy": "created_at",
  "colorScheme": "bright",
  "title": "月度销售趋势"
}
```

### 示例 3：用户区域分布
```json
{
  "collection": "users",
  "chartType": "pie",
  "metricType": "count",
  "groupBy": "region",
  "groupByLabelField": "region_name",
  "colorScheme": "pastel",
  "title": "用户区域分布"
}
```

## 技术栈

- **ECharts 5.4.0**：图表渲染引擎
- **Vue 3**：组件框架
- **Directus Extensions SDK**：扩展开发框架
- **TypeScript**：类型安全

## 文件结构

```
basic-charts-pack/
├── index.ts           # 面板注册和配置
├── panel.vue          # 面板组件实现
├── panel.test.ts      # 单元测试
├── validation.js      # 配置验证脚本
└── README.md          # 文档
```

## 开发说明

### 安装依赖
```bash
cd extensions/bt-system-bundle
npm install
```

### 构建扩展
```bash
npm run build
```

### 开发模式
```bash
npm run dev
```

## 注意事项

1. **性能考虑**：对于大数据集，建议设置适当的 `limit` 值
2. **字段类型**：数值聚合（sum/avg）需要字段为数值类型
3. **分组字段**：建议使用基数较低的字段进行分组，避免数据过于分散

## 故障排除

### 图表不显示数据
- 检查是否选择了正确的数据集
- 确认分组字段和指标字段配置正确
- 查看浏览器控制台是否有错误信息

### 图表显示异常
- 确认数据格式是否正确
- 检查字段类型是否匹配
- 尝试减少数据限制值

## 许可证

MIT License

## 作者

BT Dataset Management System Team
