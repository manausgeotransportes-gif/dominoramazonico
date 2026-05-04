Start-Process powershell -ArgumentList '-NoExit','-Command','cd "'+$PSScriptRoot+'"; pnpm run dev'
Start-Sleep -Seconds 10
Start-Process 'http://localhost:3001'