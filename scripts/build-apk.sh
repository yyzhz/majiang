#!/usr/bin/env bash
# 构建 Android debug APK。需要 JDK 17+ 与 Android SDK（API 34 / build-tools 34.0.0）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 自动探测 JDK 17（Homebrew / Temurin 常见位置），避免在 macOS 上命中 /usr/bin/java 存根
for JDK_HOME in \
  /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
  /usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
  /Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home; do
  if [ -x "$JDK_HOME/bin/java" ]; then
    export JAVA_HOME="$JDK_HOME"
    export PATH="$JAVA_HOME/bin:$PATH"
    break
  fi
done

if ! java -version >/dev/null 2>&1; then
  echo "❌ 未检测到可用的 JDK（macOS 的 /usr/bin/java 存根不算）。请先安装 JDK 17："
  echo "   brew install openjdk@17"
  exit 1
fi

# 自动探测 Android SDK
if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk/platforms" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
fi

SDK_OK=0
[ -n "${ANDROID_HOME:-}" ] && [ -d "${ANDROID_HOME}/platforms" ] && SDK_OK=1
[ -n "${ANDROID_SDK_ROOT:-}" ] && [ -d "${ANDROID_SDK_ROOT}/platforms" ] && SDK_OK=1
[ -f android/local.properties ] && SDK_OK=1
if [ "$SDK_OK" -ne 1 ]; then
  echo "❌ 未检测到 Android SDK。请安装 Android Studio（或 cmdline-tools）后执行："
  echo "   sdkmanager \"platforms;android-34\" \"build-tools;34.0.0\" \"platform-tools\""
  echo "   然后设置 ANDROID_HOME，或在 android/local.properties 写入 sdk.dir=/你的/sdk 路径"
  exit 1
fi

cd android
chmod +x ./gradlew
./gradlew assembleDebug --no-daemon

APK="app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK" ]; then
  echo "❌ 构建结束但未找到 APK：$APK"
  exit 1
fi

mkdir -p "$ROOT/dist"
cp "$APK" "$ROOT/dist/hongzhong-mahjong-debug.apk"
echo "✅ APK 已生成：$ROOT/dist/hongzhong-mahjong-debug.apk"
