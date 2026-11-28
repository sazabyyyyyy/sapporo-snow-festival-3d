/**
 * Gesture math checks for mapGestures (no DOM / Three runtime required for pure helpers).
 * Run: node scripts/test-map-gestures.mjs
 */
import assert from 'node:assert/strict';
import {
  computeFingerPair,
  wrapAngleDelta,
  stepTwoFingerGesture,
  resolveTwoFingerMode,
  panPixelsToWorldDelta,
  ROTATE_UNLOCK_RAD,
  ROTATE_UNLOCK_AFTER_ZOOM_RAD,
  ZOOM_COMMIT_LOG,
} from '../src/plateau/mapGestures.js';

function fresh() {
  return { mode: null, cumAngle: 0, cumLogScale: 0, cumMidY: 0, cumMidX: 0 };
}

function deg(d) {
  return (d * Math.PI) / 180;
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check('pinch with tiny twist → zoom only, zero rotate', () => {
  let state = fresh();
  let totalRotate = 0;
  let zoomSteps = 0;

  // Simulate ~20 frames of pinch-out with ~0.35° of noise twist each frame (~7° total < 10° post-zoom unlock)
  for (let i = 0; i < 20; i++) {
    const stepped = stepTwoFingerGesture(state, {
      dAngle: deg(0.35),
      logScale: 0.02, // clear zoom
      dMidX: 0.5,
      dMidY: 0.3,
    });
    state = stepped.state;
    if (stepped.applyZoom) zoomSteps += 1;
    totalRotate += Math.abs(stepped.rotateDelta);
  }

  assert.equal(state.mode, 'zoom');
  assert.ok(zoomSteps >= 18, `expected many zoom steps, got ${zoomSteps}`);
  assert.equal(totalRotate, 0, `pinch must not rotate (got ${totalRotate})`);
  assert.ok(Math.abs(state.cumAngle) < ROTATE_UNLOCK_AFTER_ZOOM_RAD);
});

check('intentional twist unlocks rotate quickly', () => {
  let state = fresh();
  let totalRotate = 0;
  // Pure twist, no scale (10 frames × 2° = 20°)
  for (let i = 0; i < 10; i++) {
    const stepped = stepTwoFingerGesture(state, {
      dAngle: deg(2),
      logScale: 0,
      dMidX: 0,
      dMidY: 0,
    });
    state = stepped.state;
    totalRotate += stepped.rotateDelta;
  }
  assert.equal(state.mode, 'rotate');
  assert.ok(Math.abs(state.cumAngle) >= ROTATE_UNLOCK_RAD);
  assert.ok(totalRotate > deg(10), `expected smooth rotation accumulation, got ${totalRotate}`);

  const after = stepTwoFingerGesture(state, {
    dAngle: deg(3),
    logScale: 0,
    dMidX: 0,
    dMidY: 0,
  });
  assert.equal(after.applyRotate, true);
  assert.ok(Math.abs(after.rotateDelta - deg(3)) < 1e-9);
});

check('simultaneous pinch + twist applies both zoom and rotate (Google Maps style)', () => {
  let state = fresh();
  let totalRotate = 0;
  let zoomSteps = 0;

  // 12 frames of zooming while twisting 2°/frame (24° total)
  for (let i = 0; i < 12; i++) {
    const stepped = stepTwoFingerGesture(state, {
      dAngle: deg(2),
      logScale: 0.015,
      dMidX: 0.5,
      dMidY: 0.5,
    });
    state = stepped.state;
    if (stepped.applyZoom) zoomSteps += 1;
    totalRotate += stepped.rotateDelta;
  }

  assert.equal(state.mode, 'rotate');
  assert.equal(zoomSteps, 12);
  assert.ok(totalRotate > deg(10), `expected simultaneous rotate while zooming, got ${totalRotate}`);
});

check('computeFingerPair keeps stable angle when alternating finger updates', () => {
  // Simulate two fingers rotating around (500, 400) where finger A and finger B fire alternating moves
  const cx = 500;
  const cy = 400;
  const r = 100;
  let pA = { x: cx - r, y: cy };
  let pB = { x: cx + r, y: cy };
  let prev = computeFingerPair(pA, pB);
  let state = fresh();
  let totalRotate = 0;

  for (let i = 1; i <= 20; i++) {
    const ang = deg(i * 2);
    // Update only finger A on odd steps, only finger B on even steps (alternating pointermove!)
    if (i % 2 === 1) {
      pA = { x: cx - Math.cos(ang) * r, y: cy - Math.sin(ang) * r };
    } else {
      pB = { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
    }
    const cur = computeFingerPair(pA, pB);
    const dAngle = wrapAngleDelta(cur.angle - prev.angle);
    assert.ok(Math.abs(dAngle) < deg(10), `angle must never flip by 180° (got ${dAngle})`);

    const stepped = stepTwoFingerGesture(state, {
      dAngle,
      logScale: Math.log(cur.dist / prev.dist),
      dMidX: cur.midX - prev.midX,
      dMidY: cur.midY - prev.midY,
    });
    state = stepped.state;
    totalRotate += stepped.rotateDelta;
    prev = cur;
  }

  assert.equal(state.mode, 'rotate');
  assert.ok(totalRotate > deg(25), `expected full twist without drops, got ${(totalRotate * 180) / Math.PI}°`);
});

check('vertical two-finger drag unlocks tilt and suppresses zoom/rotate', () => {
  let state = fresh();
  for (let i = 0; i < 8; i++) {
    const stepped = stepTwoFingerGesture(state, {
      dAngle: 0,
      logScale: 0,
      dMidX: 1,
      dMidY: 4,
    });
    state = stepped.state;
  }
  assert.equal(state.mode, 'tilt');
  const after = stepTwoFingerGesture(state, {
    dAngle: deg(2),
    logScale: 0.01,
    dMidX: 0,
    dMidY: 5,
  });
  assert.equal(after.applyTilt, true);
  assert.equal(after.applyZoom, false);
  assert.equal(after.applyRotate, false);
  assert.equal(after.tiltDeltaY, 5);
});

check('resolveTwoFingerMode stays zoom under small twist', () => {
  const mode = resolveTwoFingerMode({
    mode: null,
    cumAngle: deg(5),
    cumLogScale: ZOOM_COMMIT_LOG * 2,
    cumMidY: 2,
    cumMidX: 1,
  });
  assert.equal(mode, 'zoom');
});

check('one-finger pan distance scales with panSpeed', () => {
  const slow = panPixelsToWorldDelta(100, 0, 500, 800, 1.0);
  const fast = panPixelsToWorldDelta(100, 0, 500, 800, 1.45);
  assert.ok(Math.abs(slow.x) > 0);
  assert.ok(Math.abs(fast.x) > Math.abs(slow.x));
  assert.ok(Math.abs(fast.x / slow.x - 1.45) < 1e-9);
});

check('glitch-sized angle steps are ignored during pinch', () => {
  let state = fresh();
  let totalRotate = 0;
  for (let i = 0; i < 10; i++) {
    const stepped = stepTwoFingerGesture(state, {
      dAngle: deg(60), // tracking glitch
      logScale: 0.03,
      dMidX: 0,
      dMidY: 0,
    });
    state = stepped.state;
    totalRotate += Math.abs(stepped.rotateDelta);
  }
  assert.equal(totalRotate, 0);
  assert.equal(state.mode, 'zoom');
  assert.equal(state.cumAngle, 0);
});

console.log(`\n${passed} checks passed`);
