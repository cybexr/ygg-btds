# 小团队业务数据集管理系统 PRD

## 一. 项目概述
### 1.1 项目背景与目标
基于 Directus 构建的小团队业务数据集管理系统（Batched-Team-Dataset-Management-System）。本项目为**简单 MVP 项目**，目标是快速开发、快速上线试用。系统总体原则是为用户提供专属的数据集管理界面，不直接暴露 Directus 的自带复杂后台界面。

### 1.2 部署环境与技术栈
*   **操作系统**: linux-amd64 / win-amd64
*   **数据库**: PostgreSQL 16  （开发测试sqlite）
*   **网络环境**: 内部网络部署，不支持且不需要互联网访问
*   **前端选型**: 基于 Directus Extension (Extension Panel/Module) 开发自定义界面，紧密结合 Directus 生态。

### 1.3 性能与数据量预期
*   **数据量**: 原始库数量约几十个；单个库表典型数据数万条，最大约 30 万条记录；单表典型列数 10 个，最大不超过 50 个。系统使用人数小于 10 人。
*   **阶段性范围削减 (MVP 约束)**: 
    *   **暂不支持超大体积文件导入优化**：使用基础解析方案进行直传与异步写入，暂不考虑几百MB超大表的分块流式写入。
    *   **暂不考虑前端虚拟滚动渲染**：对大数据量列表视图暂时使用常规分页渲染以求快速走通，延后考虑极致流畅的虚拟列表体验。

## 二. 角色与安全
### 2.1 预设角色体系
系统预置三种业务层面的角色，所有的读写操作底层权限依然由 Directus 的内置鉴权机制保障。
1.  **库管 (ds-manager)**：系统最高权限。具备原始库的创建与管理能力，自动拥有所有动态 {xx}库 的全部权限（对应后面的库著和库查能力）。管理员可通过直接添加、审核授权等方式管理其它角色的用户。默认与 Directus 系统 Manager 级别对应（ MVP 阶段简化设计：ds-manager 兼任 Directus 的默认 manager）。
2.  **库著 (ds-descriptor)**：具有其被授权可见的库表的增、删、改、查权限。并且有权限配置和修改该库的驾驶舱图表布局及呈现方式。（*注：附件材料挂载需求近期搁置，故不包含相关操作*）。
3.  **库查 (ds-reader)**：最低权限。仅对其被授权的可见库列表和驾驶舱拥有只读浏览权限。

### 2.2 安全与审计
*   **认证方式**：基于本地账号密码登录（不集成外部 SSO）。
*   **非功能性放宽**：MVP 阶段暂不考虑详尽的操作审计日志、特定的系统 SLA 保证以及复杂的自动化容灾备份策略。专注核心业务连通性。

## 三. 系统模块需求
基于 Directus v11 Extensions 的能力框架，系统主要业务模块设计如下，实现深度定制化 UI 与原生底层能力的结合：

### 3.1 核心元数据设计 (基础字典配置表)
为避免业务逻辑过度耦合于 Directus 自带的系统底表，系统将预先部署一张**基础字典元数据表 (`bt_dataset_registry`)**：
*   **中心化登记**：记录系统内所生成的动态表名、业务中文别名、状态（可见/隐藏）、原始来源、创建人等信息。
*   **前端联动分发**：左侧动态导航菜单与所有模块数据的可用性控制，均直接基于此元数据表进行驱动。

### 3.2 原始库管理
作为系统的核心入口，负责 Excel 到在线数据库的自动化转化。
*   **“新增”导入向导 (Modules + Endpoints)**：构建独立的“库管理”Module 页面。
    *   **Step 1. 选文件**：选择本地 `.xls` 或 `.xlsx` 文件上传。
    *   **Step 2. 析表头**：调用自定义 **Endpoints** 解析首行并判断数据类型，允许用户手动调整映射。
    *   **Step 3. 动态入库**：调用 SDK 动态创建 Collection 及对应表结构，**同时在字典配置表 `bt_dataset_registry` 中对该数据表完成信息登记**。通过异步任务执行数据入库。利用 **Hooks** 拦截记录插入失败。
    *   **Step 4. 完成确认**：摘要呈现结果并自动更新导航，左侧动态出现对应的新库表入口。
