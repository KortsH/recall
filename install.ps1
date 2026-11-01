param(
    [string]$ReleaseTag='v0.3.1-preview.1',
    [string]$ReleaseDirectory,
    [string]$Destination,
    [switch]$NoLaunch,
    [switch]$NoShortcut
)
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){throw 'This installer supports Windows. Use the browser app on other platforms; see README.md.'}
if(-not $ReleaseDirectory){
    if($ReleaseTag -notmatch '^v[0-9A-Za-z._-]+$'){throw 'Invalid release tag'}
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    $ReleaseDirectory=Join-Path ([IO.Path]::GetTempPath()) ('Recall-setup-'+[Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $ReleaseDirectory | Out-Null
    $base="https://github.com/KortsH/recall/releases/download/$ReleaseTag"
    $client=New-Object Net.WebClient
    $client.Headers['User-Agent']='Recall-Setup'
    try {
        $client.DownloadFile("$base/SHA256SUMS.txt",(Join-Path $ReleaseDirectory 'SHA256SUMS.txt'))
        $client.DownloadFile("$base/Recall-Setup.exe",(Join-Path $ReleaseDirectory 'Recall-Setup.exe'))
    } finally {$client.Dispose()}
}
$installer=Join-Path (Resolve-Path -LiteralPath $ReleaseDirectory).Path 'Recall-Setup.exe'
$checksums=Get-Content -LiteralPath (Join-Path $ReleaseDirectory 'SHA256SUMS.txt')
$entry=@($checksums | Where-Object {$_ -match '^[a-fA-F0-9]{64}\s+\*?Recall-Setup\.exe$'})
if($entry.Count -ne 1){throw 'Installer checksum is missing or ambiguous'}
$expected=($entry[0] -split '\s+')[0]
$sha=[Security.Cryptography.SHA256]::Create()
$stream=[IO.File]::OpenRead($installer)
try {$actual=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','')} finally {$stream.Dispose();$sha.Dispose()}
if($actual -ne $expected){throw 'Checksum mismatch. The installer was not run.'}
$arguments=@()
if($Destination){$arguments+=@('--install-dir',('"'+[IO.Path]::GetFullPath($Destination)+'"'))}
if($NoLaunch){$arguments+='--no-launch'}
if($NoShortcut){$arguments+='--no-shortcut'}
$parameters=@{FilePath=$installer;Wait=$true;PassThru=$true}
if($NoLaunch){$parameters.WindowStyle='Hidden'}
if($arguments.Count){$parameters.ArgumentList=$arguments}
$result=Start-Process @parameters
if($result.ExitCode -ne 0){throw "Recall Setup exited with code $($result.ExitCode)"}
Write-Output 'Recall installed. Open Recall from the Start menu; no Node.js, PostgreSQL or home server is needed for device-only study.'
