// Forwards the dev PC's ports to every connected Android device over USB
// (and to emulators), so debug builds reach Metro (8081) and the tafco-main
// dev server (3000) as `localhost`, whatever Wi-Fi the phone is on.
// Run automatically by `yarn android`; run `yarn reverse` by hand after
// plugging a phone back in.
const { execFileSync } = require('child_process');

const PORTS = [8081, 3000];

const devices = execFileSync('adb', ['devices'], { encoding: 'utf8' })
  .split('\n')
  .slice(1)
  .map(line => line.trim().split(/\s+/))
  .filter(([serial, state]) => serial && state === 'device')
  .map(([serial]) => serial);

if (devices.length === 0) {
  console.log('adb-reverse: no authorized devices connected.');
}

for (const serial of devices) {
  for (const port of PORTS) {
    execFileSync('adb', ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
  }
  console.log(`adb-reverse: ${serial} -> ports ${PORTS.join(', ')}`);
}
