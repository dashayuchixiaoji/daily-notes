@echo off
cd /d "%~dp0"

python -c "import sys;sys.exit(0 if sys.version_info[0]==3 else 1)" >nul 2>nul
if errorlevel 1 goto nopython

python "tools\serve.py" %*
goto end

:nopython
echo.
echo   Python 3 was not found on this computer.
echo   The notebook will be opened as a plain file instead.
echo   In that mode some browsers do not save your notes.
echo   Tip: install Python 3, then run this launcher again.
echo.
start "" "index.html"
echo   Press any key to close this window...
pause >nul

:end