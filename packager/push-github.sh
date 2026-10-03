#!/bin/bash
# 自动挑选可用 IP 并推送到 GitHub。
#
# 背景：本机 github.com 的 DNS 结果与部分 IP 会间歇性不可达。
# 本脚本遍历候选 IP，逐个写入 hosts 并尝试推送，成功即停。
#
# 用法：bash packager/push-github.sh [分支名，默认 master]

set -uo pipefail

BRANCH="${1:-master}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOSTS="/c/Windows/System32/drivers/etc/hosts"
MARK_BEGIN="# >>> exchangeTool push auto >>>"
MARK_END="# <<< exchangeTool push auto <<<"

# 候选 IP：GitHub 官方公布的 github.com 地址段
CANDIDATES=(
  20.205.243.166
  140.82.112.3
  140.82.113.3
  140.82.114.3
  140.82.116.3
  140.82.121.4
  20.27.177.113
  20.200.245.247
  20.233.83.145
  20.201.28.151
)

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "请先设置 GITHUB_TOKEN 环境变量（需 repo 权限）："
  echo "  export GITHUB_TOKEN=ghp_xxx"
  exit 2
fi

USER_NAME="${GITHUB_USER:-blueweiwei}"
REMOTE_URL="https://github.com/${USER_NAME}/exchangeTool"

write_hosts() {
  local ip="$1"
  # 先清掉旧的映射块
  python - "$HOSTS" "$MARK_BEGIN" "$MARK_END" "$ip" <<'PY'
import io, re, sys
path, begin, end, ip = sys.argv[1:5]
try:
    with io.open(path, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
except IOError:
    sys.exit(0)
content = re.sub(re.escape(begin) + r'.*?' + re.escape(end) + r'\r?\n?', '', content,
                 flags=re.S)
content = content.rstrip('\r\n') + '\n'
if ip:
    content += '%s\n%s %s\n%s\n' % (begin, ip, 'github.com', end)
with io.open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(content)
PY
  ipconfig //flushdns >/dev/null 2>&1 || true
}

cleanup() {
  write_hosts ""
  echo "已清理 hosts 映射"
}
trap cleanup EXIT

cd "$REPO_DIR" || exit 2

echo "目标分支: $BRANCH"
echo "仓库目录: $REPO_DIR"
echo ""

for ip in "${CANDIDATES[@]}"; do
  printf '%-18s ' "$ip"
  if ! timeout 6 bash -c "cat < /dev/null > /dev/tcp/$ip/443" 2>/dev/null; then
    echo "端口不通，跳过"
    continue
  fi
  echo "端口通，写入 hosts 并推送..."

  write_hosts "$ip"

  out=$(timeout 240 git -c credential.helper= push \
        "https://${USER_NAME}:${GITHUB_TOKEN}@github.com/${USER_NAME}/exchangeTool" \
        "${BRANCH}:${BRANCH}" 2>&1)
  code=$?

  # 抹掉输出里的令牌
  echo "$out" | sed -E 's#gh[a-z]_[A-Za-z0-9]+#***#g' | sed 's/^/    /'

  if [ $code -eq 0 ]; then
    echo ""
    echo "推送成功（使用 IP $ip）"
    exit 0
  fi

  # 权限类错误换 IP 也没用，直接退出
  if echo "$out" | grep -q 'without .workflow. scope'; then
    echo ""
    echo "推送被拒：令牌缺少 workflow scope（换 IP 无用）"
    exit 3
  fi
  echo ""
done

echo "所有候选 IP 均失败。可手动补充候选 IP 后重试。"
exit 1
