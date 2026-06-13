/**
 * dev-toolkit.js — 开发者工具箱核心逻辑
 * 功能: URL编解码、JSON转义/格式化、XML格式化、时间戳、UUID、二维码
 */
(function () {
  'use strict';

  // 兼容 CDN 版 qrcodejs：确保 CorrectLevel 可用
  if (typeof QRCode !== 'undefined' && !QRCode.CorrectLevel) {
    QRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
  }

  // ======================== DOM 工具 ========================

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  function showToast(msg, type) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show ' + (type || 'info');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.className = 'toast'; }, 2200);
  }

  function copyText(text) {
    if (!text) { showToast('没有内容可复制', 'warn'); return; }
    navigator.clipboard.writeText(text).then(
      () => showToast('已复制到剪贴板', 'success'),
      () => {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); showToast('已复制到剪贴板', 'success'); }
        catch { showToast('复制失败', 'error'); }
        document.body.removeChild(ta);
      }
    );
  }

  function safeExec(fn, errorMsg) {
    try { return fn(); }
    catch (e) { showToast(errorMsg + ': ' + e.message, 'error'); return null; }
  }

  // 静默执行（自动转换用，不出 toast）
  function safeExecSilent(fn) {
    try { return fn(); }
    catch (e) { return null; }
  }

  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, delay || 400);
    };
  }

  // ======================== Tab 切换 ========================

  function initTabs() {
    const tabs = $$('.nav-btn[data-tab]');
    const panels = $$('.tab-panel');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        tabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        panels.forEach(p => p.classList.toggle('active', p.id === target));
      });
    });
    // 默认激活第一个
    if (tabs.length) tabs[0].classList.add('active');
    if (panels.length) panels[0].classList.add('active');
  }

  // ======================== 1. URL 编解码 ========================

  function initUrlTools() {
    var input = $('#urlInput');
    var output = $('#urlOutput');

    function urlEncode(val) { return encodeURIComponent(val); }
    function urlDecode(val) { return decodeURIComponent(val); }

    // 自动转换：检测是否为已编码内容，自动编/解码
    function autoUrl() {
      var val = input.value;
      if (!val) { output.value = ''; return; }
      safeExecSilent(function () {
        if (/%(?:[0-9a-fA-F]{2})/.test(val)) {
          output.value = urlDecode(val);
        } else {
          output.value = urlEncode(val);
        }
      });
    }
    input.addEventListener('input', debounce(autoUrl, 400));

    $('#urlEncodeBtn').addEventListener('click', function () {
      var val = input.value;
      if (!val) { showToast('请输入要编码的内容', 'warn'); return; }
      output.value = safeExec(function () { return urlEncode(val); }, '编码失败') || '';
    });

    $('#urlDecodeBtn').addEventListener('click', function () {
      var val = input.value;
      if (!val) { showToast('请输入要解码的内容', 'warn'); return; }
      output.value = safeExec(function () { return urlDecode(val); }, '解码失败') || '';
    });

    $('#urlCopyBtn').addEventListener('click', () => copyText(output.value));
    $('#urlClearBtn').addEventListener('click', () => { input.value = ''; output.value = ''; });
  }

  // ======================== 2. JSON 转义 ========================

  function initJsonEscapeTools() {
    var input = $('#jsonEscInput');
    var output = $('#jsonEscOutput');

    function jsonEscape(val) { return JSON.stringify(val).slice(1, -1); }

    function jsonUnescape(val) {
      try { return JSON.parse('"' + val.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'); }
      catch (e) { return JSON.parse('"' + val + '"'); }
    }

    // 自动转换：检测是否已转义
    function autoJsonEsc() {
      var val = input.value;
      if (!val) { output.value = ''; return; }
      safeExecSilent(function () {
        if (/\\[nrt"\\/]/.test(val)) {
          output.value = jsonUnescape(val);
        } else {
          output.value = jsonEscape(val);
        }
      });
    }
    input.addEventListener('input', debounce(autoJsonEsc, 400));

    $('#jsonEscBtn').addEventListener('click', function () {
      var val = input.value;
      if (!val) { showToast('请输入要转义的内容', 'warn'); return; }
      output.value = safeExec(function () { return jsonEscape(val); }, '转义失败') || '';
    });

    $('#jsonUnescBtn').addEventListener('click', function () {
      var val = input.value;
      if (!val) { showToast('请输入要反转义的内容', 'warn'); return; }
      output.value = safeExec(function () { return jsonUnescape(val); }, '反转义失败') || '';
    });

    $('#jsonEscCopyBtn').addEventListener('click', () => copyText(output.value));
    $('#jsonEscClearBtn').addEventListener('click', () => { input.value = ''; output.value = ''; });
  }

  // ======================== 3. JSON 格式化 ========================

  function initJsonFormatTools() {
    var input = $('#jsonFmtInput');
    var output = $('#jsonFmtOutput');
    var errorEl = $('#jsonFmtError');
    var validateBtn = $('#jsonValidateBtn');

    function tryFormatJson(showError) {
      var val = input.value.trim();
      if (!val) { output.value = ''; errorEl.style.display = 'none'; return; }
      try {
        var parsed = JSON.parse(val);
        output.value = JSON.stringify(parsed, null, 2);
        errorEl.style.display = 'none';
      } catch (e) {
        output.value = '';
        if (showError) {
          errorEl.textContent = '✗ ' + e.message;
          errorEl.style.color = 'var(--red)';
          errorEl.style.display = 'block';
        } else {
          errorEl.style.display = 'none';
        }
      }
    }

    // 自动格式化（静默）
    input.addEventListener('input', debounce(function () { tryFormatJson(false); }, 500));

    $('#jsonFormatBtn').addEventListener('click', function () {
      if (!input.value.trim()) { showToast('请输入 JSON 内容', 'warn'); return; }
      tryFormatJson(true);
    });

    $('#jsonCompressBtn').addEventListener('click', function () {
      var val = input.value.trim();
      if (!val) { showToast('请输入 JSON 内容', 'warn'); return; }
      var result = safeExec(function () { return JSON.stringify(JSON.parse(val)); }, 'JSON 解析失败');
      if (result !== null) {
        errorEl.style.display = 'none';
        output.value = result;
      }
    });

    validateBtn.addEventListener('click', function () {
      var val = input.value.trim();
      if (!val) { showToast('请输入 JSON 内容', 'warn'); return; }
      try {
        JSON.parse(val);
        errorEl.textContent = '✓ JSON 格式正确';
        errorEl.style.color = 'var(--green)';
        errorEl.style.display = 'block';
      } catch (e) {
        errorEl.textContent = '✗ ' + e.message;
        errorEl.style.color = 'var(--red)';
        errorEl.style.display = 'block';
      }
    });

    $('#jsonFmtCopyBtn').addEventListener('click', () => copyText(output.value));
    $('#jsonFmtClearBtn').addEventListener('click', () => { input.value = ''; output.value = ''; errorEl.style.display = 'none'; });
  }

  // ======================== 4. XML 格式化 ========================

  function initXmlTools() {
    var input = $('#xmlInput');
    var output = $('#xmlOutput');

    function formatXml(xml) {
      var parser = new DOMParser();
      var doc = parser.parseFromString(xml, 'text/xml');
      var parseError = doc.querySelector('parsererror');
      if (parseError) throw new Error(parseError.textContent);
      var serializer = new XMLSerializer();
      var result = serializer.serializeToString(doc);
      // 美化缩进
      var lines = result.replace(/>\s*</g, '>\n<').split('\n');
      var formatted = lines.map(function (line, idx, arr) {
        var preceding = arr.slice(0, idx).join('\n');
        var openTags = (preceding.match(/<[^/][^>]*>/g) || []).length;
        var closeTags = (preceding.match(/<\/[^>]+>/g) || []).length;
        var selfClosing = (preceding.match(/<[^>]*\/>/g) || []).length;
        var depth = Math.max(0, openTags - closeTags - selfClosing);
        if (/^<\//.test(line)) depth--;
        return '  '.repeat(Math.max(0, depth)) + line;
      });
      return formatted.join('\n');
    }

    function minifyXml(xml) { return xml.replace(/>\s*</g, '><').trim(); }

    // 自动格式化（静默）
    input.addEventListener('input', debounce(function () {
      var val = input.value.trim();
      if (!val) { output.value = ''; return; }
      safeExecSilent(function () { output.value = formatXml(val); });
    }, 500));

    $('#xmlFormatBtn').addEventListener('click', function () {
      var val = input.value.trim();
      if (!val) { showToast('请输入 XML 内容', 'warn'); return; }
      var result = safeExec(function () { return formatXml(val); }, 'XML 解析失败');
      if (result !== null) output.value = result;
    });

    $('#xmlCompressBtn').addEventListener('click', function () {
      var val = input.value.trim();
      if (!val) { showToast('请输入 XML 内容', 'warn'); return; }
      output.value = minifyXml(val);
    });

    $('#xmlCopyBtn').addEventListener('click', () => copyText(output.value));
    $('#xmlClearBtn').addEventListener('click', () => { input.value = ''; output.value = ''; });
  }

  // ======================== 5. 时间戳 ========================

  function initTimestampTools() {
    // 时间戳 → 日期
    var tsInput = $('#tsInput');
    var tsResult = $('#tsResult');

    function getTsUnit() { return $('#tsUnitMs').checked ? 'ms' : 's'; }

    function tsToDateStr(raw, unit) {
      var num = Number(raw);
      if (isNaN(num)) throw new Error('无效数字');
      var ms = unit === 'ms' ? num : num * 1000;
      var d = new Date(ms);
      if (isNaN(d.getTime())) throw new Error('无效时间戳');
      var fmt = d.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
      var iso = d.toISOString().replace('Z', '+00:00');
      return '日期时间: ' + fmt + '\nISO 8601: ' + iso;
    }

    // 自动转换（静默）
    function autoTs() {
      var raw = tsInput.value.trim();
      if (!raw) { tsResult.textContent = '等待输入…'; return; }
      safeExecSilent(function () {
        tsResult.textContent = tsToDateStr(raw, getTsUnit());
      });
    }
    tsInput.addEventListener('input', debounce(autoTs, 400));
    // 单位切换时也触发自动转换
    $$('input[name="tsUnit"]').forEach(function (el) {
      el.addEventListener('change', autoTs);
    });

    $('#tsToDateBtn').addEventListener('click', function () {
      var raw = tsInput.value.trim();
      if (!raw) { showToast('请输入时间戳', 'warn'); return; }
      var result = safeExec(function () { return tsToDateStr(raw, getTsUnit()); }, '转换失败');
      if (result !== null) tsResult.textContent = result;
    });

    $('#tsNowBtn').addEventListener('click', function () {
      var now = Date.now();
      var sec = Math.floor(now / 1000);
      tsInput.value = sec;
      $('#tsUnitS').checked = true;
      // 自动转换会接手处理
      autoTs();
    });

    // 日期 → 时间戳
    const dateInput = $('#dateInput');
    const dateTsResult = $('#dateTsResult');

    // 设置默认时间为当前时间
    function setDefaultDateTime() {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      dateInput.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
    setDefaultDateTime();

    $('#dateToTsBtn').addEventListener('click', () => {
      const val = dateInput.value;
      if (!val) { showToast('请选择日期时间', 'warn'); return; }
      safeExec(() => {
        const d = new Date(val);
        if (isNaN(d.getTime())) throw new Error('无效日期');
        const ms = d.getTime();
        const sec = Math.floor(ms / 1000);
        dateTsResult.textContent = `Unix 秒: ${sec}\nUnix 毫秒: ${ms}`;
      }, '转换失败');
    });

    $('#tsCopyBtn').addEventListener('click', () => copyText(tsResult.textContent));
    $('#dateTsCopyBtn').addEventListener('click', () => copyText(dateTsResult.textContent));
  }

  // ======================== 6. UUID 生成 ========================

  function initUuidTools() {
    const output = $('#uuidOutput');
    const countSelect = $('#uuidCount');

    function generateUUID() {
      // crypto.randomUUID 需安全上下文
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      // fallback
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    }

    function generate(count) {
      const result = [];
      for (let i = 0; i < count; i++) {
        result.push(generateUUID());
      }
      return result.join('\n');
    }

    $('#uuidGenBtn').addEventListener('click', () => {
      const count = parseInt(countSelect.value, 10) || 1;
      output.value = generate(count);
    });

    $('#uuidCopyBtn').addEventListener('click', () => {
      if (!output.value) { showToast('请先生成 UUID', 'warn'); return; }
      copyText(output.value);
    });

    $('#uuidClearBtn').addEventListener('click', () => { output.value = ''; });
  }

  // ======================== 7. 文字转二维码 ========================

  function initQrTools() {
    const input = $('#qrInput');
    const container = $('#qrContainer');
    const downloadBtn = $('#qrDownloadBtn');
    let currentQr = null;

    function createQR(text) {
      try {
        container.innerHTML = '';
        const size = Math.min(container.clientWidth || 280, 280);
        currentQr = new QRCode(container, {
          text: text,
          width: size,
          height: size,
          colorDark: '#0d1117',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H
        });
        showToast('二维码生成成功', 'success');
      } catch (e) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);"><p>生成失败: ' + e.message + '</p></div>';
        showToast('生成失败: ' + e.message, 'error');
      }
    }

    $('#qrGenBtn').addEventListener('click', () => {
      const text = input.value.trim();
      if (!text) { showToast('请输入要生成二维码的内容', 'warn'); return; }
      createQR(text);
    });

    downloadBtn.addEventListener('click', () => {
      const canvas = container.querySelector('canvas');
      const img = container.querySelector('img');
      if (canvas) {
        const link = document.createElement('a');
        link.download = 'qrcode.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('二维码已下载', 'success');
      } else if (img) {
        const link = document.createElement('a');
        link.download = 'qrcode.png';
        link.href = img.src;
        link.click();
        showToast('二维码已下载', 'success');
      } else {
        showToast('请先生成二维码', 'warn');
      }
    });

    $('#qrClearBtn').addEventListener('click', () => { input.value = ''; container.innerHTML = ''; currentQr = null; });
  }

  // ======================== 初始化 ========================

  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initUrlTools();
    initJsonEscapeTools();
    initJsonFormatTools();
    initXmlTools();
    initTimestampTools();
    initUuidTools();
    initQrTools();
  });

})();
