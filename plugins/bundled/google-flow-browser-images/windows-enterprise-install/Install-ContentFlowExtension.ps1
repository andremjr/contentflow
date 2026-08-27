[CmdletBinding()]
param(
  [switch]$PackageOnly,
  [switch]$EnterpriseCoreEnrolled
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Request-Administrator {
  if ($PackageOnly -or (Test-IsAdministrator)) { return }

  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", ('"{0}"' -f $PSCommandPath)
  )
  if ($EnterpriseCoreEnrolled) { $arguments += "-EnterpriseCoreEnrolled" }

  Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $arguments | Out-Null
  exit 0
}

function Test-ManagedWindows {
  if ($EnterpriseCoreEnrolled) { return $true }

  $computer = Get-CimInstance Win32_ComputerSystem
  if ($computer.PartOfDomain) { return $true }

  $joinStatus = (& dsregcmd.exe /status 2>$null) -join "`n"
  return $joinStatus -match "AzureAdJoined\s*:\s*YES" -or
    $joinStatus -match "DomainJoined\s*:\s*YES"
}

function Find-Chrome {
  $candidates = @()
  foreach ($basePath in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LocalAppData)) {
    if ($basePath) {
      $candidates += Join-Path $basePath "Google\Chrome\Application\chrome.exe"
    }
  }
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  throw "Google Chrome não foi encontrado nos caminhos oficiais do Windows."
}

function Protect-SigningKey([string]$Path) {
  $userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $Path /inheritance:r /grant:r "*${userSid}:(F)" "*S-1-5-18:(F)" "*S-1-5-32-544:(F)" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível restringir as permissões da chave de assinatura."
  }
}

function Assert-ChildPath([string]$Parent, [string]$Child) {
  $parentPath = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  $childPath = [IO.Path]::GetFullPath($Child)
  if (-not $childPath.StartsWith($parentPath, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Caminho recusado por segurança: $childPath"
  }
}

function Read-Varint([byte[]]$Bytes, [ref]$Position, [int]$Limit) {
  [UInt64]$value = 0
  $shift = 0
  while ($Position.Value -lt $Limit -and $shift -le 63) {
    $current = $Bytes[$Position.Value]
    $Position.Value++
    $value = $value -bor (([UInt64]($current -band 0x7f)) -shl $shift)
    if (($current -band 0x80) -eq 0) { return $value }
    $shift += 7
  }
  throw "CRX inválido: varint incompleto."
}

function Find-ProtobufBytes([byte[]]$Bytes, [int]$Start, [int]$Length, [int]$FieldNumber) {
  $position = $Start
  $limit = $Start + $Length
  while ($position -lt $limit) {
    $key = Read-Varint $Bytes ([ref]$position) $limit
    $field = [int]($key -shr 3)
    $wire = [int]($key -band 7)
    switch ($wire) {
      0 { $null = Read-Varint $Bytes ([ref]$position) $limit }
      1 { $position += 8 }
      2 {
        $size = [int](Read-Varint $Bytes ([ref]$position) $limit)
        if ($size -lt 0 -or $position + $size -gt $limit) {
          throw "CRX inválido: campo protobuf ultrapassa o cabeçalho."
        }
        if ($field -eq $FieldNumber) {
          $result = New-Object byte[] $size
          [Array]::Copy($Bytes, $position, $result, 0, $size)
          return $result
        }
        $position += $size
      }
      5 { $position += 4 }
      default { throw "CRX inválido: wire type protobuf $wire não suportado." }
    }
    if ($position -gt $limit) { throw "CRX inválido: cabeçalho truncado." }
  }
  return $null
}

function Get-CrxId([string]$CrxPath) {
  $bytes = [IO.File]::ReadAllBytes($CrxPath)
  if ($bytes.Length -lt 12 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne "Cr24") {
    throw "O Chrome não gerou um arquivo CRX válido."
  }
  $version = [BitConverter]::ToUInt32($bytes, 4)
  if ($version -ne 3) { throw "Versão CRX não suportada: $version." }
  $headerSize = [int][BitConverter]::ToUInt32($bytes, 8)
  if (12 + $headerSize -gt $bytes.Length) { throw "Cabeçalho CRX truncado." }

  $signedData = Find-ProtobufBytes $bytes 12 $headerSize 10000
  if (-not $signedData) { throw "CRX sem signed_header_data." }
  $crxId = Find-ProtobufBytes $signedData 0 $signedData.Length 1
  if (-not $crxId -or $crxId.Length -ne 16) { throw "CRX sem identificador de 16 bytes." }

  $alphabet = "abcdefghijklmnop"
  $builder = New-Object Text.StringBuilder
  foreach ($value in $crxId) {
    $null = $builder.Append($alphabet[[int]($value -shr 4)])
    $null = $builder.Append($alphabet[[int]($value -band 15)])
  }
  return $builder.ToString()
}

function Write-UpdateManifest(
  [string]$Path,
  [string]$ExtensionId,
  [string]$Version,
  [string]$CrxUri
) {
  $settings = New-Object Xml.XmlWriterSettings
  $settings.Encoding = New-Object Text.UTF8Encoding($false)
  $settings.Indent = $true
  $writer = [Xml.XmlWriter]::Create($Path, $settings)
  try {
    $writer.WriteStartDocument()
    $writer.WriteStartElement("gupdate", "http://www.google.com/update2/response")
    $writer.WriteAttributeString("protocol", "2.0")
    $writer.WriteStartElement("app")
    $writer.WriteAttributeString("appid", $ExtensionId)
    $writer.WriteStartElement("updatecheck")
    $writer.WriteAttributeString("codebase", $CrxUri)
    $writer.WriteAttributeString("version", $Version)
    $writer.WriteEndElement()
    $writer.WriteEndElement()
    $writer.WriteEndElement()
    $writer.WriteEndDocument()
  } finally {
    $writer.Dispose()
  }
}

function Invoke-PackExtension(
  [string]$ChromePath,
  [string]$StagingExtension,
  [string]$KeyPath
) {
  $packedPath = "$StagingExtension.crx"
  if (Test-Path -LiteralPath $packedPath) { Remove-Item -LiteralPath $packedPath -Force }
  $arguments = @(("--pack-extension=`"{0}`"" -f $StagingExtension))
  if (Test-Path -LiteralPath $KeyPath -PathType Leaf) {
    $arguments += ("--pack-extension-key=`"{0}`"" -f $KeyPath)
  }
  $process = Start-Process -FilePath $ChromePath -ArgumentList $arguments -Wait -PassThru
  if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $packedPath -PathType Leaf)) {
    throw "O Chrome não conseguiu empacotar a extensão (código $($process.ExitCode))."
  }
  return $packedPath
}

