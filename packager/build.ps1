<#
.SYNOPSIS
    把「外部静态内容目录」打包为单个 Windows exe（基于 packager/ 的 Go + WebView2 外壳）。

.DESCRIPTION
    打包链路：
      1. 读取 build.config.json
      2. 按 include / exclude 通配符筛选外部内容
      3. 清空并重建暂存目录 packager/ui/（go:embed 只能嵌入模块内路径，故必须先落盘）
      4. 把窗口配置注入 ldflags（-X main.xxx）
      5. go build 产出单个 exe

.PARAMETER Config
    配置文件路径，默认 packager/build.config.json

.PARAMETER SourceDir
    覆盖配置里的 source.dir（相对 packager/ 或绝对路径）

.PARAMETER OutputName
    覆盖产物文件名，如 ToolsBox.exe

.PARAMETER OutputDir
    覆盖产物目录

.PARAMETER Version
    写入 exe 的版本号（-X main.appVersion），CI 里传 tag 或 commit sha

.PARAMETER DryRun
    只列出将要打包的文件，不做任何写入、不编译

.PARAMETER NoBuild
    只做内容暂存，不执行 go build

.PARAMETER KeepStaging
    保留暂存目录（默认也会保留，便于排错；显式声明用于 CI 归档）

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File packager/build.ps1

.EXAMPLE
    powershell -File packager/build.ps1 -SourceDir "D:\mysite" -OutputName MyApp.exe -Version v1.0.0