*   **可见 / 隐藏 切换 (Modules)**：变更当前库在基础元数据表中的状态属性，进而控制前端导航是否呈现该动态库。
*   **清空库表**：不可逆高危操作，提供 Truncate/Delete 的快速管理入口。

### 3.3 {xx}库表 (动态数据面板)
由系统动态生成的业务表查看/管理页面。
*   **定制化视图 (Layouts)**：抛弃过于综合的原生 Collection 视图，定制专属的列表式与卡片式 **Layouts**，提供专注录入和阅读的体验。（*注：MVP阶段以常规分页代替虚拟滚动列表*）
*   ~~**附件挂接与特殊字段**~~：暂缓。MVP 阶段不包含具体附件证明的上传与挂载逻辑。
*   **数据操作**：根据角色权限提供单行编辑/删除/新增能力；配合顶栏检索，满足页面检索。

### 3.4 {xx}库驾驶舱
基于动态数据集的可视化 BI 分析页面。
*   **专属数据看板 (Modules & Panels)**：利用独立 **Modules** 包装或直接结合 Directus Insights 进行渲染。
*   **自定义分析组件 (Panels)**：开发一系列轻量、针对单一集合优化的基础图表部件（折线图、柱状图、饼图）。允许 ds-descriptor (库著) 等级及以上用户自由配置，进行基于当前数据的计数、求和或分类汇总分析。

### 3.5 库人员管理
进行库级别权限下发与人员分配的特定入口（收归复杂的管理权限）。
*   **专注型用户分发看板 (Modules)**：通过全新开发的管理界面的 Module，仅暴露出对 ds-descriptor (库著) 和 ds-reader (库查) 两类人员的操作。
*   **权限隐式翻译引擎 (Endpoints)**：前端完成“选人-配库”组合后，通过自定义 **Endpoints** 结合后端 SDK，自动将业务侧的可见性映射翻译为底层 directus_permissions 表中复杂的存取规则。

## 四. 与 Directus 的耦合架构

### directus v11 Extensions 提供的能力框架
1. App Extensions（前端扩展，共 6 种）
| 类型 | 作用 | 典型使用场景（针对你的业务数据集） |
| --- | --- | --- |
| Interfaces | 自定义字段的输入/编辑组件（表单控件） | 复杂业务字段录入（如 JSON 编辑器、关联多选、自定义校验表单） |
| Displays | 自定义字段的展示组件（列表/详情页显示方式） | 特殊数据格式展示（如状态标签、进度条、富文本预览） |
| Layouts | 自定义集合的列表视图（Explore 页面布局） | 自定义表格/卡片/甘特图等视图，适应 10 万行大数据浏览 |
| Panels | 自定义 Insights 仪表盘面板 | 业务数据可视化看板、统计卡片、自定义小部件 |
| Modules | 自定义左侧导航栏的顶级模块/页面 | 构建专属业务模块（如“报表中心”“审批中心”） |
Themes,自定义整个 Data Studio 的主题样式（颜色、字体等）,内网统一品牌风格

2. API Extensions（后端扩展，共 3 种）
| 类型 | 作用 | 典型使用场景（针对你的业务数据集） |
| --- | --- | --- |
| Hooks | 事件钩子（数据事件、定时任务、生命周期事件触发代码） | 数据变更时自动校验、日志记录、触发下游流程 |
| Endpoints | 自定义 API 路由（新增 REST/GraphQL 接口） | 提供业务专用接口（如批量导出、复杂查询） |
| Operations | Flow（无代码自动化）中的自定义操作步骤 | 构建自动化工作流（如审批、数据同步、通知） |

3. Bundle Extensions（打包扩展，1 种）
作用：不是独立功能，而是将多个 App + API 扩展打包成一个整体，方便管理和分发。
常用于二次开发后的交付（一个 bundle 可包含 Interface + Endpoint + Hook 等多个子扩展）。
v11 中 bundle 支持嵌套，但有少量限制（如不支持 migration 类型）。



