# scripts/kill_ports.ps1
# Dọn dẹp an toàn và triệt để toàn bộ tiến trình đang chiếm dụng cổng 8000, 5173, 5174

$ports = @(8000, 5173, 5174)
foreach ($port in $ports) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($conns) {
            $pids = $conns | Where-Object { $_.OwningProcess -gt 4 } | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($processId in $pids) {
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}

    # Dự phòng bằng netstat
    try {
        $lines = netstat -ano | Select-String ":$port\s+.*LISTENING\s+(\d+)"
        foreach ($line in $lines) {
            if ($line.Matches.Groups[1].Value) {
                $pidNum = [int]$line.Matches.Groups[1].Value
                if ($pidNum -gt 4) {
                    Stop-Process -Id $pidNum -Force -ErrorAction SilentlyContinue
                }
            }
        }
    } catch {}
}

# Dọn dẹp triệt để bất kỳ tiến trình uvicorn / python chạy ngầm cũ của self-tts
try {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*uvicorn*main:app*" -or
        ($_.Name -eq "python.exe" -and $_.CommandLine -like "*self-tts*backend*")
    } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
} catch {}

# Chờ 800ms để hệ thống giải phóng socket TCP khỏi TIME_WAIT và Mutex
Start-Sleep -Milliseconds 800

