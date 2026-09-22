/* ============================================================================
 * theme.js —— 工具站全局「夜间 / 日间」主题控制器
 *
 * 设计要点：
 * 1. 页面以 file:// 双击打开，跳转为整页加载，因此主题必须持久化在
 *    localStorage（file:// 下 origin 为 file://，可正常读写且跨页面共享；
 *    注意 fetch 在该协议下会被同源策略拦截，故不能用配置文件方案）。
 * 2. 本脚本需在 <head> 中引入且位于页面自身 <style> 之后：脚本在解析阶段
 *    同步执行，先把 data-theme 写到 <html> 上，再注入日间模式样式，
 *    因此首帧就是正确主题，不会出现闪白/闪黑。
 * 3. 日间模式样式全部写在此文件内，页面无需改动；页面只需在自己的 :root
 *    中额外声明强调色的浅色变体：
 *        --accent-light  日间模式强调色（用于文字/边框，白底需保证对比度）  必填
 *        --accent-solid  日间模式实心块底色（配深色文字，故保留亮色）      选填，
 *                        仅当本页存在「实心强调色按钮」时才声明；使用淡色按钮
 *                        （--accent-dim 底 + --accent 字）的页面不要声明，
 *                        否则会破坏其按钮配色。
 * ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'toolbox-theme';
  var TOGGLE_ID = 'tbThemeToggle';
  var STYLE_ID = 'tbThemeStyle';
  var root = document.documentElement;

  /* ------------------------------------------------------------------
   * 一、日间模式样式
   * ---------------------------------------------------------------- */
  var LIGHT_CSS = [
    /* ---------- 切换按钮（与 .back-home 同一套玻璃拟态语言） ---------- */
    '.theme-toggle{',
    '  position:fixed;top:14px;left:14px;z-index:999;',
    '  display:inline-flex;align-items:center;justify-content:center;',
    '  width:36px;height:30px;padding:0;',
    '  background:rgba(20,25,34,0.85);',
    '  border:1px solid rgba(35,45,62,0.8);',
    '  border-radius:8px;',
    '  color:#8a94a8;font-family:inherit;font-size:14px;line-height:1;',
    '  cursor:pointer;backdrop-filter:blur(4px);transition:0.2s ease;',
    '}',
    '.theme-toggle:hover{color:#e6edf5;border-color:rgba(45,58,80,0.8);background:rgba(25,31,44,0.9)}',
    /* 有「返回首页」的页面，切换按钮排在它右边 */
    'html.has-back-home .theme-toggle{left:81px}',

    /* ---------- 日间模式：变量覆盖（同时兼容项目里并存的两套命名） ---------- */
    'html[data-theme="light"]{',
    '  --bg:#f4f6fa;',
    '  --bg-primary:#f4f6fa;',
    '  --bg-card:#ffffff;',
    '  --bg-card-hover:#eef2f9;',
    '  --bg-surface:#ffffff;',
    '  --bg-secondary:#ffffff;',
    '  --border:#e3e8f0;',
    '  --border-light:#d2d9e6;',
    '  --text:#1d2433;',
    '  --text-primary:#1d2433;',
    '  --text-secondary:#5b6577;',
    '  --text-muted:#8b95a8;',
    /* 状态色改用深一档，保证白底上作为文字依然可读 */
    '  --green:#059669;',
    '  --orange:#b45309;',
    '  --red:#dc2626;',
    '  --shadow:0 4px 20px rgba(16,24,40,0.08);',
    /* 强调色拆成两种角色：文字/边框用深色变体，实心块底用亮色变体 */
    '  --accent:var(--accent-light,#0369a1);',
    '  --border-active:var(--accent-light,#0369a1);',
    '}',

    /* ---------- 日间模式：实心强调色块改用亮色底（配深色文字与亮色 hover） ----------
     * 只有「实心强调按钮」的页面才声明 --accent-solid；使用淡色按钮
     * （--accent-dim 底 + --accent 字）的页面不声明，此处靠 var() 回退保持原样式。 */
    'html[data-theme="light"] .btn-primary{background:var(--accent-solid,var(--accent-dim))}',
    'html[data-theme="light"] .card-link,',
    'html[data-theme="light"] .mode-tab.active,',
    'html[data-theme="light"] .toast.info{background:var(--accent-solid,var(--accent))}',

    /* ---------- 日间模式：装饰性图标方块改深底白字 ---------- */
    'html[data-theme="light"] .logo-icon,',
    'html[data-theme="light"] .fab,',
    'html[data-theme="light"] .icon-box,',
    'html[data-theme="light"] .sidebar-logo .icon-box{color:#fff}',

    /* ---------- 日间模式：返回首页与切换按钮改浅色药丸 ---------- */
    'html[data-theme="light"] .back-home,',
    'html[data-theme="light"] .theme-toggle{',
    '  background:rgba(255,255,255,0.9);',
    '  border-color:rgba(210,217,230,0.95);',
    '  color:#5b6577;',
    '}',
    'html[data-theme="light"] .back-home:hover,',
    'html[data-theme="light"] .theme-toggle:hover{',
    '  background:#ffffff;border-color:#b9c4d6;color:#1d2433;',
    '}',

    /* ---------- 日间模式：顶部粘性条改浅色玻璃 ---------- */
    'html[data-theme="light"] .menu-bar,',
    'html[data-theme="light"] .ca-bar,',
    'html[data-theme="light"] .vendor-bar,',
    'html[data-theme="light"] .topbar{background:rgba(255,255,255,0.85)}',

    /* ---------- 日间模式：HAR 检索器的方法徽章（原本是亮色字，白底会隐形） ---------- */
    'html[data-theme="light"] .m-GET{background:rgba(37,99,235,0.10);color:#1d4ed8}',
    'html[data-theme="light"] .m-POST{background:rgba(5,150,105,0.10);color:#047857}',
    'html[data-theme="light"] .m-PUT{background:rgba(180,83,9,0.12);color:#b45309}',
    'html[data-theme="light"] .m-PATCH{background:rgba(109,40,217,0.10);color:#6d28d9}',
    'html[data-theme="light"] .m-DELETE{background:rgba(220,38,38,0.10);color:#b91c1c}',
    'html[data-theme="light"] .m-OPTIONS,',
    'html[data-theme="light"] .m-HEAD,',
    'html[data-theme="light"] .m-OTHER{background:rgba(100,116,139,0.12);color:#475569}',

    /* ---------- 日间模式：检索命中高亮改深字浓底 ---------- */
    'html[data-theme="light"] mark{',
    '  background:rgba(251,191,36,0.55);',
    '  border-bottom-color:rgba(217,119,6,0.65);',
    '  color:#1d2433;',
    '}',

    /* ---------- 日间模式：滚动条 ---------- */
    'html[data-theme="light"] ::-webkit-scrollbar-thumb{background:#c9d2e0;background-clip:content-box}',
    'html[data-theme="light"] ::-webkit-scrollbar-thumb:hover{background:#aab6c9;background-clip:content-box}',
  ].join('\n');

  /* ------------------------------------------------------------------
   * 二、读写与套用
   * ---------------------------------------------------------------- */
  function readStored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return v === 'light' ? 'light' : 'dark';
    } catch (e) {
      return 'dark'; // localStorage 不可用时退回默认夜间模式
    }
  }

  function store(mode) {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) { /* 忽略 */ }
  }

  var mode = readStored();

  function apply(m) {
    mode = m;
    root.setAttribute('data-theme', mode);
    var btn = document.getElementById(TOGGLE_ID);
    if (btn) paintButton(btn);
  }

  // 同步套用，先于首帧渲染
  root.setAttribute('data-theme', mode);

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = LIGHT_CSS;
    var host = document.head || root;
    host.appendChild(s);
  }
  injectStyle();

  /* ------------------------------------------------------------------
   * 三、切换按钮
   * ---------------------------------------------------------------- */
  function paintButton(btn) {
    var toLight = mode === 'dark';
    btn.textContent = toLight ? '\u2600' : '\uD83C\uDF19'; // ☀ / 🌙
    var label = toLight ? '切换为日间模式' : '切换为夜间模式';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }

  function toggle() {
    apply(mode === 'light' ? 'dark' : 'light');
    store(mode);
  }

  function buildButton() {
    if (document.getElementById(TOGGLE_ID)) return;
    var back = document.querySelector('.back-home');
    if (back) root.classList.add('has-back-home');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = TOGGLE_ID;
    btn.className = 'theme-toggle';
    paintButton(btn);
    btn.addEventListener('click', toggle);

    if (back && back.parentNode) back.parentNode.insertBefore(btn, back.nextSibling);
    else document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildButton);
  } else {
    buildButton();
  }

  /* ------------------------------------------------------------------
   * 四、对外接口（便于调试与自动化验证）
   * ---------------------------------------------------------------- */
  window.__theme = {
    get: function () { return mode; },
    set: function (m) { apply(m === 'light' ? 'light' : 'dark'); store(mode); },
    toggle: toggle,
    key: STORAGE_KEY
  };
})();
