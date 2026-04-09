# Dataset Layout

`dataset-layout` 为数据集浏览提供表格和卡片两种视图，并在布局层负责最基础的集合访问保护。

## Security

- 所有拼接 `/items/${collection}` 的前端调用都应先经过 `composables/useCollectionValidation.ts`
- 允许的集合名称格式为 `^[a-z][a-z0-9_-]{0,63}$`
- 拒绝 `../users`、`..%2Fusers`、`directus_users` 等路径穿越或系统集合访问
- 通过 `encodeURIComponent` 对通过校验的集合名做防御性编码

## Usage

```ts
import { useCollectionValidation } from './composables/useCollectionValidation';

const collectionValidation = useCollectionValidation();
const result = collectionValidation.validateCollection(collection);

if (!result.isValid) {
	throw new Error(result.error);
}

await api.get(`/items/${result.sanitized}`);
```

## Notes

- 前端校验只作为第一层防线，后端权限校验仍然必须保留
- 新增任何基于集合名拼接 URL 的组件时，必须复用同一套校验逻辑
