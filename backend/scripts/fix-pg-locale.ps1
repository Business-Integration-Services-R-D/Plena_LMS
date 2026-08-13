# PostgreSQL 15 servisi, postgresql.conf içindeki eski Windows locale adları
# (Turkish_Turkey.1254) bu Windows sürümünde tanınmadığı için başlamıyor.
# Bu script conf'u yedekleyip locale değerlerini tr-TR'ye çevirir ve servisi başlatır.

$ErrorActionPreference = "Stop"
$conf = "C:\Program Files\PostgreSQL\15\data\postgresql.conf"
$log = Join-Path $env:TEMP "pgfix.log"

function Write-Log($msg) {
  $msg | Tee-Object -FilePath $log -Append
}

Remove-Item $log -ErrorAction SilentlyContinue

try {
  if (-not (Test-Path $conf)) { throw "postgresql.conf bulunamadi: $conf" }

  $backup = "$conf.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
  Copy-Item $conf $backup
  Write-Log "Yedek alindi: $backup"

  $content = Get-Content $conf -Raw
  foreach ($param in @("lc_messages", "lc_monetary", "lc_numeric", "lc_time")) {
    $pattern = "(?m)^\s*$param\s*=\s*'[^']*'"
    if ($content -match $pattern) {
      $content = [regex]::Replace($content, $pattern, "$param = 'tr-TR'")
      Write-Log "$param -> 'tr-TR'"
    }
  }
  Set-Content -Path $conf -Value $content -NoNewline
  Write-Log "postgresql.conf guncellendi"

  Start-Service postgresql-x64-15
  Start-Sleep -Seconds 4
  $svc = Get-Service postgresql-x64-15
  Write-Log "Servis durumu: $($svc.Status)"

  if ($svc.Status -ne "Running") { throw "Servis baslatilamadi" }
  Write-Log "OK"
}
catch {
  Write-Log "HATA: $($_.Exception.Message)"
  exit 1
}
