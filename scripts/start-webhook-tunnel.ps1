$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$cloudflared = Join-Path $projectRoot '.tools\cloudflared.exe'

if (-not (Test-Path -LiteralPath $cloudflared)) {
  throw 'cloudflared não encontrado em .tools. Baixe e valide o executável antes de iniciar o túnel.'
}

& $cloudflared tunnel --url http://127.0.0.1:8788 --no-autoupdate
