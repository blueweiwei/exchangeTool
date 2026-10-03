# packager — 静态站点 → 单文件 exe 打包器

把**任意外部静态内容目录**（HTML/CSS/JS）编译进一个 Windows 单文件 exe。
双击即用，不需要安装 Go、Node 或任何依赖。

---

## 1. 原理

```
build.config.json            外部内容目录（默认仓库根）
        │                            │
        │  ①按 include/exclude 筛选   │
        ▼                            ▼
   packager/ui/  ←──── ②暂存快照 ──────┘
        │
        │  ③ go:embed ui（编译期嵌入）
        ▼
   dist/ToolsBox.exe  ──④运行──►  解包到临时目录
                                  → 本地 HTTP 服务（随机端口）
                                  → WebView2 窗口打开入口页
                                  → 退出时清理临时目录
```

要点：

- **`go:embed` 只能嵌入 Go 模块内的路径**，不能引用 `..` 或绝对路径。
  所以「打包外部内容」必须先由 `build.ps1` 把内容**暂存**到 `packager/ui/` 再编译。
- **不需要 CGO**。依赖库用纯 Go 的 `go-winloader` 在运行时加载 WebView2，
  且 `WebView2Loader.dll` 已由依赖库内部 embed。
- **产物是单个 exe**，无需附带任何 DLL 或文件夹。
- 目标机需要 **Windows 10+** 且装有 **WebView2 运行时**（Win10/11 通常已自带）。

---

## 2. 本地构建

```powershell
# 使用默认配置（打包仓库根目录的静态资源）
powershell -ExecutionPolicy Bypass -File packager/build.ps1

# 指定版本号（会写进 exe，可在日志/进程信息里看到）
powershell -ExecutionPolicy Bypass -File packager/build.ps1 -Version v1.2.3

# 打包完全不同的外部目录
powershell -ExecutionPolicy Bypass -File packager/build.ps1 -SourceDir "D:\my-site" -OutputName MyApp.exe

# 只预览会打包哪些文件，不写盘、不编译
powershell -ExecutionPolicy Bypass -File packager/build.ps1 -DryRun

# 只暂存不编译（排错用）
powershell -ExecutionPolicy Bypass -File packager/build.ps1 -NoBuild
```

产物：`dist/ToolsBox.exe`

### 参数

| 参数 | 说明 |
|---|---|
| `-Config` | 配置文件路径，默认 `packager/build.config.json` |
| `-SourceDir` | 覆盖 `source.dir`（相对 `packager/` 或绝对路径） |
| `-OutputName` | 覆盖产物文件名 |
| `-OutputDir` | 覆盖产物目录 |
| `-Version` | 写入 exe 的版本号（`-X main.appVersion`） |
| `-DryRun` | 只列出待打包文件 |
| `-NoBuild` | 只做暂存，不编译 |
| `-KeepStaging` | 保留暂存目录（默认即保留，便于排错） |

### 开发模式（免重新编译）

编译好的 exe 支持直接指向外部目录，改一版看一版：

```powershell
dist\ToolsBox.exe -dir "C:\path\to\site"
dist\ToolsBox.exe -port 18080 -debug      # 固定端口 + 开启 WebView2 调试
```

---

## 3. 配置参考（`build.config.json`）

```jsonc
{
  "source": {
    "dir": "..",                      // 相对 packager/，默认仓库根
    "include": ["**/*.html", "**/*.js", "**/*.json"],   // 通配符白名单
    "exclude": ["har-inspector - 副本.html"]            // 黑名单，优先级高于 include
  },
  "output": {
    "dir": "../dist",
    "name": "ToolsBox.exe"
  },
  "window": {
    "title": "工具导航站",             // 窗口标题
    "width": 1440,
    "height": 960,
    "entry": "index.html",            // 入口页（相对内容根）
    "userAgent": ""                   // 留空 = Edge 默认 UA
  },
  "build": {
    "goos": "windows",
    "goarch": "amd64",
    "ldflags": "-s -w -H=windowsgui"  // -H=windowsgui：不弹控制台窗口
  }
}
```

### 通配符语义

| 写法 | 含义 |
|---|---|
| `**/*.html` | 任意层级（含根目录）的 html |
| `*.html` | **仅**根目录的 html |
| `js/**` | `js/` 下任意内容 |
| `?` | 单个字符（不含路径分隔符） |

### 强制排除（写死在脚本里，配置无法放开）

`.git/**` `.github/**` `.workbuddy/**` `.omo/**` `packager/**` `dist/**` `node_modules/**` `doc/**` `bak/**`

> 这些是仓库基础设施或产物，防止误把打包器自身、git 历史塞进 exe。

---

## 4. 文件说明

