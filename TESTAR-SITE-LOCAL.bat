@echo off
setlocal
cd /d "%~dp0"
title RealPonto - Teste local

if not exist "%~dp0index.html" goto SEM_SITE
if not exist "%~dp0servidor-local.py" goto SEM_SCRIPT

where py >nul 2>&1
if errorlevel 1 goto TENTAR_PYTHON
py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if errorlevel 1 goto TENTAR_PYTHON
py -3 -B "%~dp0servidor-local.py" --open-browser
if errorlevel 1 pause
exit /b

:TENTAR_PYTHON
where python >nul 2>&1
if errorlevel 1 goto SEM_PYTHON
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if errorlevel 1 goto SEM_PYTHON
python -B "%~dp0servidor-local.py" --open-browser
if errorlevel 1 pause
exit /b

:SEM_PYTHON
echo.
echo Python 3.10 ou superior nao foi encontrado.
echo Instale uma versao atual do Python 3 pelo site oficial:
echo https://www.python.org/downloads/windows/
echo Depois abra este iniciador novamente. Nao precisa instalar pacotes com pip.
echo.
pause
exit /b 1

:SEM_SITE
echo.
echo Copie este BAT e servidor-local.py para a pasta que contem index.html.
echo Nao execute dentro do ZIP ou da pasta externa do pacote.
echo.
pause
exit /b 1

:SEM_SCRIPT
echo.
echo Falta servidor-local.py. Copie os DOIS arquivos do pacote juntos.
echo.
pause
exit /b 1
