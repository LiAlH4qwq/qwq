#!/usr/bin/env nu

# Measure per-process CPU time and system power for the qwq programs.
#
# Reports, once per interval:
#   * CPU% per matching process (from /proc/<pid>/stat utime+stime)
#   * RSS in MiB per matching process
#   * Intel RAPL package power (W) from /sys/class/powercap/intel-rapl:0/energy_uj
#   * battery discharge (W) from /sys/class/power_supply/BAT*/power_now
#
# Usage:
#   nu dev/measure.nu
#   nu dev/measure.nu --seconds 30 --interval 500 --program qwq-voice

def main [
  --seconds (-s): int = 10        # total sampling window, in seconds
  --interval (-i): int = 1000     # milliseconds between samples
  --program (-p): string = "qwq"  # process-name substring to watch
] {
  let rapl_path = "/sys/class/powercap/intel-rapl:0/energy_uj"
  let bat_paths = (glob "/sys/class/power_supply/BAT*/power_now")

  let read_int = {|path|
    if ($path | path exists) { (try { open $path | into int } catch { 0 }) } else { 0 }
  }

  let proc_of = {|pid|
    let raw = (try { open $"/proc/($pid)/stat" } catch { "" })
    if ($raw == "") {
      null
    } else {
      let fields = ($raw | split row ")" | last | str trim | split row " ")
      let utime = ($fields | get 11 | into int)
      let stime = ($fields | get 12 | into int)
      let rss = ($fields | get 21 | into int)
      { pid: $pid, ticks: ($utime + $stime), rss_kb: ($rss * 4) }
    }
  }

  let snapshot = {||
    let procs = (ps | where name =~ $program | get pid | each {|pid| do $proc_of $pid } | compact)
    {
      energy: (do $read_int $rapl_path),
      battery: (if ($bat_paths | is-empty) { 0 } else { $bat_paths | each {|path| do $read_int $path } | math sum }),
      procs: $procs,
    }
  }

  let hz = 100
  let dt = ($interval / 1000)
  let samples = (($seconds * 1000) / $interval | math floor | into int)

  mut previous = (do $snapshot)
  print -e $"sampling processes matching '($program)' for ($seconds)s every ($interval)ms"

  for step in 1..$samples {
    sleep ($interval * 1ms)
    let current = (do $snapshot)
    let rapl_w = (((($current.energy - $previous.energy) / 1_000_000) / $dt) | math round --precision 2)
    let battery_w = (($current.battery / 1_000_000) | math round --precision 2)
    let before = $previous
    let rows = ($current.procs | each {|proc|
      let prev = ($before.procs | where pid == $proc.pid | get -o 0)
      let prev_ticks = (if $prev == null { $proc.ticks } else { $prev.ticks })
      {
        pid: $proc.pid,
        cpu_pct: (((($proc.ticks - $prev_ticks) / $hz) / $dt) * 100 | math round --precision 2),
        rss_mib: (($proc.rss_kb / 1024) | math round --precision 1),
      }
    })
    print -e $"t=(($step * $dt))s rapl=($rapl_w)W battery=($battery_w)W"
    print ($rows | table)
    $previous = $current
  }
}
