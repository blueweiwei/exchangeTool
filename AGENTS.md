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
├── einvoice-bosi.html          # 电子发票加解密 (博思)
├── dev-toolkit.html            # 开发者工具箱 (URL/JSON/XML/时间戳/UUID/二维码)
├── har-inspector.html          # HAR 接口检索器 (本地解析抓包文件)
├── js/
│   ├── theme.js                # 全局夜间/日间主题控制器 (所有页面共用)
│   ├── dev-toolkit.js          # 开发者工具箱核心逻辑
│   └── qrcode-lib.min.js       # QR码生成库 (离线版)
├── bak/                        # 旧版备份 (不修改)
└── AGENTS.md                  # 本文件
```

## 主题系统 (夜间 / 日间切换)

⚠ **所有页面必须引入 `js/theme.js`**，否则没有主题切换按钮，也无法跟随全局主题。

```html
</style>

<!-- 全局主题：夜间 / 日间切换（localStorage 持久化，跨页面生效） -->
<script src="js/theme.js"></script>
</head>
```

工作方式：

- 主题存在 `localStorage['toolbox-theme']`（`dark` / `light`，默认 `dark`）。
  页面以 `file://` 双击打开，跳转是整页加载，**只能靠 localStorage 跨页共享**
  （`file://` 下 origin 为 `file://`，可正常读写；但 `fetch` 会被同源策略拦截，不能用配置文件方案）。
- 脚本在 `<head>` 中同步执行，先把 `data-theme` 写到 `<html>`，再注入日间样式，
  因此首帧即为正确主题，不会闪白。**必须放在页面自身 `<style>` 之后。**
- 日间模式的全部样式都写在 `js/theme.js` 内，页面不需要写浅色规则。
- 切换按钮为固定定位（`top:14px`），有 `.back-home` 时排在它右侧（`left:81px`），
  否则落在 `left:14px`。页面若在该区域有内容，需自行留出左侧内边距
  （例如 har-inspector 给顶栏设 `padding-left:124px`）。

### 页面需要声明的强调色变体

每个页面在自己的 `:root` 中额外声明本页强调色的日间变体：

```css
/* 日间模式强调色：--accent-light 用于文字/边框（白底需对比度），
   --accent-solid 用于实心块底（配深色文字，故保留亮色） */
--accent-light: #0e7490;   /* 必填 */
--accent-solid: #22d3ee;   /* 选填，见下 */
```

- `--accent-light`（必填）：日间模式下 `--accent` 会替换成它。原强调色在白底上对比度不足
  （如 `#22d3ee` 仅约 1.9:1），必须换成深一档的同类色。
- `--accent-solid`（**选填**）：**仅当本页存在「实心强调色按钮」**（`.btn-primary{background:var(--accent)}`
  配深色文字）时才声明。使用淡色按钮（`--accent-dim` 底 + `--accent` 字）的页面**不要声明**，
  否则日间模式下按钮会变成亮底亮字；不声明时 `js/theme.js` 内的 `var()` 回退会保留其原本配色。

### 两套变量命名并存（历史遗留）

改造浅色主题时需同时覆盖两套命名，`js/theme.js` 已一并处理：

| AGENTS.md 规范命名 | 旧命名（base64 / signature / einvoice） | 含义 |
|---|---|---|
| `--bg` | `--bg-primary` | 主背景 |
| `--bg-surface` | `--bg-secondary` | 表面/输入框 |
| `--border-light` | — | 边框高亮 |
| `--text` | `--text-primary` | 主文字 |
| `--accent` | `--border-active` | 强调色（注意：旧命名里它是强调色，不是浅边框） |


## 界面设计系统

### 色彩体系 (深色为默认值)

页面 `:root` 中**只写深色值**；日间(浅色)值由 `js/theme.js` 统一覆盖，见「主题系统」一节。
变量前缀 `--`，定义在 `:root` 中。
（注：各页 `--bg` 取值略有差异：index 为 `#0d0d12`，dev-toolkit / har-inspector 为
`#0b0e14`，base64 / signature / einvoice 为 `#0c0f15`。）

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

| 页面 | 强调色变量 | 值 | 日间变体 `--accent-light` | 实心按钮用 `--accent-solid` |
|---|---|---|---|---|
| index.html | `--accent` | `#f0a84c` (橙) | `#b45309` | `#f0a84c` |
| base64-image-converter.html | `--accent` | `#4cc9f0` (蓝) | `#0369a1` | `#4cc9f0` |
| signature-tool.html | `--accent` | `#4cc9f0` (蓝) | `#0369a1` | `#4cc9f0` |
| einvoice-bosi.html | `--accent` | `#f0a84c` (橙) | `#b45309` | `#f0a84c` |
| dev-toolkit.html | `--accent` | `#22d3ee` (青) | `#0e7490` | 不声明（淡色按钮） |
| har-inspector.html | `--accent` | `#22d3ee` (青) | `#0e7490` | 不声明（淡色按钮） |

每个强调色配套三个等级：
```css
--accent: #4cc9f0;                    /* 主色 */
--accent-dim: rgba(76, 201, 240, 0.15); /* 10-15% 透明度背景 */
--accent-glow: rgba(76, 201, 240, 0.25);/* 发光/阴影 */
```

### 日间模式 (浅色) 变量

由 `js/theme.js` 在 `html[data-theme="light"]` 下统一覆盖，页面无需编写：

```css
html[data-theme="light"] {
  --bg: #f4f6fa;          --bg-primary: #f4f6fa;
  --bg-card: #ffffff;     --bg-surface: #ffffff;    --bg-secondary: #ffffff;
  --bg-card-hover: #eef2f9;
  --border: #e3e8f0;      --border-light: #d2d9e6;
  --text: #1d2433;        --text-primary: #1d2433;
  --text-secondary: #5b6577;  --text-muted: #8b95a8;
  --green: #059669;  --orange: #b45309;  --red: #dc2626;  /* 深一档，白底可读 */
  --accent: var(--accent-light, #0369a1);
  --border-active: var(--accent-light, #0369a1);
}
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
2. **双主题** — 支持夜间(默认)/日间两套主题，由 `js/theme.js` 统一控制；
   **每个页面都必须引入 `js/theme.js`**。页面自身的 `:root` 只写深色值，
   日间值一律不写在页面里
3. **纯前端** — 所有计算在浏览器本地完成，不上传服务器
4. **IIFE 隔离** — JS 代码必须用 IIFE 包裹防止变量污染
5. **`tools.json` 驱动** — 导航页只显示 `tools.json` 中的本地 HTML 文件；
   因双击打开时 `fetch` 会被拦截，**还须同步维护 `index.html` 内的
   `FALLBACK_TOOLS`**，两份清单必须一致
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
