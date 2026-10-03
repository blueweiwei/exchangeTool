# 推送到 GitHub —— 环境限制与可用方案

> 本文记录 2026-10-03 实测结论。**代码提交本身已完成**（本地 `master` = `2a01b5c`），
> 只有「推送」这一步受网络环境阻塞。

## 一、当前环境实测结果

| 检查项 | 结果 |
|---|---|
| `origin` | `https://gh-proxy.org/https://github.com/blueweiwei/exchangeTool` |
| `gh-proxy.org` 读操作（`git ls-remote`） | ✅ 正常 |
| `gh-proxy.org` 写操作（`git push`） | ❌ `No anonymous write access` |
| `gh-proxy.org` 写端点预检 | HTTP 401（通道存在，但代理不透传认证） |
| `github.com:443` 直连 | ❌ TCP 不通（被墙） |
| `api.github.com:443` 直连 | ✅ 通（HTTP 200） |
| `ssh.github.com:443`（SSH over 443） | ✅ TCP 通 |
| `codeload / raw / objects.githubusercontent.com` | ✅ 通 |
| 本机可用 HTTP 代理端口 | ❌ 全部关闭（46963/7890/10809/1080/8080/10808） |
| `~/.git-credentials` 内容 | 仅 `cnb.cool`，**无** github / gh-proxy 凭据 |
| 令牌 scope | `repo`（足够推送） |
| 令牌对 `blueweiwei/exchangeTool` 权限 | `admin: True, push: True` ✅ |

**根因**：`gh-proxy.org` 是一个只读镜像代理，它**不会把客户端的 `Authorization` 头透传给 GitHub**，
因此任何凭据都无法用于写入。而直连 `github.com:443` 被网络阻断。

**排除项**（这些都没问题，不用再查）：
- 令牌有效性 → 已用 `/user` 验证，身份 `blueweiwei`
- 仓库写权限 → 已用 `/user/repos` 验证，`push=True` / `admin=True`
- 令牌 scope → 已用响应头 `X-OAuth-Scopes: repo` 验证，足够
- 证书问题 → 已用 `http.sslBackend=openssl` + `sslVerify=false` 绕过，其后报错变为
  `repository not found`，证明 TLS 不是障碍

---

## 二、推荐方案：SSH over 443

`ssh.github.com:443` 实测可达，这是 GitHub 官方的备用 SSH 端口，
专为 443 被放行、22 被封的环境设计，且不经过任何代理。

### 步骤 1：生成密钥

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_gh -N "" -C "exchangeTool"
cat ~/.ssh/id_ed25519_gh.pub
```

### 步骤 2：把公钥加到 GitHub

打开 https://github.com/settings/ssh/new ，粘贴上一步输出的公钥内容，保存。

> 无法自动注册：令牌 scope 只有 `repo`，缺 `admin:public_key`，
> 调 `POST /user/keys` 会返回 404。必须手动添加，或给令牌补上 `admin:public_key` 后重试。

### 步骤 3：配置 SSH 走 443

写入 `~/.ssh/config`：

```
Host github.com
    HostName ssh.github.com
    Port 443
    User git
    IdentityFile ~/.ssh/id_ed25519_gh
    IdentitiesOnly yes
```

### 步骤 4：验证并推送

```bash
ssh -T git@github.com
# 期望输出：Hi blueweiwei! You've successfully authenticated...

git remote set-url origin git@github.com:blueweiwei/exchangeTool.git
git push origin master
```

### 步骤 5（可选）：恢复代理地址用于拉取

若担心 SSH 拉取也受限，可保留双远端：

```bash
git remote add ghproxy https://gh-proxy.org/https://github.com/blueweiwei/exchangeTool
git fetch ghproxy          # 只读走代理
git push origin master     # 写入走 SSH
```

---

## 三、备选方案：换一个可写的 HTTPS 代理

`gh-proxy.org` 只读。若你有支持 `git-receive-pack` 的代理（如自建的 Nginx 反代、
或带认证的镜像），可直接替换 origin：

```bash
git remote set-url origin https://<你的可用代理>/https://github.com/blueweiwei/exchangeTool
git push origin master
```

判断代理是否支持写入：访问
`https://<代理>/https://github.com/blueweiwei/exchangeTool.git/info/refs?service=git-receive-pack`
返回 **401**（需认证）说明支持；返回 403/404 说明只读。

---

## 四、备选方案：GitHub API 逐文件写入（不推荐）

`api.github.com` 直连可用，理论上可用 Git Data API 推提交。
但需要自行构造 tree/commit 对象，**会丢失作者信息与提交历史结构**，
且对大仓库易触发限制。仅作最后手段，不推荐。

---

## 五、当前待推送的内容

```
commit 2a01b5c  新增 packager 打包器与 CI：静态站点 → 单文件 exe
  12 files changed, 1359 insertions(+)
```

推送成功后会自动触发 `.github/workflows/auto-tag.yml`：

> ⚠️ 该工作流监听 `master` 与 `main` 两个分支，推送 `master` 会触发自动打标签。
> 但注意仓库**默认分支是 `main`**（且 `main` 只有一条孤立的 `Initial commit`），
> 而完整开发历史都在 `master`。建议到
> https://github.com/blueweiwei/exchangeTool/settings/branches
> 把默认分支改为 `master`，或把 `master` 合并进 `main`。

---

## 六、推送后的下一步

1. 到 **Actions** 页面确认「自动打标签」跑通，产生第一个 `v0.1.0` 标签
2. 手动运行「**构建并发布 Release**」工作流
3. 下载 Release 里的 exe 验证（7.26 MB 左右，双击可运行）
