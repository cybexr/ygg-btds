# API 安全测试说明

本文档记录 `S-5` 为 Excel 导入端点与权限同步端点补充的安全测试范围、执行方式与已知边界。

## 覆盖范围

- Excel 上传输入校验
  - 缺失文件
  - 非法 MIME 类型
  - 超过 10MB 文件限制
- Excel 管理操作授权
  - 未登录访问被拒绝
  - 普通用户访问被拒绝
  - `ds-manager` 与管理员角色允许执行危险操作
  - 伪造角色名称无法绕过检查
- 集合名输入校验
  - 路径穿越式集合名被拒绝
- 权限同步请求校验
  - 非数组请求体
  - 缺失字段
  - 非布尔 `enabled`
  - 数据库上下文缺失
  - 预览接口损坏 JSON 输入

## 测试文件

- `src/endpoints/excel-importer/__tests__/security.test.ts`
- `src/endpoints/permission-sync/__tests__/security.test.ts`

## 运行命令

```bash
npm run test:security
```

如需单独执行某一侧端点测试，可使用：

```bash
npm test -- src/endpoints/excel-importer/__tests__/security.test.ts
npm test -- src/endpoints/permission-sync/__tests__/security.test.ts
```

## 设计说明

- 复用项目现有 Vitest 风格，直接捕获路由处理函数并传入 mock `req/res`。
- 不额外引入 `supertest`，避免偏离仓库当前测试基础设施。
- 对尚未实现的权限同步鉴权与更严格输入净化，使用 `todo` 用例显式记录后续安全缺口。

## CI 建议

- 将 `npm run test:security` 纳入扩展包的常规测试流程。
- 若后续实现权限同步接口鉴权，应优先将 `todo` 用例转为强制断言。
