@echo off
cd /d "%~dp0"
echo UMBC Stormwater GIS static site
 echo Open http://localhost:5500 in your browser.
echo Press Ctrl+C to stop the server.
py -3 -m http.server 5500
if errorlevel 1 (
  echo Python launcher unavailable. Trying python...
  python -m http.server 5500
)
pause
