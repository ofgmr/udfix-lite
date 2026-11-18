#!/usr/bin/env bash
# Download the official Linux UYAP Document Editor and extract it under a prefix.
# Does not install the deb, run postinst, or install the bundled printer packages.
# The zip is not committed. The download page publishes no checksum or signature.
set -euo pipefail

PAGE_URL="https://uyap.gov.tr/UYAP-Editor"
ZIP_URL="https://rayp.adalet.gov.tr/resimler/2/dosya/uyapeditor_5.4.20_amd64.zip"
# sha256 of the zip retrieved on 2026-11-08. The publisher did not publish this value.
OBSERVED_SHA256="5a31393af180723c8dff1e88e58c34ba5a5f85e43c197d0e05048de3b96a059f"

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "official editor: this package is amd64 Linux. uname=$(uname -s) $(uname -m)" >&2
  exit 1
fi

prefix="${1:-/tmp/uyap-editor-root}"
cache="${UYAP_EDITOR_CACHE:-/tmp/uyap-editor-install}"
mkdir -p "$cache"
zip="$cache/uyapeditor_5.4.20_amd64.zip"

if [[ ! -f "$zip" ]]; then
  echo "official editor: GET $ZIP_URL"
  curl -fL --retry 3 --retry-delay 2 -o "$zip.partial" "$ZIP_URL"
  mv "$zip.partial" "$zip"
fi

actual="$(sha256sum "$zip" | awk '{print $1}')"
echo "official editor: page $PAGE_URL"
echo "official editor: zip $ZIP_URL"
echo "official editor: sha256 $actual"
if [[ "$actual" != "$OBSERVED_SHA256" ]]; then
  echo "official editor: sha256 differs from the 2026-11-08 observation. The page publishes no checksum; refusing to extract an unexpected file." >&2
  exit 1
fi

deb="$cache/uyapeditor_5.4.20_amd64.deb"
if [[ ! -f "$deb" ]]; then
  unzip -o -j "$zip" "uyapeditor_5.4.20_amd64.deb" -d "$cache"
fi

rm -rf "$prefix"
mkdir -p "$prefix"
dpkg-deb -x "$deb" "$prefix"

echo "official editor: extracted to $prefix"
echo "official editor: package version from control:"
dpkg-deb -f "$deb" Package Version Architecture
echo "official editor: do not run the deb postinst. It only links libpcsclite for e-signature."
echo "official editor: cups-bsd packages in the zip are for printing and are not installed by this script."
echo "official editor: the app dialog requires Java 6 through 14. Use OpenJDK 11 by full path. Java 21 is rejected."
echo "official editor: launch example:"
echo "  /usr/lib/jvm/java-11-openjdk-amd64/bin/java -Duser.home=/tmp/uyap-editor-home -Xmx200m -cp \"$prefix/usr/share/UYAPEditor/.:$prefix/usr/share/UYAPEditor/*\" tr.com.havelsan.uyap.system.editor.common.WPAppManager getNewWPInstance EDITOR_TYPE_DOCUMENT /path/to/file.udf"
