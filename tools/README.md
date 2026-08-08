# Tools

本目录只存放可复现的工程、验证和证据工具；产品运行时代码不得反向依赖本目录。

## 约定

- 含非 ASCII 字符（如中文注释）的 PowerShell 脚本必须保存为 **UTF-8 with BOM**：
  Windows PowerShell 5.1 对无 BOM 脚本按系统 ANSI（中文机器 GBK）解码，
  多字节序列可能吞掉引号/换行导致解析失败或行号漂移（A-04E-2a 实证：
  `Parser::ParseFile` 报意外的 `}`；加 BOM 后 parse-ok）。
  验收动作：改动 `*.ps1` 后用
  `[System.Management.Automation.Language.Parser]::ParseFile` 做零错误解析检查。