| 文件 | 入库 | 说明 |
|---|---|---|
| `main.go` | ✅ | 主程序：解包内嵌资源 → 起 HTTP 服务 → 开 WebView2 窗口 |
| `dialog_windows.go` | ✅ | GUI 子系统下无控制台，启动期致命错误用消息框提示 |
| `build.ps1` | ✅ | 打包脚本：筛选 → 暂存 → 注入 ldflags → `go build` |
| `build.config.json` | ✅ | 打包配置 |
| `go.mod` / `go.sum` | ✅ | Go 依赖 |
| `verify_exe.py` | ✅ | 产物校验：PE 结构、内嵌完整性、排除项泄漏 |
| `ui/` | ❌ **不入库** | 暂存目录，每次构建由 `build.ps1` 重建 |
| `../dist/` | ❌ **不入库** | 产物目录 |

> ⚠️ **`packager/` 下的源码必须提交到 git**，否则 GitHub Actions 无法构建。

---

## 5. 产物自检

```powershell
python packager/verify_exe.py
```

校验项：

- PE 结构（x64 / PE32+ / WINDOWS_GUI 无控制台）
- `WebView2Loader.dll` 已内嵌
- 编译期注入的版本号与窗口标题（UTF-8）存在
- 每个暂存文件**逐字节**内嵌（取首 96B + 中段 96B 特征串）
- 暂存内容与源文件逐字节一致
- 不应入包的文件未泄漏（取候选文件的**独有**字节窗口判定，
  避免「副本文件与正本内容重合」造成误报）

---

## 6. CI/CD

两个工作流，职责分离：

| 工作流 | 触发 | 作用 |
|---|---|---|
| `.github/workflows/auto-tag.yml` | **每次推送**到 `master`/`main`（也可手动触发并选递增类型） | 计算下一个语义化版本并推送标签 |
| `.github/workflows/release.yml` | **手动**（Actions 页面 Run workflow） | 构建单文件 exe 并创建/更新 GitHub Release |

### 版本号规则

`auto-tag.yml` 取最新的 `vX.Y.Z` 标签，默认递增 patch：

```
无标签        → v0.1.0      （首次，从 v0.0.0 递增）
v0.1.0        → v0.1.1
手动选 minor  → v0.2.0
手动选 major  → v1.0.0
```

标签已存在时会自动继续递增，保证幂等。

### 手动发布

Actions → 「构建并发布 Release」→ Run workflow：

| 输入 | 说明 |
|---|---|
| `tag` | 要发布的标签，留空 = 仓库最新标签 |
| `version` | 写入 exe 的版本号，留空 = 与标签一致 |
| `prerelease` | 勾选则发布为 Pre-release |

工作流会切到该标签对应的提交再构建，保证产物与标签一致。

### 已知限制：标签不会自动触发发布

`auto-tag.yml` 用 `GITHUB_TOKEN` 推送标签，而 GitHub **刻意禁止**用
`GITHUB_TOKEN` 产生的事件触发其他工作流（防递归）。所以本方案里 Release 是手动触发。

若要改成「推送标签即自动发布」，在 `release.yml` 加上：

```yaml
on:
  push:
    tags: ['v*']
```

并把 `auto-tag.yml` 的推送改用 PAT（仓库 Secret 里存一个有 `repo` 权限的 token，
`git push https://x-access-token:${{ secrets.PAT }}@github.com/<owner>/<repo>.git`）。

### Go 版本

`release.yml` 用 `go-version-file: packager/go.mod` 读取最低版本要求，
不硬编码版本号，避免 `go.mod` 升版后 CI 跟不上。

---

## 7. 常见问题

**Q：为什么不能直接把 `ui` 换成外部路径做 `go:embed`？**
`go:embed` 的模式必须是编译单元所在目录的相对路径，不支持 `..` 或绝对路径。必须先把内容复制进来。

**Q：双击 exe 没反应？**
GUI 子系统下没有控制台。`main.go` 已用 `fatal()` 弹消息框提示失败原因。
最常见原因是缺少 WebView2 运行时。

**Q：exe 体积 7 MB 左右正常吗？**
正常。Go 运行时 + WebView2 加载器 + 内嵌资源。`-s -w` 已去掉符号表和调试信息。

**Q：能打包成单个目录而不是单文件吗？**
`build.ps1 -NoBuild` 后 `packager/ui/` 就是可直接用浏览器打开的静态站点，
配合任意静态服务器即可，无需 exe。

**Q：非 ASCII 路径下的删除报错？**
部分环境的终端安全策略会把删除重定向到回收站，且对含中文的路径不可靠。
`build.ps1` 已规避：先把旧暂存目录 `Move` 到系统临时目录，再在临时目录内清理。
