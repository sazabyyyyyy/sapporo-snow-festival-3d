/**
 * Headless Chrome touch simulation against the local plateau preview.
 * Requires: npm run build && node serve.mjs (port 4173)
 * Run: node scripts/gesture-browser-check.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
// Prefer repo-local or /tmp playwright-core
let chromium;
try {
  ({ chromium } = require('/tmp/node_modules/playwright-core'));
} catch {
  ({ chromium } = require('playwright-core'));
}

const BASE = process.env.GESTURE_CHECK_URL || 'http://127.0.0.1:4173/plateau.html?debugGestures=1';
const OUT = path.join('/opt/cursor/artifacts', 'gesture-browser-check');
fs.mkdirSync(OUT, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function snap(page) {
  return page.evaluate(() => {
    const d = window.__mapGestureDebug;
    if (!d) return null;
    d.controls.update();
    return d.snapshot();
  });
}

async function main() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--use-gl=angle', '--ignore-gpu-blocklist'],
  });

  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
    isMobile: true,
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('plateau-tutorial-v3-done', '1');
    } catch {
      /* ignore */
    }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  // Wait for controls debug hook + canvas
  await page.waitForFunction(() => !!window.__mapGestureDebug, null, { timeout: 45000 });
  await sleep(2500);

  const before = await snap(page);
  if (!before) throw new Error('debug hook missing');
  await page.screenshot({ path: path.join(OUT, '01-loaded.png'), fullPage: false });

  const canvas = await page.$('canvas');
  if (!canvas) throw new Error('no canvas');
  const box = await canvas.boundingBox();

  // --- One-finger pan (touch) ---
  const panStart = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };
  const panEnd = { x: panStart.x + 160, y: panStart.y + 40 };
  await page.touchscreen.tap(panStart.x, panStart.y);
  // Playwright touchscreen has no drag API in all versions — use CDP touches
  const client = await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: panStart.x, y: panStart.y, id: 0 }],
  });
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: panStart.x + (panEnd.x - panStart.x) * t,
        y: panStart.y + (panEnd.y - panStart.y) * t,
        id: 0,
      }],
    });
    await sleep(16);
  }
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  // Let damping settle partially
  await sleep(400);
  const afterPan = await snap(page);
  await page.screenshot({ path: path.join(OUT, '02-after-pan.png'), fullPage: false });

  const panDist = Math.hypot(
    afterPan.target[0] - before.target[0],
    afterPan.target[2] - before.target[2],
  );

  // --- Two-finger pinch (mostly scale, tiny twist noise) ---
  const midX = box.x + box.width * 0.5;
  const midY = box.y + box.height * 0.45;
  await page.evaluate(() => window.__mapGestureDebug?.resetRotateAccum?.());
  const beforePinch = await snap(page);

  const emitPinchFrame = async (spread, twistDeg) => {
    const rad = (twistDeg * Math.PI) / 180;
    const dx = Math.cos(rad) * spread;
    const dy = Math.sin(rad) * spread;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: midX - dx, y: midY - dy, id: 0 },
        { x: midX + dx, y: midY + dy, id: 1 },
      ],
    });
  };

  // Start two fingers close
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: midX - 40, y: midY, id: 0 },
      { x: midX + 40, y: midY, id: 1 },
    ],
  });
  await sleep(30);
  // Pinch out with only ~5° total twist noise across frames
  for (let i = 1; i <= 16; i++) {
    const spread = 40 + i * 8;
    const twist = (i / 16) * 5;
    await emitPinchFrame(spread, twist);
    await sleep(20);
  }
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await sleep(500);
  const afterPinch = await snap(page);
  await page.screenshot({ path: path.join(OUT, '03-after-pinch.png'), fullPage: false });

  const radiusDelta = afterPinch.radius - beforePinch.radius;
  const thetaDeltaDeg = (Math.abs(afterPinch.theta - beforePinch.theta) * 180) / Math.PI;
  const rotateAppliedDeg = (Math.abs(afterPinch.rotateAppliedRad || 0) * 180) / Math.PI;

  const report = {
    panTargetTravel: panDist,
    pinchRadiusDelta: radiusDelta,
    pinchThetaDeltaDeg: thetaDeltaDeg,
    pinchRotateAppliedDeg: rotateAppliedDeg,
    consoleErrors,
    before,
    afterPan,
    beforePinch,
    afterPinch,
  };

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  const failures = [];
  if (!(panDist > 1)) failures.push(`pan travel too small: ${panDist}`);
  // Pinch out → zoom in → radius should decrease
  if (!(radiusDelta < -1)) failures.push(`pinch did not zoom in (radiusΔ=${radiusDelta})`);
  // Gesture math must not call rotate during noisy pinch
  if (!(rotateAppliedDeg < 0.5)) failures.push(`pinch applied rotate ${rotateAppliedDeg}°`);
  // Heading should stay stable once zoomToCursor is off for multitouch
  if (!(thetaDeltaDeg < 3)) failures.push(`pinch caused excessive yaw ${thetaDeltaDeg}°`);

  console.log(JSON.stringify(report, null, 2));
  if (failures.length) {
    console.error('FAILURES:', failures);
    process.exitCode = 1;
  } else {
    console.log('gesture-browser-check: PASS');
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
