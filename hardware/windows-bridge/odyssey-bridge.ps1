# Odyssey glasses: Bluetooth bridge for a Windows laptop.
#
# macOS cannot pair the glasses' HC-05 Bluetooth module, but Windows can. This
# script holds the Bluetooth link on this laptop and passes the glasses' messages
# to and from the Odyssey agent on the Mac over the network (TCP port 7777).
#
# 1. Pair the HC-05 in Settings > Bluetooth & devices > Add device (PIN 1234).
# 2. Double-click start-bridge.bat (it runs this script).
# 3. If Windows Firewall asks, tick Private AND Public networks, then Allow access.
# 4. Send the GLASSES_TCP=... line it prints to the person running the Mac.
# Both laptops must be on the same network (a phone hotspot works best).
# Keep this window open during the demo; close it to stop.
param(
  [string]$Port = "",    # e.g. -Port COM5 to skip the search
  [int]$TcpPort = 7777
)

function Get-CandidatePorts {
  # Bluetooth COM ports first, then any other COM port.
  $bt = @()
  try {
    $bt = @(Get-CimInstance Win32_PnPEntity -ErrorAction Stop |
      Where-Object { $_.Name -match 'Bluetooth' -and $_.Name -match '\(COM\d+\)' } |
      ForEach-Object { [regex]::Match($_.Name, 'COM\d+').Value })
  } catch {}
  $all = @([System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object -Unique)
  return @(@($bt) + @($all | Where-Object { $bt -notcontains $_ }) | Select-Object -Unique)
}

function Open-Glasses([string]$name) {
  # Opens one COM port and asks "?" until the glasses answer READY (up to 8 s).
  $sp = New-Object System.IO.Ports.SerialPort $name, 9600
  $sp.ReadTimeout = 200
  $sp.WriteTimeout = 3000
  $sp.Open()
  $deadline = (Get-Date).AddSeconds(8)
  $seen = ""
  while ((Get-Date) -lt $deadline) {
    try { $sp.Write("?") } catch {}
    Start-Sleep -Milliseconds 800
    try { $seen += $sp.ReadExisting() } catch {}
    if ($seen -match "READY") { return $sp }
  }
  try { $sp.Close() } catch {}
  return $null
}

function Find-Glasses {
  if ($Port) { $names = @($Port) } else { $names = Get-CandidatePorts }
  foreach ($name in $names) {
    Write-Host "  Trying $name ..."
    try {
      $found = Open-Glasses $name
      if ($found) { Write-Host "  Glasses found on $name" -ForegroundColor Green; return $found }
    } catch { Write-Host "  $($name): $($_.Exception.Message)" }
  }
  return $null
}

$listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Any), $TcpPort
$listener.Start()

$ips = @()
try {
  $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
    Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
    ForEach-Object { $_.IPAddress })
} catch {
  $ips = @([System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
    Where-Object { $_.AddressFamily -eq 'InterNetwork' } | ForEach-Object { $_.ToString() })
}
Write-Host ""
Write-Host "Odyssey Bluetooth bridge is listening on port $TcpPort." -ForegroundColor Cyan
Write-Host "Send this line to the person running the Mac (use the one on the shared network):" -ForegroundColor Cyan
foreach ($ip in $ips) { Write-Host "   GLASSES_TCP=$($ip):$TcpPort" -ForegroundColor Yellow }
Write-Host ""

$sp = $null
$buf = New-Object byte[] 256
while ($true) {
  if (-not $sp -or -not $sp.IsOpen) {
    Write-Host "Looking for the glasses (HC-05)..."
    $sp = Find-Glasses
    if (-not $sp) {
      Write-Host "Glasses not found. Is the HC-05 paired, and is the Arduino powered? Retrying in 5 s."
      Start-Sleep -Seconds 5
      continue
    }
    Write-Host "Ready. Waiting for the Mac to connect..."
  }

  if (-not $listener.Pending()) {
    # Nobody connected: drop old messages so they do not pile up.
    try { [void]$sp.ReadExisting() } catch { Write-Host "Bluetooth link lost."; $sp = $null }
    Start-Sleep -Milliseconds 100
    continue
  }

  $client = $listener.AcceptTcpClient()
  $client.NoDelay = $true
  $stream = $client.GetStream()
  Write-Host "Mac connected ($($client.Client.RemoteEndPoint))." -ForegroundColor Green
  try {
    while ($true) {
      try { $fromGlasses = $sp.ReadExisting() }
      catch { Write-Host "Bluetooth link lost."; try { $sp.Close() } catch {}; $sp = $null; break }
      if ($fromGlasses.Length -gt 0) {
        $bytes = [System.Text.Encoding]::ASCII.GetBytes($fromGlasses)
        $stream.Write($bytes, 0, $bytes.Length)
      }
      if ($stream.DataAvailable) {
        $n = $stream.Read($buf, 0, $buf.Length)
        if ($n -le 0) { break }
        try { $sp.Write($buf, 0, $n) }
        catch { Write-Host "Bluetooth link lost."; try { $sp.Close() } catch {}; $sp = $null; break }
      } elseif ($client.Client.Poll(0, [System.Net.Sockets.SelectMode]::SelectRead)) {
        break  # readable but no data: the Mac closed the connection
      }
      Start-Sleep -Milliseconds 10
    }
  } catch {
    Write-Host "Connection problem: $($_.Exception.Message)"
  }
  try { $client.Close() } catch {}
  Write-Host "Mac disconnected. Waiting for the next call..."
}
