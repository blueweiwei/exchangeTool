# 工具导航站 — 开发规范

## 项目概述

本地离线工具集合，纯前端 HTML/CSS/JS 实现，无构建工具、无框架、无外部网络依赖。

| 属性 | 值 |
|---|---|
| 语言 | HTML5, CSS3, JavaScript (ES2020+) |
| 构建 | 无 |
| 依赖 | 零 (所有资源本地化) |
| 运行 | 双击 HTML 文件即可在浏览器打开 |
| 数据 | 本地工具清单由 `tools.json` 管理 |

## 文件结构

```
self/
├── index.html                 # 导航主页 (工具卡片列表)
├── tools.json                 # 工具清单 (仅本地 HTML 文件)
├── base64-image-converter.html # Base64 图片/文字/文件转换器
├── signature-tool.html         # 签名生成工具
├── dev-toolkit.html            # 开发者工具箱 (URL/JSON/XML/时间戳/UUID/二维码)
├── js/
│   ├── dev-toolkit.js          # 开发者工具箱核心逻辑
│   └── qrcode-lib.min.js       # QR码生成库 (离线版)
├── bak/                        # 旧版备份 (不修改)
└── AGENTS.md                  # 本文件
```

## 界面设计系统

### 色彩体系 (深色主题)

所有页面遵循深色主题，变量前缀 `--`，定义在 `:root` 中。

```css
:root {
  --bg: #0d0d12;           /* 主背景 */
  --bg-card: #141922;       /* 卡片背景 */
  --bg-card-hover: #191f2c;  /* 卡片悬停 */
  --bg-surface: #1a2231;    /* 表面/输入框背景 */
  --border: #232d3e;        /* 边框 */
  --border-light: #2d3a50;  /* 边框高亮 */
  --text: #e6edf5;          /* 主文字 */
  --text-secondary: #8a94a8;/* 次要文字 */
  --text-muted: #586278;    /* 禁用/占位文字 */
  --radius: 12px;           /* 大圆角 */
  --radius-sm: 8px;         /* 中圆角 */
  --radius-xs: 5px;         /* 小圆角 */
  --shadow: 0 4px 24px rgba(0,0,0,0.5);
  --transition: 0.2s ease;
}
```

### 强调色 (每个文件可自定义)

| 页面 | 强调色变量 | 值 | 用途 |
|---|---|---|---|
| index.html | `--accent` | `#f0a84c` (橙) | 导航页 |
| base64-image-converter.html | `--accent` | `#4cc9f0` (蓝) | Base64 工具 |
| signature-tool.html | `--accent` | `#4cc9f0` (蓝) | 签名工具 |
| dev-toolkit.html | `--accent` | `#22d3ee` (青) | 开发者工具箱 |

每个强调色配套三个等级：
```css
--accent: #4cc9f0;                    /* 主色 */
--accent-dim: rgba(76, 201, 240, 0.15); /* 10-15% 透明度背景 */
--accent-glow: rgba(76, 201, 240, 0.25);/* 发光/阴影 */
```

### 辅助色
```css
--green: #34d399;     /* 成功 */
--green-dim: rgba(52,211,153,0.12);
--orange: #fbbf24;    /* 警告 */
--orange-dim: rgba(251,191,36,0.12);
--red: #f87171;       /* 错误 */
--red-dim: rgba(248,113,113,0.12);
```

### 字体

所有页面使用系统字体栈 (移除 Google Fonts 以支持离线):

- **UI 文字**: `'Inter', -apple-system, sans-serif` 或 `'Plus Jakarta Sans', -apple-system, sans-serif`
- **代码/等宽**: `'JetBrains Mono', monospace` (系统预装或降级到 monospace)

```css
font-family: 'Inter', -apple-system, sans-serif;
font-family: 'JetBrains Mono', monospace;
```

## UI 组件模式

### 1. 菜单栏 (Menu Bar)

玻璃拟态顶部栏，粘性定位。

```html
<div class="menu-bar">
  <div class="menu-group">
    <button class="menu-btn active" data-group="xxx">标题</button>
    <button class="menu-btn" data-group="yyy">标题</button>
  </div>
</div>
```

- `data-group` 属性绑定面板组
- `.active` 类表示当前选中
- 底部下划线动效用 `::after` 伪元素实现

### 2. 子标签 (Sub Tabs)

通过 JS 动态渲染，按钮由 `groupConfig` 配置生成。

