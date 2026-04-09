# Excel 解析异常文件 Fixtures

本目录用于存放 `excel-parser-error-handling.test.ts` 使用的异常输入样本。

- `corrupted-zip.xlsx`: 仅保留 ZIP 头部，模拟截断的 xlsx 容器
- `fake-text.xlsx`: 伪装成 xlsx 的纯文本文件
- `invalid-central-directory.xlsx`: 中央目录损坏的 ZIP 片段
- `malformed-xml.xlsx`: 非法 XML 内容，模拟工作簿结构异常
- `csv-masquerading.xlsx`: CSV 文本伪装成 xlsx
- `encrypted-placeholder.xlsx`: 加密/不可读占位样本