Request-Administrator

if (-not $PackageOnly -and -not (Test-ManagedWindows)) {
  throw @"
Instalação cancelada sem alterar o Registro.

O Chrome no Windows só aceita extensão local forçada fora da Chrome Web Store em
máquinas vinculadas a Active Directory, Azure AD ou Chrome Enterprise Core.
Esta máquina não foi detectada como gerenciada. Use a instalação manual por perfil
ou publique a extensão na Chrome Web Store.
"@
}

$installerRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$extensionRoot = [IO.Path]::GetFullPath((Join-Path $installerRoot "..\extension"))
$artifactsRoot = Join-Path $installerRoot "artifacts"
$stagingRoot = Join-Path $artifactsRoot "staging-extension"
$crxPath = Join-Path $artifactsRoot "contentflow-google-flow.crx"
$keyPath = Join-Path $artifactsRoot "contentflow-google-flow.pem"
$xmlPath = Join-Path $artifactsRoot "update.xml"
$statePath = Join-Path $artifactsRoot "install-state.json"

if (-not (Test-Path -LiteralPath (Join-Path $extensionRoot "manifest.json") -PathType Leaf)) {
  throw "Pasta oficial da extensão não encontrada: $extensionRoot"
}
New-Item -ItemType Directory -Path $artifactsRoot -Force | Out-Null
Assert-ChildPath $installerRoot $stagingRoot
if (Test-Path -LiteralPath $stagingRoot) {
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
Copy-Item -LiteralPath $extensionRoot -Destination $stagingRoot -Recurse

$chromePath = Find-Chrome
$packedStaging = Invoke-PackExtension $chromePath $stagingRoot $keyPath
$generatedKey = "$stagingRoot.pem"
if (-not (Test-Path -LiteralPath $keyPath) -and (Test-Path -LiteralPath $generatedKey)) {
  Move-Item -LiteralPath $generatedKey -Destination $keyPath
}
if (-not (Test-Path -LiteralPath $keyPath -PathType Leaf)) {
  throw "A chave privada do pacote não foi criada."
}
Protect-SigningKey $keyPath

$extensionId = Get-CrxId $packedStaging
$manifestPath = Join-Path $stagingRoot "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$manifest.version
$crxUri = ([Uri]$crxPath).AbsoluteUri
$xmlUri = ([Uri]$xmlPath).AbsoluteUri
Write-UpdateManifest $xmlPath $extensionId $version $crxUri

$manifest | Add-Member -NotePropertyName update_url -NotePropertyValue $xmlUri -Force
$manifestJson = $manifest | ConvertTo-Json -Depth 20
[IO.File]::WriteAllText($manifestPath, $manifestJson, (New-Object Text.UTF8Encoding($false)))
$packedStaging = Invoke-PackExtension $chromePath $stagingRoot $keyPath
Copy-Item -LiteralPath $packedStaging -Destination $crxPath -Force

if ($PackageOnly) {
  Write-Host "Pacote criado sem modificar políticas do Chrome."
  Write-Host "ID: $extensionId"
  Write-Host "CRX: $crxPath"
  Write-Host "XML: $xmlPath"
  exit 0
}

$policyPath = "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist"
New-Item -Path $policyPath -Force | Out-Null
$policy = Get-ItemProperty -Path $policyPath
$policyValue = "$extensionId;$xmlUri"
$valueName = $null
foreach ($property in $policy.PSObject.Properties) {
  if ($property.Name -match '^\d+$' -and [string]$property.Value -match "^$extensionId;") {
    $valueName = $property.Name
    break
  }
}
if (-not $valueName) {
  $used = @($policy.PSObject.Properties.Name | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ })
  $next = 1
  while ($used -contains $next) { $next++ }
  $valueName = [string]$next
}
New-ItemProperty -Path $policyPath -Name $valueName -PropertyType String -Value $policyValue -Force | Out-Null

[ordered]@{
  extensionId = $extensionId
  version = $version
  policyPath = $policyPath
  valueName = $valueName
  policyValue = $policyValue
  crxPath = $crxPath
  updateXmlPath = $xmlPath
  installedAt = (Get-Date).ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8

Write-Host "Política instalada para todos os perfis normais do Chrome."
Write-Host "ID: $extensionId"
Write-Host "Política: $policyPath\$valueName"
Write-Host "Abra chrome://policy e use 'Recarregar políticas', ou reinicie o Chrome."
