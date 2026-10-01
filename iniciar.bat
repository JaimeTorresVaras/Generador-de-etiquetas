@echo off
REM Inicia el generador de etiquetas y abre el navegador.
cd /d "%~dp0"
set PY=python
where py >nul 2>nul && set PY=py
%PY% -c "import win32print" 2>nul || %PY% -m pip install --user -r requirements.txt
%PY% servidor.py %*
pause
