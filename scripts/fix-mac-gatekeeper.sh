#!/bin/bash
# Postrack — macOS Gatekeeper Workaround
# Run this after installing the app from the unsigned .dmg

APP="/Applications/Postrack.app"

if [ ! -d "$APP" ]; then
  echo "❌ Postrack not found at $APP"
  echo "   Please drag the app from the .dmg into Applications first."
  exit 1
fi

echo "🛠️  Removing quarantine attribute from $APP..."
xattr -cr "$APP"

echo "✅ Done! You can now open Postrack normally."
