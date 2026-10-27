#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1
echo "Open http://localhost:5500 in your browser. Press Ctrl+C to stop."
python3 -m http.server 5500
