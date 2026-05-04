@echo off
cd /d %~dp0
if not exist node_modules (
    echo Instalando dependencias...
    pnpm install
)
echo Iniciando o servidor de desenvolvimento...
start "" pnpm run dev
timeout /t 10 /nobreak > nul
echo Abrindo navegador...
start http://localhost:3001
pause
