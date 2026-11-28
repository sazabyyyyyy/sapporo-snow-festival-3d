/**
 * Gesture math checks for mapGestures (no DOM / Three runtime required for pure helpers).
 * Run: node scripts/test-map-gestures.mjs
 */
import assert from 'node:assert/strict';
import {
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

check('pinch with tiny twist → zoom only, near-zero rotate', () => {
  let state = fresh();
  let totalRotate = 0;
  let zoomSteps = 0;

  // Simulate ~20 frames of pinch-out with ~0.4° of noise twist each frame
  for (let i = 0; i < 20; i++) {
    const stepped = stepTwoFingerGesture(state, {
      dAngle: deg(0.4),
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
  // Cumulative twist stayed under the post-zoom unlock
  assert.ok(Math.abs(state.cumAngle) < ROTATE_UNLOCK_AFTER_ZOOM_RAD);
});

check('intentional twist unlocks rotate', () => {
  let state = fresh();
  // Pure twist, no scale
  for (let i = 0; i < 10; i++) {
    const stepped = stepTwoFingerGesture(state, {
      dAngle: deg(2),
      logScale: 0,
      dMidX: 0,
      dMidY: 0,
    });
    state = stepped.state;
  }
  assert.equal(state.mode, 'rotate');
  assert.ok(Math.abs(state.cumAngle) >= ROTATE_UNLOCK_RAD);

  const after = stepTwoFingerGesture(state, {
    dAngle: deg(3),
    logScale: 0,
    dMidX: 0,
    dMidY: 0,
  });
  assert.equal(after.applyRotate, true);
  assert.ok(Math.abs(after.rotateDelta - deg(3)) < 1e-9);
});

check('vertical two-finger drag unlocks tilt', () => {
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
    dAngle: 0,
    logScale: 0,
    dMidX: 0,
    dMidY: 5,
  });
  assert.equal(after.applyTilt, true);
  assert.equal(after.tiltDeltaY, 5);
});

check('resolveTwoFingerMode stays zoom under small twist', () => {
  const mode = resolveTwoFingerMode({
    mode: null,
    cumAngle: deg(8),
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

check('active pinch suppresses small rotate even after unlock', () => {
  let state = {
    mode: 'rotate',
    cumAngle: deg(30),
    cumLogScale: 0.1,
    cumMidY: 0,
    cumMidX: 0,
  };
  const stepped = stepTwoFingerGesture(state, {
    dAngle: deg(2),
    logScale: 0.02, // active pinch
    dMidX: 0,
    dMidY: 0,
  });
  assert.equal(stepped.applyRotate, false);
  assert.equal(stepped.applyZoom, true);
});

console.log(`\n${passed} checks passed`);
