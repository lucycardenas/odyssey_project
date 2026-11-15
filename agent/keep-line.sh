#!/bin/zsh
# Keeps the Odyssey agent connected to the Chert FaceTime line (run it after `npm start`).
#
# - Runs `chert dev` and restarts it 20 s after it exits on its own (for example
#   when Chert answers line_offline right after a reconnect).
# - Every REFRESH_SECS (default 20 minutes) it reconnects, but only while no call
#   is in progress: after ~30 idle minutes Chert stops routing calls to the session,
#   and a fresh connection fixes that.
# - Ctrl+C stops it for good and releases the line.
#
# Usage: zsh keep-line.sh            (from the agent folder, in its own terminal)
setopt monitor  # background jobs get their own process group, so we can Ctrl-C chert dev alone

cd "${0:A:h}" || exit 1
[[ -s ~/.nvm/nvm.sh ]] && source ~/.nvm/nvm.sh >/dev/null 2>&1 && nvm use 24 >/dev/null 2>&1
AGENT=${AGENT:-Odyssey}
REFRESH_SECS=${REFRESH_SECS:-1200}
LOG=${CHERT_LOG:-$HOME/hackuta2026/chert-logs/dev.jsonl}
mkdir -p "${LOG:h}"

note() { print -r -- "{\"code\":\"keep_line\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"message\":\"$1\"}" | tee -a "$LOG"; }

# "yes" when a call started in the last 6 minutes (calls are capped at 5) and has not ended.
call_in_progress() {
  python3 -I - "$LOG" <<'EOF'
import json, sys, datetime
now = datetime.datetime.now(datetime.timezone.utc)
live = {}
for line in open(sys.argv[1], errors="ignore"):
    try:
        d = json.loads(line)
    except Exception:
        continue
    cid, code = d.get("call_id"), d.get("code", "")
    if not cid:
        continue
    if code in ("call_ended", "call_declined"):
        live.pop(cid, None)
    elif code.startswith("call_"):
        try:
            live[cid] = datetime.datetime.fromisoformat(d["at"].replace("Z", "+00:00"))
        except Exception:
            live[cid] = now
print("yes" if any((now - t).total_seconds() < 360 for t in live.values()) else "no")
EOF
}

stopping=0
trap 'stopping=1; kill -INT %1 2>/dev/null' INT TERM

while (( ! stopping )); do
  npx @trychert/facetime@0.1.0-beta.21 dev --agent "$AGENT" --json 2>&1 | tee -i -a "$LOG" &
  started=$SECONDS
  refreshed=0
  while jobs %1 >/dev/null 2>&1 && (( ! stopping )); do
    sleep 5
    if (( SECONDS - started >= REFRESH_SECS )) && [[ $(call_in_progress) == no ]]; then
      note "Reconnecting the line to keep Chert routing calls (no call in progress)."
      refreshed=1
      kill -INT %1 2>/dev/null
      break
    fi
  done
  wait 2>/dev/null
  (( stopping )) && break
  if (( ! refreshed )); then
    note "chert dev exited; reconnecting in 20 s."
    sleep 20
  fi
done
note "Stopped. The line is released."
