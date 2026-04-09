# DatasetTableView 组件

高性能的分页表格视图组件，专为处理大型数据集设计。

## 功能特性

- ✅ 动态列头生成
- ✅ 强制分页（50条/页）
- ✅ 全字段搜索
- ✅ 列头排序
- ✅ 行选择和批量操作
- ✅ 性能优化（防抖搜索、延迟加载）
- ✅ 响应式设计
- ✅ 完整错误处理

## 性能指标

- 分页响应: <50ms
- 搜索响应: <500ms
- 排序响应: <500ms
- 支持: 10,000+ 条数据

## 基础用法

```vue
<template>
  <DatasetTableView
    :collection="collection"
    :primary-key="primaryKey"
    :fields="fields"
    :items="items"
    :loading="loading"
    :items-per-page="50"
    @update:selection="handleSelectionChange"
    @update:options="handleOptionsUpdate"
  />
</template>

<script setup lang="ts">
import DatasetTableView from './components/DatasetTableView.vue';
import { ref } from 'vue';

const collection = ref('my_collection');
const primaryKey = ref(['id']);
const fields = ref([
  { field: 'id', name: 'ID', type: 'integer', meta: { sortable: true } },
  { field: 'name', name: 'Name', type: 'string', meta: { sortable: true } },
  { field: 'email', name: 'Email', type: 'string', meta: { sortable: true } },
]);
const items = ref([]);
const loading = ref(false);

const handleSelectionChange = (selection: Set<string | number>) => {
  console.log('Selected items:', Array.from(selection));
};

const handleOptionsUpdate = (options: Record<string, unknown>) => {
  console.log('Options updated:', options);
};
</script>
```

## Props

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `collection` | `string` | - | 集合名称（必需） |
| `primaryKey` | `string[]` | - | 主键字段数组（必需） |
| `fields` | `Field[]` | - | 字段定义数组（必需） |
| `items` | `TableItem[]` | - | 数据项数组（必需） |
| `loading` | `boolean` | `false` | 加载状态 |
| `itemsPerPage` | `number` | `50` | 每页显示条数 |

## Events

| Event | Payload | 说明 |
|-------|---------|------|
| `update:selection` | `Set<string \| number>` | 选择改变时触发 |
| `update:options` | `Record<string, unknown>` | 选项更新时触发 |

## 功能说明

### 1. 动态列头

列头根据 `fields` prop 自动生成，支持：
- 自定义列宽 (`meta.width`)
- 对齐方式 (`meta.align`)
- 排序启用/禁用 (`meta.sortable`)

### 2. 分页控制

- 强制分页模式，避免前端卡顿
- 默认 50 条/页
- 显示总项数和当前范围
- 支持首页/末页跳转

### 3. 搜索功能

- 全字段模糊搜索
- 300ms 防抖延迟
- 搜索时自动重置到第一页
- 实时过滤结果

### 4. 排序功能

- 点击列头进行排序
- 支持升序/降序切换
- 正确处理 null/undefined 值
- 支持数字和字符串排序

### 5. 行选择

- 复选框多选
- 显示已选择项数
- 通过事件向父组件传递选择结果

## 性能优化

1. **强制分页**: 只渲染当前页数据，减少 DOM 节点
2. **防抖搜索**: 300ms 延迟，减少频繁计算
3. **计算属性缓存**: Vue 3 自动缓存计算结果
4. **响应式设计**: 移动端适配，流畅体验

## 响应式断点

- 桌面: >1024px
- 平板/移动: ≤1024px

移动端布局调整：
- 搜索和控制栏垂直排列
- 保持完整功能可用

## 错误处理

- 空数据集提示
- 搜索无结果提示
- 加载状态显示
- 优雅降级

## 测试

运行测试：

```bash
npm run test DatasetTableView
```

运行验证脚本：

```bash
node verify-table-view.js
```

## 集成示例

在现有 layout.vue 中使用：

```vue
<template>
  <div class="dataset-layout" :class="`view-${viewMode}`">
    <!-- 头部控制栏保持不变 -->
    <div class="layout-header">...</div>

    <!-- 表格视图 -->
    <DatasetTableView
      v-if="viewMode === 'table'"
      :collection="collection"
      :primary-key="primaryKey"
      :fields="fields"
      :items="filteredItems"
      :loading="loading"
      @update:selection="handleSelectionChange"
      @update:options="handleOptionsUpdate"
    />

    <!-- 卡片视图保持不变 -->
    <div v-else class="card-view">...</div>
  </div>
</template>

<script setup lang="ts">
import DatasetTableView from './components/DatasetTableView.vue';

// 其他代码保持不变...
</script>
```

## 注意事项

1. 组件使用 Directus 的 `v-table` 组件，确保 Directus 版本兼容
2. 大数据集时建议在服务端实现分页和搜索
3. 确保字段元数据正确，特别是主键字段
4. 响应式设计基于 CSS media query，可能需要根据项目调整

## 未来增强

- [ ] 服务端分页支持
- [ ] 高级筛选器
- [ ] 列显示/隐藏控制
- [ ] 导出功能
- [ ] 虚拟滚动（可选）