```js
const groupConfig = {
  groupName: { tabs: [
    { id: 'tab-id', label: '📝 标签名' },
  ]},
};
```

- 父级切换 `switchGroup(group)` 更新菜单 + 面板组 + 头部标题
- 子级切换 `switchSubTab(tabId)` 更新子标签 + 面板内容

### 3. 卡片 (Cards)

```html
<div class="card">
  <div class="card-title">
    <svg>...</svg>
    标题
  </div>
  <!-- 内容 -->
</div>
```

### 4. 放置区 (Drop Zone)

```html
<div class="drop-zone" id="xxx">
  <div class="drop-zone-icon"><svg>...</svg></div>
  <div class="drop-zone-text">点击上传或拖拽到此处</div>
  <div class="drop-zone-hint">支持的格式</div>
  <input type="file" id="fileInput" ...>
</div>
```

- 拖拽时添加 `.dragover` 类
- 已有文件时添加 `.has-image` 类切换为预览模式

### 5. 文本域 (Textarea)

```css
.mono-textarea {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  line-height: 1.6;
  padding: 12px 14px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
```

### 6. 按钮 (Buttons)

| 类 | 用途 | 颜色 |
|---|---|---|
| `.btn` | 基础按钮 | 默认 |
| `.btn-primary` | 主要操作 | 强调色 |
| `.btn-green` | 成功/确认 | 绿色 |
| `.btn-orange` | 警告/校验 | 橙色 |
| `.btn-copy` | 复制 | 次要色 |
| `.btn-clear` | 清空 | 灰色，悬停变红 |

### 7. 标签 Meta

```html
<span class="meta-tag mime">MIME: image/png</span>
<span class="meta-tag size">大小: 1.2 KB</span>
```

### 8. 操作结果区

```html
<div class="result-section" id="xxxResult">
  <div class="result-meta">...</div>
  <div class="output-area">...</div>
</div>
```
`.result-section` 默认 `display:none`，有结果时添加 `.visible`。

## JavaScript 编码规范

### 文件结构

每个 HTML 文件内的 JS 使用 IIFE 包裹:
```js
(function() {
  'use strict';
  // ... 代码 ...
})();
```

外部 JS 文件同样使用 IIFE:
```js
(function () {
  'use strict';
  // ... 代码 ...
})();
```

### DOM 引用

使用 `document.getElementById` 获取元素:
```js
const el = document.getElementById('elementId');
```

### 事件绑定

使用 `addEventListener`:
```js
btn.addEventListener('click', function() { ... });
```

### 异步

使用 `async/await` 和 Promise:
```js
async function handleFile(file) { ... }
```

### Toast 通知

```js
function showToast(msg, type = 'success') { ... }
// type: 'success' | 'error' | 'warn'
```

### 粘贴自动触发

```js
input.addEventListener('paste', () => {
  setTimeout(() => {
    // 检测内容后自动执行操作
  }, 50);
});
```

### Tab 切换模式

```js
function switchGroup(group) {
  activeGroup = group;
  // 1. 更新菜单激活状态
  // 2. 切换面板组
  // 3. 更新头部标题
  // 4. 渲染子标签
  // 5. 激活第一个子标签内容
}
```

### 自动转换 (编解码/格式化)

粘贴后延迟400-500ms自动转换，错误静默处理:
```js
input.addEventListener('input', debounce(autoConvert, 400));
```

## 核心规则 (NEVER 违反)

1. **零网络依赖** — 不使用 CDN、Google Fonts、外部 API
2. **深色主题** — 所有工具必须保持深色风格
3. **纯前端** — 所有计算在浏览器本地完成，不上传服务器
4. **IIFE 隔离** — JS 代码必须用 IIFE 包裹防止变量污染
5. **`tools.json` 驱动** — 导航页只显示 `tools.json` 中的本地 HTML 文件
6. **粘贴自动检测** — 输入框粘贴时自动识别内容并转换（编解码/格式化/时间戳）
7. **按钮点击才报错** — 自动转换时错误静默，只有点击按钮才弹 toast

## 工具清单管理

编辑 `tools.json` 添加/删除工具条目:
```json
{
  "id": "t19",
  "name": "工具名",
  "url": "xxx.html",
  "desc": "功能描述",
  "icon": "🛠",
  "category": "dev"
}
```

可用分类: `convert` (转换工具), `dev` (开发工具)
