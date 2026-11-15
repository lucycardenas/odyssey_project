#!/bin/zsh
# Pairs the glasses' HC-05 Bluetooth module with this Mac from Terminal, for when
# System Settings > Bluetooth refuses it. Needs blueutil (~/.local/bin/blueutil).
# Run it in the Terminal app (it asks for Bluetooth access the first time):
#   zsh ~/hackuta2026/odyssey_project/hardware/pair-hc05.sh
B=${BLUEUTIL:-$HOME/.local/bin/blueutil}
[[ -x $B ]] || B=$(command -v blueutil)
[[ -x $B ]] || { echo "blueutil is not installed."; exit 1; }

echo "Scanning for the HC-05 for 10 seconds (its red light should be blinking fast)..."
line=$("$B" --inquiry 10 | grep -i 'name: "HC-05"' | head -1)
addr=$(print -r -- "$line" | grep -o -E '([0-9a-fA-F]{2}[-:]){5}[0-9a-fA-F]{2}' | head -1)
if [[ -z $addr ]]; then
  echo "HC-05 not found. Make sure the Arduino is powered and the HC-05 light blinks fast, then run this again."
  exit 1
fi
echo "Found HC-05 at $addr"

"$B" --unpair "$addr" >/dev/null 2>&1   # clear any half-finished pairing
for pin in 1234 0000; do
  echo "Pairing with PIN $pin..."
  if "$B" --pair "$addr" "$pin"; then
    echo "Paired with PIN $pin."
    "$B" --info "$addr"
    exit 0
  fi
done
echo "Pairing failed with both 1234 and 0000."
exit 1
