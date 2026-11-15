Odyssey glasses - Bluetooth bridge (Windows)
============================================

The Mac running Odyssey cannot pair the glasses' HC-05 Bluetooth module.
This laptop pairs it instead and passes the messages to the Mac over the network.

1. Make sure the Arduino on the glasses is powered (the HC-05 red light blinks).
2. Pair the HC-05: Settings > Bluetooth & devices > Add device > Bluetooth >
   HC-05. PIN: 1234 (or 0000).
3. Connect this laptop and the Mac to the SAME network. A phone hotspot works
   best, because hackathon Wi-Fi often blocks laptops from reaching each other.
4. Unzip this folder (right-click > Extract All), then double-click
   start-bridge.bat.
   - If Windows says "Windows protected your PC": More info > Run anyway.
   - If Windows Firewall asks about PowerShell: tick BOTH Private and Public
     networks, then Allow access.
5. Wait for "Glasses found on COMx" and "Ready". The window shows a line like
       GLASSES_TCP=192.168.1.23:7777
   Send that line to the person running the Mac.
6. Keep the window open during the demo. "Mac connected" appears during each
   FaceTime call. Close the window to stop.
