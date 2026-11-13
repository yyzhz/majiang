# 构建 Android debug APK（Windows / PowerShell 版）
# 依赖：JDK 17、Android SDK（platforms;android-34 + build-tools;34.0.0）、Gradle 8.2.x
# 用法：powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 1) 探测 JDK 17（环境变量 -> ~/.jdk/temurin -> Android Studio 自带 JBR）
if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
    $candidates = @()
    $candidates += Get-ChildItem "$env:USERPROFILE\.jdk" -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'jdk*' } | ForEach-Object { $_.FullName }
    $candidates += 'C:\Program Files\Android\Android Studio\jbr'
    $candidates += Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { $_.FullName }
    foreach ($c in $candidates) {
        if (Test-Path "$c\bin\java.exe") { $env:JAVA_HOME = $c; break }
    }
}
if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
    throw '未检测到 JDK 17：请安装 JDK 17 并设置 JAVA_HOME。'
}
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

# 2) 探测 Android SDK（环境变量 -> android/local.properties -> ~/android-sdk）
if (-not $env:ANDROID_HOME -or -not (Test-Path "$env:ANDROID_HOME\platforms")) {
    $localProps = Join-Path $root 'android\local.properties'
    $sdkDir = $null
    if (Test-Path $localProps) {
        $line = Select-String -Path $localProps -Pattern '^\s*sdk\.dir\s*=' | Select-Object -First 1
        if ($line) { $sdkDir = ($line.Line -replace '^\s*sdk\.dir\s*=\s*', '').Trim() -replace '\\:', ':' -replace '\\', '/' }
    }
    if (-not $sdkDir -or -not (Test-Path "$sdkDir\platforms")) {
        if (Test-Path "$env:USERPROFILE\android-sdk\platforms") { $sdkDir = "$env:USERPROFILE\android-sdk" }
    }
    if ($sdkDir) {
        $env:ANDROID_HOME = $sdkDir
        $env:ANDROID_SDK_ROOT = $sdkDir
    } else {
        throw '未检测到 Android SDK：请安装 platforms;android-34 与 build-tools;34.0.0，或写入 android/local.properties 的 sdk.dir。'
    }
}

# 3) 同步 web 资源到 android/app/src/main/assets/public
node scripts/build-web.mjs
& npx --no-install cap sync android
if ($LASTEXITCODE -ne 0) { throw 'cap sync 失败' }

# 4) 构建：优先本地解压的 Gradle（避免 wrapper 访问 services.gradle.org 超时），否则用 gradlew
Set-Location (Join-Path $root 'android')
$localGradle = "$env:USERPROFILE\.gradle-tools\gradle-8.2.1\bin\gradle.bat"
if (Test-Path $localGradle) {
    & $localGradle assembleDebug --no-daemon --console=plain
} else {
    & .\gradlew.bat assembleDebug --no-daemon --console=plain
}
if ($LASTEXITCODE -ne 0) { throw 'Gradle 构建失败' }

# 5) 输出 APK 到 dist/
$apk = Join-Path (Get-Location) 'app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $apk)) { throw "未找到 APK：$apk" }
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
Copy-Item $apk (Join-Path $dist 'hongzhong-mahjong-debug.apk') -Force
Write-Host "APK 已生成：$(Join-Path $dist 'hongzhong-mahjong-debug.apk')"