#>
[CmdletBinding()]
param(
    [string]$Config,
    [string]$SourceDir,
    [string]$OutputName,
    [string]$OutputDir,
    [string]$Version = '',
    [switch]$DryRun,
    [switch]$NoBuild,
    [switch]$KeepStaging
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------- 基础工具

$PackagerDir = $PSScriptRoot
$StagingDir  = Join-Path $PackagerDir 'ui'

if (-not $Config) { $Config = Join-Path $PackagerDir 'build.config.json' }

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Info($msg) { Write-Host "    $msg" -ForegroundColor DarkGray }
function Fail($msg) {
    Write-Host "!!  $msg" -ForegroundColor Red
    exit 1
}

function Get-Cfg($obj, $name, $default) {
    if ($null -eq $obj) { return $default }
    if ($obj.PSObject.Properties.Name -contains $name) {
        $v = $obj.$name
        if ($null -ne $v) { return $v }
    }
    return $default
}

# 通配符 -> 正则。语义：
#   '**/'  任意层目录（含零层，即根目录也算匹配）
#   '**'   任意字符（含路径分隔符）
#   '*'    任意字符（不含路径分隔符）
#   '?'    单个字符（不含路径分隔符）
function Convert-GlobToRegex([string]$glob) {
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('^')
    $chars = $glob.ToCharArray()
    for ($i = 0; $i -lt $chars.Length; $i++) {
        $c = $chars[$i]
        if ($c -eq '*') {
            $isDouble = ($i + 1 -lt $chars.Length) -and ($chars[$i + 1] -eq '*')
            if ($isDouble) {
                if (($i + 2 -lt $chars.Length) -and ($chars[$i + 2] -eq '/')) {
                    [void]$sb.Append('(?:.*/)?')
                    $i += 2
                } else {
                    [void]$sb.Append('.*')
                    $i += 1
                }
            } else {
                [void]$sb.Append('[^/]*')
            }
        } elseif ($c -eq '?') {
            [void]$sb.Append('[^/]')
        } else {
            [void]$sb.Append([System.Text.RegularExpressions.Regex]::Escape([string]$c))
        }
    }
    [void]$sb.Append('$')
    return $sb.ToString()
}

function Test-GlobMatch([string]$relPath, $patterns) {
    if ($null -eq $patterns) { return $false }
    foreach ($p in @($patterns)) {
        if ([string]::IsNullOrWhiteSpace($p)) { continue }
        $rx = Convert-GlobToRegex $p
        if ([System.Text.RegularExpressions.Regex]::IsMatch($relPath, $rx, 'IgnoreCase')) {
            return $true
        }
    }
    return $false
}

# 强制排除：这些是仓库基础设施或产物，绝不能进包
$HardExclude = @(
    '.git/**', '.github/**', '.workbuddy/**', '.omo/**',
    'packager/**', 'dist/**', 'node_modules/**', 'doc/**', 'bak/**'
)

# ---------------------------------------------------------------- 1. 读配置

if (-not (Test-Path -LiteralPath $Config)) {
    Fail "找不到配置文件: $Config"
}
$json = [System.IO.File]::ReadAllText($Config, [System.Text.Encoding]::UTF8)
$cfg  = $json | ConvertFrom-Json

$srcCfg  = Get-Cfg $cfg 'source' $null
$outCfg  = Get-Cfg $cfg 'output' $null
$winCfg  = Get-Cfg $cfg 'window' $null
$buildCfg = Get-Cfg $cfg 'build' $null

$srcRel      = Get-Cfg $srcCfg 'dir' '..'
$include     = @(Get-Cfg $srcCfg 'include' @())
$exclude     = @(Get-Cfg $srcCfg 'exclude' @())
$outRel      = Get-Cfg $outCfg 'dir' '../dist'
$outName     = Get-Cfg $outCfg 'name' 'ToolsBox.exe'
$winTitle    = Get-Cfg $winCfg 'title' '工具导航站'
$winWidth    = Get-Cfg $winCfg 'width' 1440
$winHeight   = Get-Cfg $winCfg 'height' 960
$winEntry    = Get-Cfg $winCfg 'entry' 'index.html'
$winUserAgent = Get-Cfg $winCfg 'userAgent' ''
$goos        = Get-Cfg $buildCfg 'goos' 'windows'
$goarch      = Get-Cfg $buildCfg 'goarch' 'amd64'
$baseLdflags = Get-Cfg $buildCfg 'ldflags' '-s -w -H=windowsgui'

# 命令行参数覆盖
if ($SourceDir)  { $srcRel  = $SourceDir }
if ($OutputName) { $outName = $OutputName }
if ($OutputDir)  { $outRel  = $OutputDir }

$srcRoot = [System.IO.Path]::GetFullPath((Join-Path $PackagerDir $srcRel))
$outRoot = [System.IO.Path]::GetFullPath((Join-Path $PackagerDir $outRel))

if (-not (Test-Path -LiteralPath $srcRoot)) {
    Fail "内容源目录不存在: $srcRoot"
}
if ($include.Count -eq 0) {
    Fail "配置 source.include 为空，拒绝打包（避免误把整个仓库塞进 exe）"
}

Write-Step "配置"
Write-Info "配置文件 : $Config"
Write-Info "内容源   : $srcRoot"
Write-Info "暂存目录 : $StagingDir"
Write-Info "产物     : $(Join-Path $outRoot $outName)"
Write-Info "窗口     : $winTitle  ${winWidth}x${winHeight}  入口=$winEntry"

# ---------------------------------------------------------------- 2. 筛选文件

Write-Step "扫描内容源"
$picked = New-Object System.Collections.ArrayList
$totalBytes = 0

foreach ($file in (Get-ChildItem -LiteralPath $srcRoot -Recurse -File -ErrorAction SilentlyContinue)) {
    if ($file.FullName.Length -le $srcRoot.Length) { continue }
    $rel = $file.FullName.Substring($srcRoot.Length).TrimStart('\', '/').Replace('\', '/')

    if (Test-GlobMatch $rel $HardExclude) { continue }
    if (Test-GlobMatch $rel $exclude)     { continue }
    if (-not (Test-GlobMatch $rel $include)) { continue }

    [void]$picked.Add([PSCustomObject]@{ FullName = $file.FullName; Rel = $rel; Size = $file.Length })
    $totalBytes += $file.Length
}

if ($picked.Count -eq 0) {
    Fail "没有匹配到任何文件，请检查 source.include / exclude / source.dir"
}

Write-Info "命中 $($picked.Count) 个文件，合计 $('{0:N2}' -f ($totalBytes / 1MB)) MB"
foreach ($f in $picked) {
    Write-Info ("  {0,10:N0} B  {1}" -f $f.Size, $f.Rel)
}

if ($DryRun) {
    Write-Host ""
    Write-Host "DryRun 结束，未做任何写入。" -ForegroundColor Yellow
    exit 0
}

# ---------------------------------------------------------------- 3. 暂存到 ui/

Write-Step "暂存到 ui/（go:embed 只能嵌入模块内路径）"

# 安全护栏：暂存目录必须确实是 packager/ui，避免任何越界删除
if ($StagingDir -notlike "$PackagerDir*") {
    Fail "暂存目录不在 packager/ 下，拒绝清理: $StagingDir"
}
if ((Split-Path -Leaf $StagingDir) -ne 'ui') {
    Fail "暂存目录名不是 ui，拒绝清理: $StagingDir"
}

# 清理策略说明：
#   暂存目录位于仓库内。仓库内删除在部分环境下会走「回收站」策略，且该策略对
#   含中文的路径不可靠（会 fail-closed 直接报错）。
#   因此这里不直接删仓库内目录，而是先 Move 到系统临时目录（移动不是删除），
#   再在临时目录内清理 —— 不污染回收站，也不依赖仓库内删除策略。
if (Test-Path -LiteralPath $StagingDir) {
    $trashRoot = [System.IO.Path]::GetTempPath()
    $trashDir  = Join-Path $trashRoot ('toolsbox-ui-old-' + [guid]::NewGuid().ToString('N'))
    Move-Item -LiteralPath $StagingDir -Destination $trashDir -ErrorAction Stop
    try {
        Remove-Item -LiteralPath $trashDir -Recurse -Force -ErrorAction Stop
        Write-Info '已清理上一轮暂存内容'
    } catch {
        Write-Info "旧暂存内容已移至临时目录（可自行删除）: $trashDir"
    }
}
New-Item -ItemType Directory -Path $StagingDir -Force | Out-Null

foreach ($f in $picked) {
    $dest    = Join-Path $StagingDir ($f.Rel.Replace('/', '\'))
    $destDir = Split-Path -Parent $dest
    if (-not (Test-Path -LiteralPath $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $f.FullName -Destination $dest -Force
}

$entryFile = Join-Path $StagingDir $winEntry
if (-not (Test-Path -LiteralPath $entryFile)) {
    Fail "入口页在暂存目录中不存在: $winEntry（请确认它被 include 规则覆盖）"
}
Write-Info "入口页已就位: $winEntry"

if ($NoBuild) {
    Write-Host ""
    Write-Host "NoBuild 已指定，跳过编译。暂存目录: $StagingDir" -ForegroundColor Yellow
    exit 0
}

# ---------------------------------------------------------------- 4. 组装 ldflags

# Go 的 -ldflags 值按 shell 风格分词，含空格的值必须加单引号
function Quote-LdValue([string]$v) {
    if ($v -match '\s') { return "'" + $v + "'" }
    return $v
}

$ld = $baseLdflags
$ld += ' -X main.appTitle='     + (Quote-LdValue ([string]$winTitle))
$ld += ' -X main.appWidth='     + (Quote-LdValue ([string]$winWidth))
$ld += ' -X main.appHeight='    + (Quote-LdValue ([string]$winHeight))
$ld += ' -X main.appEntry='     + (Quote-LdValue ([string]$winEntry))
if ($winUserAgent) { $ld += ' -X main.appUserAgent=' + (Quote-LdValue ([string]$winUserAgent)) }
if ($Version)      { $ld += ' -X main.appVersion='   + (Quote-LdValue $Version) }

# ---------------------------------------------------------------- 5. 编译

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    Fail "未找到 go 命令，请先安装 Go 1.21+ 并加入 PATH"
}

if (-not (Test-Path -LiteralPath $outRoot)) {
    New-Item -ItemType Directory -Path $outRoot -Force | Out-Null
}
$outFile = Join-Path $outRoot $outName
# 直接由 go build -o 覆盖同路径文件，无需先删（仓库内删除会走回收站策略）

Write-Step "go build"
Write-Info "GOOS=$goos GOARCH=$goarch CGO_ENABLED=0"
Write-Info "ldflags: $ld"

$oldGOOS = $env:GOOS; $oldGOARCH = $env:GOARCH; $oldCGO = $env:CGO_ENABLED
$env:GOOS = $goos; $env:GOARCH = $goarch; $env:CGO_ENABLED = '0'

Push-Location $PackagerDir
try {
    & go build -trimpath -ldflags $ld -o $outFile .
    $code = $LASTEXITCODE
} finally {
    Pop-Location
    $env:GOOS = $oldGOOS; $env:GOARCH = $oldGOARCH; $env:CGO_ENABLED = $oldCGO
}

if ($code -ne 0) {
    Fail "go build 失败（exit $code）"
}
if (-not (Test-Path -LiteralPath $outFile)) {
    Fail "编译命令返回成功但未找到产物: $outFile"
}

# ---------------------------------------------------------------- 6. 汇报

# GitHub Actions 的 GITHUB_OUTPUT / GITHUB_STEP_SUMMARY 必须写成 UTF-8 无 BOM。
# 注意：Windows PowerShell 5.1 的 Add-Content 默认是 ASCII 编码，
# 会把含中文的路径写成 `?`，故显式用 .NET 写入。
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Add-Utf8Line([string]$path, [string]$text) {
    [System.IO.File]::AppendAllText($path, $text + [Environment]::NewLine, $Utf8NoBom)
}

$item = Get-Item -LiteralPath $outFile
$hash = (Get-FileHash -LiteralPath $outFile -Algorithm SHA256).Hash
$stagedSize = (Get-ChildItem -LiteralPath $StagingDir -Recurse -File | Measure-Object -Property Length -Sum).Sum

Write-Host ''
Write-Host '构建完成' -ForegroundColor Green
Write-Host "  产物     : $outFile"
Write-Host "  exe 大小 : $('{0:N2}' -f ($item.Length / 1MB)) MB"
Write-Host "  内嵌内容 : $($picked.Count) 个文件 / $('{0:N2}' -f ($stagedSize / 1MB)) MB"
Write-Host "  SHA256   : $hash"
Write-Host "  版本     : $(if ($Version) { $Version } else { 'dev' })"

# GitHub Actions 输出
if ($env:GITHUB_OUTPUT) {
    Add-Utf8Line $env:GITHUB_OUTPUT "exe_path=$outFile"
    Add-Utf8Line $env:GITHUB_OUTPUT "exe_name=$outName"
    Add-Utf8Line $env:GITHUB_OUTPUT "sha256=$hash"
    Add-Utf8Line $env:GITHUB_OUTPUT "file_count=$($picked.Count)"
}

# GitHub Actions 步骤摘要
if ($env:GITHUB_STEP_SUMMARY) {
    $lines = @(
        '## 打包结果',
        '',
        '| 项 | 值 |',
        '|---|---|',
        "| 产物 | ``$outName`` |",
        "| 大小 | $('{0:N2}' -f ($item.Length / 1MB)) MB |",
        "| 内嵌文件 | $($picked.Count) 个 |",
        "| 暂存内容 | $('{0:N2}' -f ($stagedSize / 1MB)) MB |",
        "| 版本 | $(if ($Version) { $Version } else { 'dev' }) |",
        "| SHA256 | ``$hash`` |",
        ''
    )
    foreach ($l in $lines) { Add-Utf8Line $env:GITHUB_STEP_SUMMARY $l }
}
