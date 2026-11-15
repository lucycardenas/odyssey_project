#!/bin/zsh
# One command to get Odyssey ready for a FaceTime demo on this Mac.
#
#   zsh ~/hackuta2026/odyssey_project/demo-start.sh
#
# 1. Stops any old agent / chert dev (a stale session can hold the line).
# 2. Checks .env.local (USB only: comments out GLASSES_TCP) and that Gemini answers.
# 3. Checks the glasses on USB: READY, one test buzz (ACK:S), sensor readings.
#    If the Arduino is frozen it re-flashes the sketch, then asks for a replug.
# 4. Runs chert doctor (shows trial minutes left; no call is made).
# 5. Starts the agent (logs: ~/hackuta2026/chert-logs/agent.log) and waits for it to register.
# 6. Runs keep-line.sh here and prints READY once Chert has the waiting room.
# Ctrl+C stops everything and releases the line.
#
# Options (env vars): SKIP_GLASSES=1  NO_BUZZ=1  SENSOR_SECS=6
emulate -L zsh
ROOT=${0:A:h}
AGENT_DIR=$ROOT/agent
LOGS=$HOME/hackuta2026/chert-logs
AGENT_LOG=$LOGS/agent.log
DEV_LOG=$LOGS/dev.jsonl
LINE="+1 650-444-4331"
CHERT=@trychert/facetime@0.1.0-beta.21
ARDUINO_CLI=$HOME/.local/bin/arduino-cli
mkdir -p "$LOGS"; touch "$AGENT_LOG" "$DEV_LOG"
cd "$AGENT_DIR" || { print "No agent folder at $AGENT_DIR"; exit 1; }

[[ -s ~/.nvm/nvm.sh ]] && source ~/.nvm/nvm.sh >/dev/null 2>&1 && nvm use 24 >/dev/null 2>&1
export PATH=$HOME/.nvm/versions/node/v24.22.3/bin:$PATH

ok()   { print -P "%F{green}✓%f $*"; }
warn() { print -P "%F{yellow}!%f $*"; }
bad()  { print -P "%F{red}✗%f $*"; }
step() { print -P "\n%B== $* ==%b"; }
ask()  { local a; read "a?$1 [y/N] "; [[ $a == [yY]* ]]; }

# ---------------------------------------------------------------- 0. checkout
step "Checkout"
branch=$(git -C "$ROOT" branch --show-current 2>/dev/null)
[[ -f agent.mjs && -f keep-line.sh && -f glasses.mjs ]] || { bad "agent files missing (branch: $branch)"; exit 1; }
[[ $branch == claude/project-thread-0n2nke ]] && ok "branch $branch" || warn "on branch '$branch' (expected claude/project-thread-0n2nke); continuing"
[[ $(node -v) == v2[46]* ]] && ok "node $(node -v)" || { bad "need Node 24, have $(node -v)"; exit 1; }

# ---------------------------------------------------------------- 1. stop old
step "Stopping any old agent / Chert session"
wait_gone() { # pattern seconds
  local i; for (( i = 0; i < $2; i++ )); do pgrep -f "$1" >/dev/null || return 0; sleep 1; done; return 1
}
if pgrep -f "keep-line.sh" >/dev/null; then
  pkill -TERM -f "keep-line.sh"; wait_gone "keep-line.sh" 25 && ok "stopped old keep-line.sh" || warn "keep-line.sh still running"
fi
if pgrep -f "facetime@.* dev|bin/chert dev" >/dev/null; then
  pkill -INT -f "bin/chert dev"; pkill -INT -f "facetime@.* dev"   # never SIGKILL: that keeps the line held
  wait_gone "facetime@.* dev|bin/chert dev" 25 && ok "stopped old chert dev (line released)" || { bad "chert dev won't stop; stop it in its terminal with Ctrl+C"; exit 1; }
fi
if pgrep -f "agent.mjs start|odyssey_project/agent/agent.mjs" >/dev/null; then
  pkill -INT -f "agent.mjs start"; wait_gone "agent.mjs start" 10 || pkill -TERM -f "agent.mjs start"
  wait_gone "agent.mjs start" 10
  pkill -TERM -f "job_proc_lazy_main.js .*odyssey_project/agent/agent.mjs"
  wait_gone "odyssey_project/agent/agent.mjs" 10 && ok "stopped old agent" || warn "an old agent process is still running"
fi
ok "nothing else holds the line or the serial port"

# ---------------------------------------------------------------- 2. env + Gemini
step "Config and Gemini"
for k in LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET GOOGLE_API_KEY AGENT_NAME; do
  grep -qE "^$k=.+" .env.local || { bad ".env.local: $k is empty"; exit 1; }
done
ok ".env.local has LiveKit, Gemini and AGENT_NAME"
if grep -qE '^GLASSES_TCP=' .env.local; then
  sed -i '' -E 's/^GLASSES_TCP=/# GLASSES_TCP=/' .env.local && ok "commented out GLASSES_TCP (USB only)"
else
  ok "USB only (no GLASSES_TCP)"