1.  **屏蔽原生后台**：前端 UI 完全由自研的 Extension Panel/Module 实现
2.  **动态建表逻辑**：当向导走到 Step 2/3 时，调用 `@directus/sdk` 利用 Directus 原生 Schema API 根据 Excel 表头动态创建 Collection （包括配置对应的 Field 类型）。
3.  **权限引擎集成**：在人员授权时，实质上是调用 Directus 的 CRUD 工具去给特定用户的特定的 Collection 赋予读写权限，使得底层依然严密使用 Directus 内置鉴权。

## 五. 项目架构

### 5.1 项目文件夹目录规划
采用 Directus v11 官方推荐的扩展结构体系，利用 Bundle 将前后端扩展统一管理分发。
```text
bt-dataset-manager/
├── docker-compose.yml       # 项目部署配置 (PostgreSQL 16, Directus)
├── uploads/                 # 文件与附件存储目录
├── extensions/              # Directus 扩展根目录
│   └── bt-system-bundle/    # 项目核心业务 Extension Bundle
│       ├── package.json
│       ├── src/
│       │   ├── modules/     # --- [App Extensions] ---
│       │   │   ├── raw-database-manager/  # 原始库管理 (前端)
│       │   │   └── user-manager/          # 人员权限分配中心 (前端)
│       │   ├── layouts/     
│       │   │   └── dataset-layout/        # 数据列表与卡片定制视图
│       │   ├── panels/      
│       │   │   └── basic-charts-pack/     # 折线图、饼形图等驾驶舱定制小部件
│       │   ├── endpoints/   # --- [API Extensions] ---
│       │   │   ├── excel-importer/        # 自动批量导入与建表接口
│       │   │   └── permission-sync/       # 业务权限规则向底层权限翻译的接口
│       │   └── hooks/       
│       │       └── import-validator/      # 文件导入过程校验和异常审计
│       └── ...
└── README.md
```

### 5.2 Extensions 清单规划
*   **`module-raw-database-manager` (App Plugin / Module)**: 原始库管理入口。包含多步导入向导、建表进度监控。
*   **`module-user-manager` (App Plugin / Module)**: 针对小团队人员授权的精简版管理页。
*   **`layout-dataset-layout` (App Plugin / Layout)**: 针对大批量数据集优化的大表格/卡片布局组件，替换内置的默认视图。
*   **`panel-basic-charts` (App Plugin / Panel)**: 聚焦于快速数据统计渲染的业务组件包，供大屏配置使用。
*   **`endpoint-excel-importer` (API Plugin / Endpoint)**: 解析 Excel，根据类型动态组装底层 Schema，后台异步执行大批量数据入库，确保前端无卡顿。
*   **`endpoint-auth-translator` (API Plugin / Endpoint)**: 将用户对“业务库”的简单可见性设置，解析转换为面向 Directus Collection 的精细化 Filter 过滤参数。
*   **`hook-import-audit` (API Plugin / Hook)**: 在数据生命周期及批量挂载中进行兜底的数据合法性校验，并记录错误日志。

### 5.3 业务系统模块与 Extensions 的映射关系
| 业务系统模块 (对应 PRD 第 3 章) | 核心依赖的 Extensions                                                               | 技术流转机制描述                                                                                                      |
| :------------------------------ | :---------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| **3.1 核心元数据设计**          | (内置 Base 系统层)                                                                  | 核心注册机制：将使用普通的 Directus 管理员在实施阶段建立的 `bt_dataset_registry` 来做基础支持。                         |
| **3.2 原始库管理**              | `module-raw-database-manager`<br>`endpoint-excel-importer`<br>`hook-import-audit`   | App 端 Module 提供向导与文件选取；API 端 Endpoint 异步接收文件、调度 SDK 新建表头、注表及写入数据；Hook 做兜底记录。  |
| **3.3 {xx}库表**                | `layout-dataset-layout`                                                             | 为业务数据表屏蔽原生配置等杂项，提供定制的列表/卡片展现形式（不包含附件与高级虚拟化加载机制）。                       |
| **3.4 {xx}库驾驶舱**            | `panel-basic-charts`                                                                | 用户通过拖拽特定的自定义 Panel 部件，自动从 Directus 提取对应集合的数据渲染，完全融合于内置的 Insight 功能流或独立页。 |
| **3.5 库人员管理**              | `module-user-manager`<br>`endpoint-auth-translator`                                 | 以独立应用模块暴露“简易人员池”，将设置请求发至专属 API Endpoint，由它作为代理在后台调用 Admin SDK 读写底层权限表。 |

