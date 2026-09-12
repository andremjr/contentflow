@echo off
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9333 --remote-debugging-address=127.0.0.1 --user-data-dir="C:\Users\andre\.contentflow\google-flow-chrome-profile" --load-extension="C:\Users\andre\AppData\Roaming\ContentFlow\data\browser-bridge" --no-first-run --no-default-browser-check --window-size=1280,800 "https://flow.google.com/"
