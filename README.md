# GSGI Tool

基于 [GSGI](https://github.com/adgram/GSGI)（General Simple Geometry Information）格式的 Web 编辑器工具集。
A web editor toolset based on the [GSGI](https://github.com/adgram/GSGI) (General Simple Geometry Information) format.

## 项目结构 / Project Structure

```
gsgi-tool/
├── web-editor/          # Paper.js 的 GSGI 文件查看器/编辑器（TypeScript + JS）
│                       # GSGI file viewer/editor based on Paper.js
├── converter/           # 格式转换工具（DXF ⇄ GSGI）— 计划中
│                       # Format conversion tool (DXF ⇄ GSGI) — planned
├── docs/                # 实现文档 / Implementation docs
├── examples/            # 示例 .gsgi 文件 / Sample .gsgi files
└── README.md
```

## Web 编辑器 / Web Editor

```bash
cd web-editor
npm install
npm run dev
```

详见 [web-editor/README.md](./web-editor/README.md)。
See [web-editor/README.md](./web-editor/README.md) for details.

## GSGI 格式规范 / GSGI Format Specification

GSGI 格式定义、JSON Schema 及 DXF 映射规则请参见上游库：
For GSGI format definition, JSON Schema and DXF mapping rules, see the upstream repository:
- 仓库 / Repository：https://github.com/adgram/GSGI
- Schema：https://raw.githubusercontent.com/adgram/GSGI/main/gsgi-1.0.schema.json

## 许可 / License

本项目基于 [MIT 许可证](./LICENSE)。
This project is licensed under the [MIT License](./LICENSE).
