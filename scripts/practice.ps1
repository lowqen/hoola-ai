# 훌라 연습장 실행: CI가 빌드한 최신 웹앱(hoola-web 아티팩트)을 받아 로컬 서버로 연다.
# 사용: powershell -ExecutionPolicy Bypass -File scripts/practice.ps1 [-Port 8765]
param([int]$Port = 8765)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "dist\web"
$run = gh run list --repo lowqen/hoola-ai --workflow ci.yml --branch main --status success --limit 1 --json databaseId -q ".[0].databaseId"
if (-not $run) { throw "성공한 CI 실행을 찾지 못했다" }
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
gh run download $run --repo lowqen/hoola-ai -n hoola-web -D $dest
Write-Host "CI 실행 $run 의 웹앱 → $dest"
Write-Host "브라우저에서 http://localhost:$Port 를 연다 (종료: Ctrl+C)"
Start-Process "http://localhost:$Port"
python -m http.server $Port --bind 127.0.0.1 --directory $dest
