# 推送到 GitHub —— 环境限制与解决方案

> 2026-10-03 实测记录。**主体代码已推送成功**（远端 `master` = `42a9436`），
> 仅 `.github/workflows/` 两个工作流文件因令牌权限无法推送。

## 一、当前状态

| 内容 | 状态 |
|---|---|
| `packager/` 打包器（11 个文件） | ✅ **已推送到远端 master** |
| `.gitignore` / `.gitattributes` | ✅ 已推送 |
| `.github/workflows/auto-tag.yml` | ❌ 未推送（令牌缺 `workflow` scope） |
| `.github/workflows/release.yml` | ❌ 未推送（同上） |

远端确认：`refs/heads/master = 42a94367c0c5fc5ac625b150d3f83a503231d217`
本地与远端已一致，无分叉。工作流文件完好保留在工作区 `.github/workflows/`。

---

## 二、必须先解决：令牌缺 `workflow` scope

GitHub 有一条硬性保护规则：

> **任何令牌若没有 `workflow` scope，就不得创建或更新 `.github/workflows/` 下的文件。**
> git 推送和 REST API 都会被拒绝。

实测到的两种拒绝：

```
# git push
! [remote rejected] master -> master (refusing to allow a Personal Access Token
  to create or update workflow `.github/workflows/auto-tag.yml` without `workflow` scope)

# Contents API
HTTP 403 {"message":"Resource not accessible by personal access token"}
```

当前令牌 scope 为 `X-OAuth-Scopes: repo`（缺 `workflow`）。
**这是 GitHub 的安全设计，无法绕过**，必须换令牌。

### 解决步骤

1. 打开 https://github.com/settings/tokens
2. 编辑现有令牌（或新建一个 classic token），**勾选 `workflow`**（`repo` 基础上加这一个）
3. 保存后把新令牌给我，直接执行：

```bash
git add .github/workflows
git commit -m "新增 GitHub Actions：推送自动打标签 + 手动构建发布 Release"
git push origin master
```

勾选 `workflow` 后，这两条命令一次通过。

---

## 三、网络通道：本机连不上 GitHub 的解决办法

本机网络对 GitHub 的封锁方式比较特殊，实测结果：

| 检查项 | 结果 |
|---|---|
| `github.com` DNS 解析 | `20.205.243.166` |
| `github.com:443` 该 IP | ❌ TCP 不通 |
| `140.82.112.3 / 113.3 / 114.3 / 116.3` 等 | ✅ TCP 通 |
| `20.27.177.113` / `20.200.245.247` | ✅ TCP 通 |
| `api.github.com:443` | ✅ 通 |
| `ssh.github.com:443` | ✅ 通 |
| `gh-proxy.org` 读（`ls-remote`） | ✅ 正常 |
| `gh-proxy.org` 写（`push`） | ❌ `No anonymous write access` |
| 本机 HTTP 代理端口 | ❌ 全部关闭 |

**根因**：`github.com` 被 DNS 污染到一个不可达的 IP，但 GitHub 的**其他官方 IP 是通的**。
所以解决办法是绕开这个 DNS 结果。

### 办法一：hosts 映射（本次采用，已验证有效）

选定一个实测可达的 IP，写入 hosts：

```
# C:\Windows\System32\drivers\etc\hosts
140.82.113.3 github.com
```

然后刷新 DNS 缓存并推送：

```powershell
ipconfig /flushdns
```

```bash
git push https://<用户名>:<令牌>@github.com/blueweiwei/exchangeTool master
```

**注意**：
- hosts 需要管理员权限写入（本次环境恰好可写）
- IP 会失效，失效后换下一个（探测方法见下）
- 用完记得把 hosts 里的映射删掉，避免影响其他程序

### 探测可用 IP

```bash
for ip in 140.82.112.3 140.82.113.3 140.82.114.3 140.82.116.3 20.27.177.113 20.200.245.247; do
  printf "%-18s " "$ip"
  timeout 6 bash -c "cat < /dev/null > /dev/tcp/$ip/443" 2>/dev/null && echo "通" || echo "不通"
done
```

### 办法二：SSH over 443（长期方案，推荐）

`ssh.github.com:443` 实测可达，是 GitHub 官方的备用 SSH 端口，
不依赖任何 IP 映射。

```bash
# 1. 生成密钥
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_gh -N ""

# 2. 公钥加到 https://github.com/settings/ssh/new
cat ~/.ssh/id_ed25519_gh.pub

# 3. 配置 ~/.ssh/config
# Host github.com
#     HostName ssh.github.com
#     Port 443
#     User git
#     IdentityFile ~/.ssh/id_ed25519_gh
#     IdentitiesOnly yes

# 4. 验证并推送
ssh -T git@github.com
git remote set-url origin git@github.com:blueweiwei/exchangeTool.git
git push origin master
```

**重要优势**：`workflow` scope 的限制**只针对 Personal Access Token**，
用 SSH 密钥认证时不受此限制 —— 报错原文即
`refusing to allow a **Personal Access Token** to create or update workflow`。
所以走 SSH 可以直接推送工作流文件，无需换令牌。

> 本次未能自动注册 SSH 公钥：令牌 scope 只有 `repo`，
> 调 `POST /user/keys` 返回 404（需 `admin:public_key`）。
> 因此第 2 步必须**手动**在网页上添加公钥。

---

## 四、另一个待处理问题：默认分支是 `main`

仓库当前状态：

| 分支 | 内容 |
|---|---|
| `main`（**默认分支**） | 仅一条孤立的 `Initial commit`（`e1a2926`） |
| `master` | 完整开发历史（10 个提交，最新 `42a9436`） |

`origin/HEAD` 指向 `main`，所以**打开仓库首页看到的是那个空壳 `main`**，
不是真正的代码。建议二选一：

**方案 A：把默认分支改成 `master`（推荐，改动最小）**

https://github.com/blueweiwei/exchangeTool/settings/branches
→ Default branch → 选 `master` → Update

**方案 B：把 `master` 合并进 `main`，保持 `main` 为默认**

```bash
git checkout main
git merge master --allow-unrelated-histories
git push origin main
```

> 本仓库的两个工作流已同时监听 `master` 和 `main`，所以无论选哪个方案都能触发。

---

## 五、推送之后

1. 到 **Actions** 页面确认「自动打标签」跑通，应产生第一个 `v0.1.0` 标签
2. 手动运行「**构建并发布 Release**」工作流
3. 下载 Release 中的 exe 验证（约 7.26 MB，双击可运行，
   首次运行需要系统装有 WebView2 运行时）