fi
gkey=$(grep -E '^GOOGLE_API_KEY=' .env.local | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
models=$(curl -s -m 15 -H "x-goog-api-key: $gkey" "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000")
unset gkey
if print -r -- "$models" | grep -q '"models/'; then
  ok "Gemini API reachable"
  for m in gemini-2.5-flash-native-audio-preview-12-2025 gemini-3.5-flash-lite; do
    print -r -- "$models" | grep -q "\"models/$m\"" && ok "  model $m available" || warn "  model $m not listed"
  done
else
  bad "Gemini API did not answer: $(print -r -- "$models" | grep -m1 -o '"message": *"[^"]*"' || print 'no network?')"
  ask "Continue anyway?" || exit 1
fi

# ---------------------------------------------------------------- 3. glasses
step "Glasses (USB)"
flash() {
  local port=$(ls /dev/cu.usbmodem* 2>/dev/null | head -1)
  [[ -n $port && -x $ARDUINO_CLI ]] || return 1
  print "  re-flashing the sketch to $port (about 20 s)..."
  "$ARDUINO_CLI" compile -u -p "$port" --fqbn arduino:avr:uno "$ROOT/hardware/odyssey_glasses" >/dev/null 2>&1
}
wait_port() {
  local i; for (( i = 0; i < 60; i++ )); do ls /dev/cu.usbmodem* >/dev/null 2>&1 && return 0; sleep 1; done; return 1
}
glasses_ok=0
if [[ -n $SKIP_GLASSES ]]; then
  warn "skipped (SKIP_GLASSES set)"
else
  if ! ls /dev/cu.usbmodem* >/dev/null 2>&1; then
    warn "no Arduino on USB. Plug the glasses into the LAPTOP's USB (not a power bank or 9V)... waiting 60 s"
    wait_port || bad "still no Arduino"
  fi
  pf=(node preflight-glasses.mjs ${SENSOR_SECS:-6}); [[ -n $NO_BUZZ ]] && pf+=(--no-buzz)
  for attempt in 1 2 3; do
    ls /dev/cu.usbmodem* >/dev/null 2>&1 || break
    $pf; rc=$?
    (( rc == 0 )) && { glasses_ok=1; break; }
    if (( attempt == 1 )); then
      warn "glasses check failed (code $rc): re-flashing"
      flash && ok "re-flashed" || warn "re-flash failed"
    elif (( attempt == 2 )); then
      warn "still failing: unplug the USB cable, wait 3 s, plug it back in (press Enter when done)"
      read -r; sleep 2
    fi
  done
  if (( glasses_ok )); then
    ok "glasses ready"
    (( rc == 0 )) && [[ -z $NO_BUZZ ]] && { ask "Did the motor spin?" || warn "Motor not spinning: check the transistor wires and that it is on laptop USB power."; }
  else
    bad "glasses not working"
    ask "Start the agent without the glasses?" || exit 1
  fi
fi

# ---------------------------------------------------------------- 4. chert doctor
step "Chert"
npx -y $CHERT doctor --agent Odyssey --json 2>/dev/null | python3 -I -c '
import json, sys
for line in sys.stdin:
    try: d = json.loads(line)
    except Exception: continue
    for c in d.get("checks", []):
        n, s = c.get("name"), c.get("status")
        # session shows the account email; model warns about OpenAI (we use Gemini); agent is not started yet
        if n in ("session", "model", "agent"): continue
        if n == "minutes" or s != "pass":
            mark = "\033[32m✓\033[0m" if s == "pass" else "\033[33m!\033[0m"
            print((mark + " " + n + ": " + c.get("detail", "") + " " + c.get("action", "")).rstrip())
' || warn "chert doctor did not run"
ok "Chert checked (each call costs FaceTime minutes, max 5 per call)"

# ---------------------------------------------------------------- 5. agent
step "Starting the agent"
cleanup() {
  trap - INT TERM EXIT
  [[ -n $watch ]] && kill $watch 2>/dev/null
  if [[ -n $apid ]] && kill -0 $apid 2>/dev/null; then
    print "\nStopping the agent..."
    pkill -TERM -f "agent.mjs start"; sleep 2
    pkill -TERM -f "job_proc_lazy_main.js .*odyssey_project/agent/agent.mjs"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM
from=$(( $(wc -l < "$AGENT_LOG") + 1 ))
npm start >> "$AGENT_LOG" 2>&1 &
apid=$!
for (( i = 0; i < 40; i++ )); do
  tail -n +$from "$AGENT_LOG" | grep -q '"msg":"registered worker"' && break
  kill -0 $apid 2>/dev/null || break
  sleep 1
done
if tail -n +$from "$AGENT_LOG" | grep -q '"msg":"registered worker"'; then
  ok "agent registered with LiveKit as Odyssey (logs: $AGENT_LOG)"
else
  bad "agent did not register in 40 s. Last log lines:"; tail -n +$from "$AGENT_LOG" | tail -5 | cut -c1-300; exit 1
fi

# ---------------------------------------------------------------- 6. line
step "Connecting the FaceTime line (keep this window open)"
dfrom=$(( $(wc -l < "$DEV_LOG") + 1 ))
( for (( i = 0; i < 180; i++ )); do
    sleep 1
    if tail -n +$dfrom "$DEV_LOG" | grep -q '"code":"agent_warm"'; then
      print -P "\n%F{green}%B==============================================\n  READY: FaceTime (video) $LINE\n  Glasses: $( (( glasses_ok )) && print connected || print 'NOT connected')\n  Ctrl+C here stops everything.\n==============================================%b%f\n"
      exit 0
    fi
    tail -n +$dfrom "$DEV_LOG" | grep -qE '"code":"(line_in_use|line_offline|line_paused|trial_line_released)"' && (( i % 20 == 19 )) && \
      print -P "%F{yellow}! Chert: $(tail -n +$dfrom "$DEV_LOG" | grep -oE '"code":"line_[a-z_]+"' | tail -1). keep-line retries every 20 s; line_offline usually clears within ~1-2 min.%f"
  done
  print -P "%F{red}✗ no agent_warm after 3 minutes; check the output above.%f" ) &
watch=$!
zsh keep-line.sh
