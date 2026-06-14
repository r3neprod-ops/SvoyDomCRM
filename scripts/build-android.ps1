param(
  [ValidateSet("Debug", "Release")]
  [string]$BuildType = "Debug",

  [ValidateSet("Apk", "Bundle")]
  [string]$Artifact = "Apk"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$defaultToolchainRoot = Resolve-Path -Path (Join-Path $repoRoot "..\mobile-toolchain") -ErrorAction SilentlyContinue

if (-not $env:JAVA_HOME -and $defaultToolchainRoot) {
  $jdkPath = Join-Path $defaultToolchainRoot "jdk-21"
  if (Test-Path $jdkPath) {
    $env:JAVA_HOME = $jdkPath
  }
}

if (-not $env:ANDROID_HOME -and $defaultToolchainRoot) {
  $sdkPath = Join-Path $defaultToolchainRoot "android-sdk"
  if (Test-Path $sdkPath) {
    $env:ANDROID_HOME = $sdkPath
  }
}

if (-not $env:ANDROID_SDK_ROOT -and $env:ANDROID_HOME) {
  $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
}

if (-not $env:JAVA_HOME) {
  throw "JAVA_HOME is not set. Install JDK 17+ or use the local mobile-toolchain."
}

if (-not $env:ANDROID_HOME) {
  throw "ANDROID_HOME is not set. Install Android SDK or use the local mobile-toolchain."
}

$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:PATH"

Push-Location (Join-Path $repoRoot "android")
try {
  if ($Artifact -eq "Bundle") {
    if ($BuildType -ne "Release") {
      throw "Android App Bundle publishing artifacts must be built with -BuildType Release."
    }
    & .\gradlew bundleRelease
  } elseif ($BuildType -eq "Release") {
    & .\gradlew assembleRelease
  } else {
    & .\gradlew assembleDebug
  }
} finally {
  Pop-Location
}
