import os, struct, sys

EXE = r"C:\HIHIS\other\exchange-工具小助手-v1.0-携带版\exchange-工具小助手-v1.0\dist\ToolsBox.exe"
STAGE = r"C:\HIHIS\other\exchange-工具小助手-v1.0-携带版\exchange-工具小助手-v1.0\packager\ui"
SRC = r"C:\HIHIS\other\exchange-工具小助手-v1.0-携带版\exchange-工具小助手-v1.0"

data = open(EXE, "rb").read()
print(f"[exe] size = {len(data):,} bytes")

# ---- PE 结构 ----
assert data[:2] == b"MZ", "不是 PE 文件"
e_lfanew = struct.unpack_from("<I", data, 0x3C)[0]
assert data[e_lfanew:e_lfanew+4] == b"PE\0\0", "PE 签名错误"
machine = struct.unpack_from("<H", data, e_lfanew+4)[0]
opt_off = e_lfanew + 24
magic = struct.unpack_from("<H", data, opt_off)[0]
subsystem = struct.unpack_from("<H", data, opt_off+68)[0]

MACHINE = {0x8664: "x64 (AMD64)", 0x14c: "x86 (i386)", 0xAA64: "ARM64"}
MAGIC = {0x10b: "PE32", 0x20b: "PE32+"}
SUBSYS = {2: "WINDOWS_GUI (无控制台窗口)", 3: "WINDOWS_CUI (控制台)"}
print(f"[PE] machine   = {MACHINE.get(machine, hex(machine))}")
print(f"[PE] opt magic = {MAGIC.get(magic, hex(magic))}")
print(f"[PE] subsystem = {SUBSYS.get(subsystem, hex(subsystem))}")

# ---- 依赖库自带的 WebView2Loader.dll 是否内嵌 ----
print(f"[embed] WebView2Loader.dll 内嵌 = {b'WebView2Loader.dll' in data}")

# ---- 编译期注入的配置 ----
for label, needle in [
    ("版本号 (appVersion)", b"v0.1.0-test"),
    ("窗口标题 (appTitle, UTF-8)", "工具导航站".encode("utf-8")),
]:
    print(f"[inject] {label} = {needle in data}")

# ---- 每个暂存文件是否逐字节内嵌 ----
def find_all(hay, needle):
    i, n = hay.find(needle), 0
    while i != -1:
        n += 1
        i = hay.find(needle, i + 1)
    return n

print("\n[embed] 逐文件字节级校验（取首 96B + 中段 96B 作为特征串）")
staged = []
for root, _, files in os.walk(STAGE):
    for f in files:
        p = os.path.join(root, f)
        rel = os.path.relpath(p, STAGE).replace("\\", "/")
        staged.append((rel, p))
staged.sort()

ok_count = 0
for rel, p in staged:
    raw = open(p, "rb").read()
    n = len(raw)
    head = raw[:96]
    mid = raw[n // 2: n // 2 + 96] if n >= 192 else b""
    head_hit = find_all(data, head) > 0
    mid_hit = find_all(data, mid) > 0 if mid else True
    flag = "OK " if (head_hit and mid_hit) else "MISS"
    if head_hit and mid_hit:
        ok_count += 1
    print(f"  {flag} {n:>8,} B  {rel}")
print(f"[embed] {ok_count}/{len(staged)} 个文件命中")

# ---- 源目录 -> 暂存目录 内容一致性 ----
print("\n[stage] 暂存内容与源文件逐字节一致校验")
mismatch = 0
for rel, p in staged:
    s = os.path.join(SRC, rel.replace("/", "\\"))
    if not os.path.exists(s):
        print(f"  MISS 源文件不存在: {rel}")
        mismatch += 1
        continue
    if open(s, "rb").read() != open(p, "rb").read():
        print(f"  DIFF {rel}")
        mismatch += 1
print(f"[stage] 不一致数 = {mismatch}")

# ---- 不应入包的内容 ----
# 判定方式：取候选文件的一段「独有」字节窗口作为特征串。
# 之所以强调"独有"：har-inspector - 副本.html 与 har-inspector.html 内容高度重合，
# 直接用它的中段会在 exe 里命中（因为正本被嵌入了），属误报。
print("\n[exclude] 非目标内容泄漏检查（取候选文件独有字节窗口）")

staged_blobs = [open(p, "rb").read() for _, p in staged]

def unique_needle(path):
    raw = open(path, "rb").read()
    n, win = len(raw), 128
    if n < win:
        return raw
    # 从文件各处取多个窗口，挑一个不在任何已入包文件里出现的
    for frac in (0.5, 0.25, 0.75, 0.1, 0.9, 0.4, 0.6):
        s = int(n * frac)
        s = max(0, min(s, n - win))
        cand = raw[s:s + win]
        if not any(cand in blob for blob in staged_blobs):
            return cand
    return None

leak_candidates = [
    r"AGENTS.md",
    r"har-inspector - 副本.html",
    r"packager\build.ps1",
    r"packager\main.go",
    r"packager\build.config.json",
]
leaks, skipped = [], []
for name in leak_candidates:
    p = os.path.join(SRC, name)
    if not os.path.exists(p):
        continue
    cand = unique_needle(p)
    if cand is None:
        skipped.append(name)
        continue
    if find_all(data, cand) > 0:
        leaks.append(name)
print(f"[exclude] 泄漏项 = {leaks if leaks else '无'}")
if skipped:
    print(f"[exclude] 无独有特征串、跳过 = {skipped}")

sys.exit(0 if (ok_count == len(staged) and mismatch == 0 and not leaks) else 1)
