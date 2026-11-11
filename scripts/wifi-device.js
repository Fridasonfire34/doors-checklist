// `yarn wifi` — (re)connects the phone/tablet over wireless debugging and
// opens the app on it, without a USB cable or a new build:
//   1. finds devices with Wireless debugging on (adb mDNS) and connects them
//   2. forwards Metro (8081) and the tafco-main-doors-chk dev server (3000) to each one
//   3. opens Metro in its own window if it isn't running yet
//   4. installs the last debug APK if the app is missing, then launches it
// The device must have been paired once (Developer options > Wireless
// debugging > Pair device with pairing code, then `adb pair <ip:port>`).
// Windows only (Metro's window uses `start`).
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const PACKAGE = 'com.doorschecklist';
const PORTS = [8081, 3000];
const ROOT = path.join(__dirname, '..');
const APK = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' }).trim();

const connectedDevices = () =>
  adb('devices')
    .split('\n')
    .slice(1)
    .map(line => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === 'device')
    .map(([serial]) => serial);

const isUp = url =>
  new Promise(resolve => {
    const req = http.get(url, res => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  // 1. Wireless devices advertised on the network.
  const advertised = adb('mdns', 'services')
    .split('\n')
    .map(line => line.match(/_adb-tls-connect\._tcp\s+(\S+:\d+)/))
    .filter(Boolean)
    .map(match => match[1]);
  const already = connectedDevices();
  for (const address of advertised) {
    if (already.includes(address)) continue;
    console.log(`Connecting ${address}...`);
    console.log('  ' + adb('connect', address));
  }

  const devices = connectedDevices();

  // Plugged in / connected but waiting for "Allow USB debugging?" on the device.
  const unauthorized = adb('devices')
    .split('\n')
    .slice(1)
    .map(line => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === 'unauthorized')
    .map(([serial]) => serial);
  for (const serial of unauthorized) {
    console.warn(`${serial} is connected but not authorized: accept "Allow USB debugging?" on that device, then run \`yarn wifi\` again.`);
  }

  if (devices.length === 0) {
    console.error(
      '\nNo device found. On the phone/tablet: Settings > Developer options > Wireless debugging ON,' +
        '\nsame Wi-Fi as this PC. First time only: "Pair device with pairing code" and run' +
        '\n  adb pair <ip:port shown> <code>\nthen run `yarn wifi` again.',
    );
    process.exit(1);
  }

  // 2. localhost on the device -> this PC.
  for (const serial of devices) {
    for (const port of PORTS) adb('-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`);
    console.log(`Ports ${PORTS.join(', ')} forwarded to ${serial}`);
  }

  // 3. Metro.
  if (await isUp('http://localhost:8081/status')) {
    console.log('Metro is already running.');
  } else {
    console.log('Starting Metro in a new window...');
    spawn('cmd', ['/c', 'start', '"Metro - DoorsChecklist"', 'cmd', '/k', 'npx react-native start'], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      shell: true,
    }).unref();
    for (let i = 0; i < 30 && !(await isUp('http://localhost:8081/status')); i++) await sleep(2000);
  }

  if (!(await isUp('http://localhost:3000'))) {
    console.warn(
      '\nWARNING: the tafco-main-doors-chk server (port 3000) is not running; the app will say "No connection".' +
        '\n  Start it in another terminal:  cd ..\\tafco-main-doors-chk && yarn dev\n',
    );
  }

  // 4. Install if missing, then launch.
  for (const serial of devices) {
    const installed = adb('-s', serial, 'shell', 'pm', 'list', 'packages', PACKAGE).includes(PACKAGE);
    if (!installed) {
      if (!fs.existsSync(APK)) {
        console.error(`The app isn't installed on ${serial} and there's no APK yet. Run \`yarn android\` once.`);
        continue;
      }
      console.log(`Installing the app on ${serial}...`);
      adb('-s', serial, 'install', '-r', APK);
    }
    adb('-s', serial, 'shell', 'am', 'force-stop', PACKAGE);
    adb('-s', serial, 'shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
    console.log(`App opened on ${serial}`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