## 六. 测试方案 (E2E 自动化测试)

### 6.1 测试架构与原则
考虑到本项目重链路且强依赖 Directus 内部机制，MVP 阶段**仅作 E2E 级业务链路测试**，保障核心可用。
*   **黑盒空库原则**：当项目以 E2E 模式启动时，测试脚本必须连接到一个全新、干净的 Directus 测试空库中（该库仅包含出厂级别的扩展和 `bt_dataset_registry` 的基础结构）。

### 6.2 前置静态资产准备 (Assets)
在正式执行 UI 自动化脚本之前，自动化测试框架需要预先加载固定的测试资产：
1.  **用户模型文件预设**：准备用于注入数据库的三个职级人员的数据配置模型 (`ds-manager`, `ds-descriptor`, `ds-reader`)。
2.  **Excel 源文件构造**：预先在本地 `tests/assets/mock_data/` 目录下放置各种测试样本，包括完美规范的 `.xlsx`、大批量数据的 `.xlsx` 以及包含异常缺行格式的 `.xlsx` 文件。

### 6.3 标准核心链路脚本闭环
标准的自动化脚本运行时，将采用类似 Playwright/Cypress 的框架，以不同身份视角贯穿以下流程以完成最终闭环：
1.  **环境与人员初始化**：脚本通过管理 API 或直连空库，秒级注入系统测试所需的三个角色用户数据。
2.  **Excel 导入建库测试**：
    *   脚本模拟管理员 (`ds-manager`) 登录前端扩展界面。
    *   进入“原始库管理”页面，上传预备好的 `.xlsx` 源文件资产。
    *   走通完整的“解析校验 -> 动态建立业务底表 (`{xx}表`) -> 字典表登记 -> 后台批量数据写库”流程，并断言导入成功。
3.  **动态授权链路测试**：
    *   管理员进入“库人员管理”模块，将新导入生成的 `{xx}表` 授权给待测试的 `ds-descriptor` 角色。
4.  **端侧消费者验收测试**：
    *   断开管理员回话，模拟 `ds-descriptor` 角色登录。
    *   断言页面菜单成功获取到新生成的 `{xx}表` 路由入口。
    *   进入列表页面，断言页面 Layouts 能正常拉取并展现刚刚写入的 Excel 业务数据行。

## 七. E2E 测试环境配置

### 7.1 测试环境结构

测试环境已配置完成，包含以下组件：

- **Playwright 配置**: `tests/e2e/playwright.config.ts`
- **Docker 测试环境**: `docker-compose.test.yml`
- **数据库初始化**: `tests/scripts/init-test-db.sql`
- **测试辅助工具**: `tests/e2e/helpers/test-base.ts`
- **环境管理脚本**: `tests/scripts/test-env.sh`
- **测试数据生成**: `tests/scripts/generate-mock-data.py`

### 7.2 快速开始

```bash
# 1. 安装测试依赖
cd tests
npm install
npm run test:e2e:install

# 2. 生成测试数据
pip install pandas openpyxl numpy
python3 ./scripts/generate-mock-data.py

# 3. 启动测试环境
./scripts/test-env.sh up

# 4. 验证环境
./scripts/test-env.sh verify

# 5. 运行测试
./scripts/test-env.sh test
```

### 7.3 测试用户

| 角色 | 邮箱 | 密码 | 权限 |
|------|------|------|------|
| 库管 | `manager@test.btdms.local` | `password` | 所有权限 |
| 库著 | `descriptor@test.btdms.local` | `password` | 编辑授权库 |
| 库查 | `reader@test.btdms.local` | `password` | 只读授权库 |

### 7.4 测试资产

- `perfect_sample.xlsx`: 100 行规范数据
- `large_dataset.xlsx`: 10,000 行大数据集
- `malformed_data.xlsx`: 异常格式数据
- `mixed_types.xlsx`: 混合类型数据

### 7.5 详细文档

- [测试环境快速入门](tests/QUICKSTART.md)
- [测试环境配置总结](tests/SETUP_SUMMARY.md)
- [完整测试文档](tests/README.md)

