[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
  Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", ('"{0}"' -f $PSCommandPath)
  ) | Out-Null
  exit 0
}

$statePath = Join-Path $PSScriptRoot "artifacts\install-state.json"
if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
  throw "Estado da instalação não encontrado. Nenhuma política foi removida."
}
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$current = Get-ItemPropertyValue -Path $state.policyPath -Name $state.valueName -ErrorAction SilentlyContinue
if ([string]$current -ne [string]$state.policyValue) {
  throw "A política atual não corresponde à instalação registrada. Nada foi removido."
}

Remove-ItemProperty -Path $state.policyPath -Name $state.valueName
Write-Host "Política do ContentFlow OS removida com segurança."
Write-Host "O Chrome removerá a extensão forçada ao atualizar as políticas."
