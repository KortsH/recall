param([switch]$SkipWebBuild)
$ErrorActionPreference='Stop'
$repo=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Push-Location $repo
try {
    if(-not $SkipWebBuild){ & node --import tsx scripts/standalone.ts --windows; if($LASTEXITCODE -ne 0){throw 'Web build failed'} }
    $compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    if(-not (Test-Path -LiteralPath $compiler)){$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'}
    if(-not (Test-Path -LiteralPath $compiler)){throw 'Building the Windows installer requires .NET Framework 4.8 on Windows.'}
    $output=Join-Path $repo 'build\windows'
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive=Join-Path $output 'web.zip'
    if(Test-Path -LiteralPath $archive){Remove-Item -LiteralPath $archive}
    [System.IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $repo 'build\standalone'),$archive)
    $launcher=Join-Path $output 'Recall.exe'
    & $compiler /nologo /optimize+ /target:winexe /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll "/resource:$archive,recall.web.zip" "/out:$launcher" (Join-Path $PSScriptRoot 'Launcher.cs')
    if($LASTEXITCODE -ne 0){throw 'Launcher compilation failed'}
    $installer=Join-Path $output 'Recall-Setup.exe'
    & $compiler /nologo /optimize+ /target:winexe /reference:System.Windows.Forms.dll "/resource:$launcher,Recall.exe" "/out:$installer" (Join-Path $PSScriptRoot 'Setup.cs')
    if($LASTEXITCODE -ne 0){throw 'Installer compilation failed'}
    Write-Output "Built $installer"
} finally {Pop-Location}
