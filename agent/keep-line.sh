#!/bin/zsh
# Keeps the Odyssey agent connected to the Chert FaceTime line (run it after `npm start`).
#
# - Runs `chert dev` and restarts it 20 s after it exits on its own (for example
#   when Chert answers line_offline right after a reconnect).
# - Every REFRESH_SECS (default 20 minutes) it reconnects, but only while no call
#   is in progress: after ~30 idle minutes Chert stops routing calls to the session,
#   and a fresh connection fixes that.
# - Reconnects at once if chert dev reports agent_not_warm for over 45 s.
# - Ctrl+C stops it for good and releases the line.
#
# Usage: zsh keep-line.sh            (from the agent folder, in its own terminal)
cd "${0:A:h}" || exit 1
[[ -s ~/.nvm/nvm.sh ]] && source ~/.nvm/nvm.sh >/dev/null 2>&1 && nvm use 24 >/dev/null 2>&1
AGENT=${AGENT:-Odyssey}
REFRESH_SECS=${REFRESH_SECS:-1200}
LOG=${CHERT_LOG:-$HOME/hackuta2026/chert-logs/dev.jsonl}
mkdir -p "${LOG:h}"

note() { print -r -- "{\"code\":\"keep_line\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"message\":\"$1\"}" | tee -a "$LOG"; }

# "call" while a call is in progress (started in the last 6 minutes, calls are capped
# at 5, and not ended), "not_warm" when chert dev has reported agent_not_warm for over
# 45 s (the waiting room was lost, e.g. after a network blip), otherwise "ok".
line_status() {
  python3 -I - "$LOG" <<'EOF'
import collections, datetime, json, sys
now = datetime.datetime.now(datetime.timezone.utc)
def at(d):
    try:
        return datetime.datetime.fromisoformat(d["at"].replace("Z", "+00:00"))
    except Exception:
        return now
live, not_warm_since = {}, None
for line in collections.deque(open(sys.argv[1], errors="ignore"), maxlen=3000):
    try:
        d = json.loads(line)
    except Exception:
        continue
    code, cid = d.get("code", ""), d.get("call_id")
    if cid:
        if code in ("call_ended", "call_declined"):
            live.pop(cid, None)
        elif code.startswith("call_"):
            live[cid] = at(d)
    if code == "agent_not_warm":
        not_warm_since = not_warm_since or at(d)
    elif code in ("agent_warm", "dev_ready", "dev_stopped"):
        not_warm_since = None
if any((now - t).total_seconds() < 360 for t in live.values()):
    print("call")
elif not_warm_since and (now - not_warm_since).total_seconds() > 45:
    print("not_warm")
else:
    print("ok")
EOF
}

stopping=0
pid=0
# SIGINT to chert dev (npm exec) and its node child, like Ctrl+C does, so it releases the line.
stop_dev() { (( pid > 0 )) && { kill -INT $pid 2>/dev/null; pkill -INT -P $pid 2>/dev/null; }; }
trap 'stopping=1; stop_dev' INT TERM

while (( ! stopping )); do
  npx @trychert/facetime@0.1.0-beta.21 dev --agent "$AGENT" --json > >(tee -i -a "$LOG") 2>&1 &
  pid=$!
  started=$SECONDS
  refreshed=0
  while kill -0 $pid 2>/dev/null && (( ! stopping )); do
    sleep 5
    st=$(line_status)
    if [[ $st == not_warm ]] || { (( SECONDS - started >= REFRESH_SECS )) && [[ $st == ok ]]; }; then
      if [[ $st == not_warm ]]; then
        note "Chert lost the waiting room (agent_not_warm); reconnecting."
      else
        note "Reconnecting the line to keep Chert routing calls (no call in progress)."
      fi
      refreshed=1
      stop_dev
      break
    fi
  done
  while kill -0 $pid 2>/dev/null; do sleep 1; done  # let chert dev release the line
  pid=0
  (( stopping )) && break
  if (( ! refreshed )); then
    note "chert dev exited; reconnecting in 20 s."
    sleep 20
  fi
done
note "Stopped. The line is released."
