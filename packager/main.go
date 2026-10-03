// ToolsBox - 静态站点打包器（Windows 桌面外壳）
//
// 职责：把「外部静态内容目录」（任意 HTML/CSS/JS 站点）编译进单个 exe。
//
// 打包链路：
//
//	build.ps1  按 build.config.json 把外部内容暂存到 packager/ui/
//	         → go build（//go:embed ui 把 ui/ 整个嵌进二进制）
//	         → dist/<输出名>.exe  单文件分发，无需附带任何 DLL
//
// 运行链路：
//
//	启动 → 解包内嵌资源到临时目录 → 起本地 HTTP 服务（随机端口）
//	     → WebView2 窗口加载入口页 → 退出时清理临时目录
//
// 说明：WebView2 运行时（WebView2Loader.dll）由依赖库内部 embed，
// 目标机只需 Windows 10+ 且已安装 WebView2 Runtime（Win10/11 通常自带）。
package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	webview2 "github.com/Krakinsight/go-webview2"
)

// ui 由构建脚本在编译前填充为「外部内容」的快照。
//
//go:embed ui
var uiFS embed.FS

// 编译期可注入的配置变量。
// 只能通过 -ldflags "-X main.<变量名>=<值>" 注入字符串，故数值也声明为 string。
// 对应 build.config.json 中的 window 段，由 build.ps1 自动拼装 ldflags。
var (
	appTitle     = "工具导航站" // 窗口标题        <- window.title
	appWidth     = "1440"  // 初始窗口宽（px） <- window.width
	appHeight    = "960"   // 初始窗口高（px） <- window.height
	appEntry     = "index.html" // 入口页（相对内容根） <- window.entry
	appUserAgent = ""      // 自定义 UA，空则用 Edge 默认 <- window.userAgent
	appVersion   = "dev"   // 版本号，由 CI 注入 tag <- build.ps1 -Version
)

func main() {
	// 命令行参数：为「开发模式」与「排障」保留逃生舱，不影响双击运行的默认行为。
	var (
		dirFlag   = flag.String("dir", "", "开发模式：直接服务该目录，跳过内嵌资源解包（便于改一版看一版）")
		debugFlag = flag.Bool("debug", false, "开启 WebView2 调试（默认 false）")
		portFlag  = flag.Int("port", 0, "本地 HTTP 端口，0 为随机端口（默认 0）")
	)
	flag.Parse()

	width := atoiOr(appWidth, 1440)
	height := atoiOr(appHeight, 960)

	log.Printf("[toolsbox] %s %s (Go 桌面外壳)", appTitle, appVersion)

	// 1. 确定要服务的静态内容根目录
	rootDir, cleanup, err := resolveContentRoot(*dirFlag)
	if err != nil {
		fatal("准备静态内容失败: %v", err)
	}
	defer cleanup()

	// 2. 本地 HTTP 服务（默认随机端口，避免端口冲突）
	addr := fmt.Sprintf("127.0.0.1:%d", *portFlag)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		fatal("监听端口失败: %v", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	go func() {
		log.Printf("[toolsbox] HTTP 服务已启动: http://127.0.0.1:%d  根目录=%s", port, rootDir)
		if err := http.Serve(listener, http.FileServer(http.Dir(rootDir))); err != nil {
			log.Printf("[toolsbox] HTTP 服务退出: %v", err)
		}
	}()

	// 3. WebView2 窗口
	opts := webview2.WebViewOptions{
		Debug:     *debugFlag,
		AutoFocus: true,
		UserAgent: appUserAgent,
		WindowOptions: webview2.WindowOptions{
			Title:  appTitle,
			Width:  uint(width),
			Height: uint(height),
			Center: true,
		},
	}
	w, err := webview2.NewWithOptions(opts)
	if err != nil {
		fatal("WebView2 初始化失败（请确认已安装 WebView2 运行时）: %v", err)
	}
	defer w.Destroy()

	// 4. 加载入口页
	entry := appEntry
	if entry == "" {
		entry = "index.html"
	}
	url := fmt.Sprintf("http://127.0.0.1:%d/%s", port, entry)
	log.Printf("[toolsbox] 加载 %s", url)
	w.Navigate(url)
	w.Run()
}

// resolveContentRoot 返回静态内容根目录。
//
//   - override 非空：开发模式，直接使用该目录（不清理，不临时目录）
//   - override 为空：把内嵌的 ui/ 解包到临时目录，返回清理函数
func resolveContentRoot(override string) (string, func(), error) {
	noop := func() {}

	if override != "" {
		abs, err := filepath.Abs(override)
		if err != nil {
			return "", noop, err
		}
		st, err := os.Stat(abs)
		if err != nil {
			return "", noop, err
		}
		if !st.IsDir() {
			return "", noop, fmt.Errorf("%s 不是目录", abs)
		}
		log.Printf("[toolsbox] 开发模式：直接服务 %s", abs)
		return abs, noop, nil
	}

	tmpDir, err := os.MkdirTemp("", "toolsbox-*")
	if err != nil {
		return "", noop, err
	}
	if err := extractFS(uiFS, "ui", tmpDir); err != nil {
		os.RemoveAll(tmpDir)
		return "", noop, err
	}
	return tmpDir, func() { os.RemoveAll(tmpDir) }, nil
}

// extractFS 将 embed.FS 中 srcDir 子树解包到 dstDir。
func extractFS(fsys embed.FS, srcDir, dstDir string) error {
	return fs.WalkDir(fsys, srcDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		relPath, err := filepath.Rel(srcDir, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dstDir, relPath)
		if d.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		data, err := fsys.ReadFile(path)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		return os.WriteFile(target, data, 0644)
	})
}

func atoiOr(s string, def int) int {
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return def
}

// fatal 在 GUI 子系统下（-H windowsgui）无控制台可打印，
// 因此同时弹一个系统消息框，避免"双击没反应"无法定位。
func fatal(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	log.Print("[toolsbox] " + msg)
	popupError(msg)
	os.Exit(1)
}
