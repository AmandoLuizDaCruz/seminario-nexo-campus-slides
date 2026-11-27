#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# NEXO CAMPUS CONTROLLER — ANDROID APK BUILDER (Zero-Gradle Fast SDK Pipeline)
# Compiles Java sources, bundles Web assets (index.html, projetor.html, SVGs),
# converts to DEX, aligns, and signs the installable NexoCampusController.apk
# ==============================================================================

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$PROJECT_ROOT/android-app"
BUILD_DIR="$APP_DIR/build"
SDK_ROOT="${ANDROID_SDK_ROOT:-/tmp/android-sdk}"
BUILD_TOOLS="$SDK_ROOT/build-tools/34.0.0"
PLATFORM_JAR="$SDK_ROOT/platforms/android-34/android.jar"

echo ">>> [1/6] Preparando diretórios e copiando arquivos web para assets/www/..."
rm -rf "$BUILD_DIR" "$APP_DIR/assets"
mkdir -p "$BUILD_DIR/gen" "$BUILD_DIR/classes" "$BUILD_DIR/dex" "$APP_DIR/assets/www/assets" "$APP_DIR/res/values"

cat > "$APP_DIR/res/values/strings.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Nexo Campus Controle</string>
</resources>
EOF

cp "$PROJECT_ROOT/index.html" "$APP_DIR/assets/www/"
cp "$PROJECT_ROOT/projetor.html" "$APP_DIR/assets/www/"
cp "$PROJECT_ROOT/styles.css" "$APP_DIR/assets/www/"
cp "$PROJECT_ROOT/shared-data.js" "$APP_DIR/assets/www/"
cp "$PROJECT_ROOT/app.js" "$APP_DIR/assets/www/"
cp "$PROJECT_ROOT/assets/"*.svg "$APP_DIR/assets/www/assets/"

echo ">>> [2/6] Compilando recursos Android com aapt2..."
"$BUILD_TOOLS/aapt2" compile --dir "$APP_DIR/res" -o "$BUILD_DIR/res.zip"
"$BUILD_TOOLS/aapt2" link \
    -o "$BUILD_DIR/unaligned.apk" \
    -I "$PLATFORM_JAR" \
    --manifest "$APP_DIR/AndroidManifest.xml" \
    -A "$APP_DIR/assets" \
    --java "$BUILD_DIR/gen" \
    "$BUILD_DIR/res.zip"

echo ">>> [3/6] Compilando código Java (MainActivity + LanPresentationServer) com javac 17..."
javac --release 11 \
    -cp "$PLATFORM_JAR" \
    -d "$BUILD_DIR/classes" \
    "$BUILD_DIR/gen/br/edu/nexocampus/controller/R.java" \
    "$APP_DIR/src/br/edu/nexocampus/controller/LanPresentationServer.java" \
    "$APP_DIR/src/br/edu/nexocampus/controller/MainActivity.java"

echo ">>> [4/6] Convertendo bytecode Java para Dalvik Executable (classes.dex) com d8..."
"$BUILD_TOOLS/d8" \
    --lib "$PLATFORM_JAR" \
    --min-api 23 \
    --output "$BUILD_DIR/dex" \
    "$BUILD_DIR/classes/br/edu/nexocampus/controller/"*.class

cd "$BUILD_DIR/dex"
zip -q -u "$BUILD_DIR/unaligned.apk" classes.dex
cd "$PROJECT_ROOT"

echo ">>> [5/6] Alinhando pacote APK com zipalign..."
"$BUILD_TOOLS/zipalign" -f -p 4 "$BUILD_DIR/unaligned.apk" "$BUILD_DIR/aligned.apk"

echo ">>> [6/6] Assinando NexoCampusController.apk com apksigner (V1 + V2 + V3)..."
KEYSTORE="$APP_DIR/debug.keystore"
if [ ! -f "$KEYSTORE" ]; then
    keytool -genkeypair \
        -alias androiddebugkey \
        -keypass android \
        -keystore "$KEYSTORE" \
        -storepass android \
        -dname "CN=Nexo Campus Grupo 3,O=Seminario,C=BR" \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 >/dev/null 2>&1
fi

"$BUILD_TOOLS/apksigner" sign \
    --ks "$KEYSTORE" \
    --ks-key-alias androiddebugkey \
    --ks-pass pass:android \
    --key-pass pass:android \
    --out "$PROJECT_ROOT/NexoCampusController.apk" \
    "$BUILD_DIR/aligned.apk"

"$BUILD_TOOLS/apksigner" verify --verbose "$PROJECT_ROOT/NexoCampusController.apk"
rm -rf "$BUILD_DIR" "$APP_DIR/assets"
echo "=================================================================="
echo "✓ APK GERADO E ASSINADO COM SUCESSO:"
ls -lh "$PROJECT_ROOT/NexoCampusController.apk"
echo "=================================================================="
