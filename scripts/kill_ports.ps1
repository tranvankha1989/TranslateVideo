# scripts/kill_ports.ps1
# Dọn dẹp an toàn toàn bộ tiến trình đang chiếm dụng cổng 8000, 5173, 5174

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
    } catch {
        # Bỏ qua lỗi
    }
}
