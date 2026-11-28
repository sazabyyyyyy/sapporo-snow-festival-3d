/**
 * Google Maps–like camera gestures on top of Three.js MapControls.
 *
 * Desktop
 *   Left-drag                  → pan
 *   Right-drag / Ctrl|Cmd+drag → rotate heading (azimuth)
 *   Middle-drag / Shift+drag   → tilt (pitch)
 *   Wheel / trackpad pinch     → zoom toward cursor
 *   Double-click               → zoom in toward cursor
 *
 * Touch (Google Maps style)
 *   One-finger drag            → 1:1 ground-anchored pan + flick inertia
 *   Two-finger pinch + twist   → simultaneous zoom around midpoint, rotate heading, & pan
 *   Two-finger vertical drag   → tilt (pitch)
 *   Double-tap                 → smooth zoom in toward tapped point
 *   Two-finger tap             → smooth zoom out
 */

import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

const TWO_PI = Math.PI * 2;
const _offset = new THREE.Vector3();
const _spherical = new THREE.Spherical();
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hitA = new THREE.Vector3();
const _hitB = new THREE.Vector3();
const _shift = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

/** Radians of cumulative twist before heading rotate unlocks (6°). */
export const ROTATE_UNLOCK_RAD = (6 * Math.PI) / 180;
/** Cumulative twist required once pinch scale has already moved meaningfully (10°). */
export const ROTATE_UNLOCK_AFTER_ZOOM_RAD = (10 * Math.PI) / 180;
/** Relative |log(scale)| that counts as a committed pinch-zoom. */
export const ZOOM_COMMIT_LOG = 0.035;
/** Midpoint vertical px before tilt unlocks (and must dominate horizontal). */
export const TILT_UNLOCK_PX = 18;
/** Horizontal mid drift must stay under this fraction of vertical to tilt. */
export const TILT_VERT_DOMINANCE = 0.6;
/** Per-frame |dAngle| above this is treated as pointer-tracking noise (45°). */
export const MAX_STEP_ANGLE_RAD = (45 * Math.PI) / 180;
/** Max cumulative |log(scale)| allowed when entering tilt mode. */
export const TILT_MAX_ZOOM_LOG = 0.08;
/** Max cumulative |angle| allowed when entering tilt mode (8°). */
export const TILT_MAX_ROTATE_RAD = (8 * Math.PI) / 180;

/**
 * Compute distance, angle, and midpoint between two ordered fingers (pA -> pB).
 * Keeping a fixed finger ordering (pA, pB) across pointermove events prevents
 * the ±180° angle flip that occurs when event.pointerId alternates between fingers.
 *
 * @param {{ x: number, y: number }} pA
 * @param {{ x: number, y: number }} pB
 */
export function computeFingerPair(pA, pB) {
  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  return {
    dist: Math.hypot(dx, dy),
    angle: Math.atan2(dy, dx),
    midX: 0.5 * (pA.x + pB.x),
    midY: 0.5 * (pA.y + pB.y),
  };
}

/**
 * Wrap an angle delta into [-PI, PI].
 * @param {number} dAngle
 */
export function wrapAngleDelta(dAngle) {
  let a = dAngle;
  if (a > Math.PI) a -= TWO_PI;
  if (a < -Math.PI) a += TWO_PI;
  return a;
}

/**
 * Decide / keep two-finger mode from cumulative motion.
 * Exported for unit tests.
 *
 * - Once 'tilt' locks, it sticks for the gesture (prevents accidental zoom/rotate while tilting).
 * - Once 'rotate' unlocks, zoom + rotate + pan all work simultaneously (Google Maps style).
 * - 'zoom' may upgrade to 'rotate' as soon as the user twists intentionally.
 *
 * @param {{
 *   mode: null | 'zoom' | 'rotate' | 'tilt',
 *   cumAngle: number,
 *   cumLogScale: number,
 *   cumMidY: number,
 *   cumMidX: number,
 * }} state
 * @param {{
 *   rotateUnlockRad?: number,
 *   rotateUnlockAfterZoomRad?: number,
 *   zoomCommitLog?: number,
 *   tiltUnlockPx?: number,
 *   tiltVertDominance?: number,
 * }} [thresholds]
 * @returns {null | 'zoom' | 'rotate' | 'tilt'}
 */
export function resolveTwoFingerMode(state, thresholds = {}) {
  if (state.mode === 'rotate' || state.mode === 'tilt') return state.mode;

  const rotateUnlock = thresholds.rotateUnlockRad ?? ROTATE_UNLOCK_RAD;
  const rotateAfterZoom = thresholds.rotateUnlockAfterZoomRad ?? ROTATE_UNLOCK_AFTER_ZOOM_RAD;
  const zoomCommit = thresholds.zoomCommitLog ?? ZOOM_COMMIT_LOG;
  const tiltUnlock = thresholds.tiltUnlockPx ?? TILT_UNLOCK_PX;
  const tiltDom = thresholds.tiltVertDominance ?? TILT_VERT_DOMINANCE;

  const absAngle = Math.abs(state.cumAngle);
  const absLog = Math.abs(state.cumLogScale);
  const absMidY = Math.abs(state.cumMidY);
  const absMidX = Math.abs(state.cumMidX);
  const zoomCommitted = absLog >= zoomCommit || state.mode === 'zoom';

  // Intentional twist: unlock heading rotation (works alongside pinch zoom).
  const rotateNeed = zoomCommitted ? rotateAfterZoom : rotateUnlock;
  if (absAngle >= rotateNeed && absAngle >= absLog * 0.6) {
    return 'rotate';
  }

  // Parallel vertical two-finger drag → tilt (only before committed zoom/rotate).
  if (
    !zoomCommitted &&
    absLog < TILT_MAX_ZOOM_LOG &&
    absAngle < TILT_MAX_ROTATE_RAD &&
    absMidY >= tiltUnlock &&
    absMidY > absMidX * (1 / tiltDom)
  ) {
    return 'tilt';
  }

  if (zoomCommitted) {
    return 'zoom';
  }

  return null;
}

/**
 * One step of two-finger handling: update cumulatives and return what to apply.
 * Exported for unit tests.
 *
 * @param {{
 *   mode: null | 'zoom' | 'rotate' | 'tilt',
 *   cumAngle: number,
 *   cumLogScale: number,
 *   cumMidY: number,
 *   cumMidX: number,
 * }} state
 * @param {{ dAngle: number, logScale: number, dMidX: number, dMidY: number }} sample
 */
export function stepTwoFingerGesture(state, sample, thresholds = {}) {
  const maxStep = thresholds.maxStepAngleRad ?? MAX_STEP_ANGLE_RAD;

  // Drop impossible per-frame twists (tracking glitches).
  const dAngle = Math.abs(sample.dAngle) > maxStep ? 0 : sample.dAngle;

  const next = {
    mode: state.mode,
    cumAngle: state.cumAngle + dAngle,
    cumLogScale: state.cumLogScale + sample.logScale,
    cumMidY: state.cumMidY + sample.dMidY,
    cumMidX: state.cumMidX + sample.dMidX,
  };
  next.mode = resolveTwoFingerMode(next, thresholds);

  const isTilt = next.mode === 'tilt';
  const applyZoom = !isTilt && Math.abs(sample.logScale) > 1e-8;
  const applyRotate = next.mode === 'rotate' && dAngle !== 0;
  const applyTilt = isTilt;
  const applyPan = !isTilt;

  return {
    state: next,
    applyZoom,
    applyRotate,
    applyTilt,
    applyPan,
    rotateDelta: applyRotate ? dAngle : 0,
    tiltDeltaY: applyTilt ? sample.dMidY : 0,
  };
}

/**
 * Approximate Maps-like pan: pixel drag → world delta scale (mirrors MapControls._pan).
 * Exported for unit tests.
 */
export function panPixelsToWorldDelta(deltaX, deltaY, targetDistance, clientHeight, panSpeed) {
  const k = (2 * targetDistance) / Math.max(clientHeight, 1);
  return {
    x: deltaX * panSpeed * k,
    y: deltaY * panSpeed * k,
  };
}

/**
 * Raycast a screen point (clientX, clientY) onto the horizontal ground plane y = planeY.
 * Returns null if the ray is nearly parallel to the horizon or intersects behind/too far.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {HTMLElement} domElement
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} planeY
 * @param {number} maxDist
 * @param {THREE.Vector3} out
 * @returns {THREE.Vector3 | null}
 */
function intersectGroundPlane(camera, domElement, clientX, clientY, planeY, maxDist, out) {
  const rect = domElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  _raycaster.setFromCamera(_ndc, camera);
  // Reject rays aimed at the sky or grazing the horizon too shallowly
  if (_raycaster.ray.direction.y > -0.06) return null;

  _groundPlane.setComponents(0, 1, 0, -planeY);
  const hit = _raycaster.ray.intersectPlane(_groundPlane, out);
  if (!hit) return null;

  const distSq = hit.distanceToSquared(camera.position);
  if (distSq > maxDist * maxDist) return null;
  return hit;
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {HTMLElement} domElement
 * @param {{
 *   minDistance?: number,
 *   maxDistance?: number,
 *   minPolarAngle?: number,
 *   maxPolarAngle?: number,
 *   enableDamping?: boolean,
 *   dampingFactor?: number,
 *   zoomSpeed?: number,
 *   rotateSpeed?: number,
 *   panSpeed?: number,
 *   doubleClickZoom?: boolean,
 * }} [opts]
 */
export function createMapCameraControls(camera, domElement, opts = {}) {
  const controls = new MapControls(camera, domElement);

  // Desktop MapControls tuning
  controls.enableDamping = opts.enableDamping !== false;
  controls.dampingFactor = opts.dampingFactor ?? 0.16;
  controls.screenSpacePanning = false;
  controls.minDistance = opts.minDistance ?? 12;
  controls.maxDistance = opts.maxDistance ?? 12000;
  controls.minPolarAngle = opts.minPolarAngle ?? 0.08;
  controls.maxPolarAngle = opts.maxPolarAngle ?? Math.PI * 0.49;
  controls.zoomSpeed = opts.zoomSpeed ?? 1.05;
  controls.rotateSpeed = opts.rotateSpeed ?? 0.85;
  controls.panSpeed = opts.panSpeed ?? 1.45;
  controls.zoomToCursor = true;

  // Middle-drag tilts (Maps / Maps GL style) instead of dollying
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  // Disable stock OrbitControls touch handling — our custom Maps touch engine handles all touch
  // gestures with 1:1 ground-anchored pan, flick inertia, and simultaneous pinch/rotate/pan.
  controls.touches = {
    ONE: null,
    TWO: null,
  };

  // Keep canvas from scrolling / pinch-zooming the page (CSS + capture fallback)
  if (domElement.style) {
    domElement.style.touchAction = 'none';
  }
  const blockPageGesture = (ev) => {
    if (!controls.enabled) return;
    if (ev.cancelable) ev.preventDefault();
  };
  domElement.addEventListener('touchstart', blockPageGesture, { passive: false });
  domElement.addEventListener('touchmove', blockPageGesture, { passive: false });
  domElement.addEventListener('gesturestart', blockPageGesture, { passive: false });

  // Debug telemetry hook (populated when ?debugGestures=1)
  const debugHooks = {
    onRotateApplied: null,
  };

  const axisLock = installAxisLocking(controls, camera, domElement);
  const touchController = installGoogleMapsTouchController(controls, camera, domElement, debugHooks);
  const disposeDblClick =
    opts.doubleClickZoom !== false ? installDoubleClickZoom(controls, domElement) : () => {};

  // Wrap controls.update() to tick touch inertia & smooth tap-zoom animations every frame
  const origUpdate = controls.update.bind(controls);
  controls.update = (deltaTime = null) => {
    const touchMoved = touchController.tick();
    const orbitMoved = origUpdate(deltaTime);
    return touchMoved || orbitMoved;
  };

  /** Stop any active touch inertia / tap-zoom animation (e.g. before a fly-to animation). */
  controls.cancelTouchInertia = () => {
    touchController.cancelMotion();
  };

  /** Remember / restore polar limits when other UI (e.g. x-ray) changes them. */
  controls.setPolarLimits = (minPhi, maxPhi) => {
    axisLock.baseMinPolar = minPhi;
    axisLock.baseMaxPolar = maxPhi;
    if (!axisLock.active) {
      controls.minPolarAngle = minPhi;
      controls.maxPolarAngle = maxPhi;
    }
  };

  controls.disposeMapGestures = () => {
    axisLock.dispose();
    touchController.dispose();
    disposeDblClick();
    domElement.removeEventListener('touchstart', blockPageGesture);
    domElement.removeEventListener('touchmove', blockPageGesture);
    domElement.removeEventListener('gesturestart', blockPageGesture);
  };

  // Opt-in probe for automated gesture checks (?debugGestures=1)
  if (typeof window !== 'undefined') {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.has('debugGestures')) {
        let rotateAppliedRad = 0;
        debugHooks.onRotateApplied = (angle) => {
          rotateAppliedRad += angle;
        };
        const origRotateLeft = controls._rotateLeft.bind(controls);
        controls._rotateLeft = (angle) => {
          rotateAppliedRad += angle;
          origRotateLeft(angle);
        };
        window.__mapGestureDebug = {
          controls,
          camera,
          resetRotateAccum() {
            rotateAppliedRad = 0;
          },
          getRotateAccum() {
            return rotateAppliedRad;
          },
          snapshot() {
            const sph = currentSpherical(controls, camera);
            return {
              target: controls.target.toArray(),
              position: camera.position.toArray(),
              radius: sph.radius,
              theta: sph.theta,
              phi: sph.phi,
              rotateAppliedRad,
            };
          },
        };
      }
    } catch {
      /* ignore */
    }
  }

  return controls;
}

function currentSpherical(controls, camera) {
  _offset.copy(camera.position).sub(controls.target);
  _spherical.setFromVector3(_offset);
  return _spherical;
}

function installAxisLocking(controls, camera, domElement) {
  const state = {
    active: false,
    mode: null, // 'heading' | 'tilt' | null
    baseMinPolar: controls.minPolarAngle,
    baseMaxPolar: controls.maxPolarAngle,
    baseMinAzimuth: controls.minAzimuthAngle,
    baseMaxAzimuth: controls.maxAzimuthAngle,
  };

  const applyLocks = (mode) => {
    const sph = currentSpherical(controls, camera);
    state.mode = mode;
    state.active = true;
    if (mode === 'heading') {
      // Lock pitch — only azimuth changes
      controls.minPolarAngle = sph.phi;
      controls.maxPolarAngle = sph.phi;
      controls.minAzimuthAngle = state.baseMinAzimuth;
      controls.maxAzimuthAngle = state.baseMaxAzimuth;
    } else if (mode === 'tilt') {
      // Lock heading — only polar changes
      controls.minAzimuthAngle = sph.theta;
      controls.maxAzimuthAngle = sph.theta;
      controls.minPolarAngle = state.baseMinPolar;
      controls.maxPolarAngle = state.baseMaxPolar;
    }
  };

  const clearLocks = () => {
    if (!state.active) return;
    state.active = false;
    state.mode = null;
    controls.minPolarAngle = state.baseMinPolar;
    controls.maxPolarAngle = state.baseMaxPolar;
    controls.minAzimuthAngle = state.baseMinAzimuth;
    controls.maxAzimuthAngle = state.baseMaxAzimuth;
  };

  /**
   * Decide heading vs tilt before MapControls starts the rotate state.
   * MapControls: LEFT+modifier or RIGHT → rotate; we remap MIDDLE → rotate (tilt).
   */
  const onPointerDown = (ev) => {
    if (!controls.enabled) return;
    if (ev.pointerType === 'touch') return;

    const shift = ev.shiftKey;
    const ctrlOrMeta = ev.ctrlKey || ev.metaKey;

    // Middle button → tilt
    if (ev.button === 1) {
      applyLocks('tilt');
      return;
    }

    // Shift (+ optional other mods) on left → tilt (Maps / Mapbox-style)
    if (ev.button === 0 && shift) {
      applyLocks('tilt');
      return;
    }

    // Right-drag or Ctrl/Cmd+left → heading-only rotate
    if (ev.button === 2 || (ev.button === 0 && ctrlOrMeta)) {
      applyLocks('heading');
    }
  };

  const onPointerUp = () => {
    clearLocks();
  };

  // Capture so we lock axes before OrbitControls' bubble-phase handlers run
  domElement.addEventListener('pointerdown', onPointerDown, true);
  domElement.addEventListener('pointerup', onPointerUp, true);
  domElement.addEventListener('pointercancel', onPointerUp, true);
  window.addEventListener('pointerup', onPointerUp, true);

  return {
    get active() {
      return state.active;
    },
    get baseMinPolar() {
      return state.baseMinPolar;
    },
    set baseMinPolar(v) {
      state.baseMinPolar = v;
    },
    get baseMaxPolar() {
      return state.baseMaxPolar;
    },
    set baseMaxPolar(v) {
      state.baseMaxPolar = v;
    },
    dispose() {
      clearLocks();
      domElement.removeEventListener('pointerdown', onPointerDown, true);
      domElement.removeEventListener('pointerup', onPointerUp, true);
      domElement.removeEventListener('pointercancel', onPointerUp, true);
      window.removeEventListener('pointerup', onPointerUp, true);
    },
  };
}

/**
 * Direct, ground-anchored Google Maps touch controller with flick inertia.
 *
 * - 1-finger drag: raycasts onto the horizontal plane y = target.y so the ground
 *   tracks the fingertip 1:1 with zero damping lag; releases with smooth exponential flick inertia.
 * - 2-finger pinch/twist/pan: fixed finger ordering (no ±180° flip), zooms & rotates around the
 *   finger midpoint on the ground, and pans simultaneously.
 * - 2-finger vertical parallel drag: locks to tilt (swipe up = tilt into 3D, swipe down = top-down).
 * - Double-tap: smooth zoom-in toward the tapped point; 2-finger tap: smooth zoom-out.
 */
function installGoogleMapsTouchController(controls, camera, domElement, debugHooks) {
  /** @type {Map<number, { x: number, y: number }>} */
  const pointers = new Map();
  /** Ordered pair of pointer IDs while in 2-finger mode. */
  let pairIds = null;

  // One-finger pan state
  const oneAnchor = new THREE.Vector3();
  let hasOneAnchor = false;
  let oneLastX = 0;
  let oneLastY = 0;
  let oneLastMoveTs = 0;

  // Two-finger gesture state
  let prevPair = null;
  let twoGesture = freshTwoGesture();
  let twoStartTs = 0;
  let twoLastMoveTs = 0;
  let twoMaxMovedPx = 0;

  // Double-tap detection
  let lastTapTs = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let oneStartTs = 0;
  let oneStartX = 0;
  let oneStartY = 0;
  let oneMovedPx = 0;
  let sawMultiTouchInSequence = false;

  // Flick inertia (world units / sec on XZ plane) & angular inertia (rad / sec)
  const panVel = new THREE.Vector3();
  let rotVel = 0;
  let lastTickTs = 0;

  // Smooth double-tap / two-finger-tap zoom animation
  let tapZoomAnim = null;

  const PAN_FRICTION = 5.8; // Exponential decay rate (1/s) — ~0.65s smooth coast
  const ROT_FRICTION = 7.5;
  const MIN_PAN_SPEED = 0.5;
  const MIN_ROT_SPEED = 0.02;

  function freshTwoGesture() {
    return {
      mode: null,
      cumAngle: 0,
      cumLogScale: 0,
      cumMidY: 0,
      cumMidX: 0,
    };
  }

  function cancelMotion() {
    panVel.set(0, 0, 0);
    rotVel = 0;
    tapZoomAnim = null;
    // Also clear any residual OrbitControls damping deltas
    controls._panOffset?.set(0, 0, 0);
    controls._sphericalDelta?.set(0, 0, 0);
  }

  function currentCamDist() {
    return Math.max(1, camera.position.distanceTo(controls.target));
  }

  function initOneFinger(pt) {
    const dist = currentCamDist();
    camera.updateMatrixWorld();
    const hit = intersectGroundPlane(
      camera,
      domElement,
      pt.x,
      pt.y,
      controls.target.y,
      dist * 5.5,
      oneAnchor
    );
    hasOneAnchor = hit !== null;
    oneLastX = pt.x;
    oneLastY = pt.y;
    oneLastMoveTs = performance.now();
  }

  function initTwoFinger() {
    const ids = Array.from(pointers.keys());
    if (ids.length < 2) return;
    pairIds = [ids[0], ids[1]];
    const pA = pointers.get(pairIds[0]);
    const pB = pointers.get(pairIds[1]);
    prevPair = computeFingerPair(pA, pB);
    twoGesture = freshTwoGesture();
    twoStartTs = performance.now();
    twoLastMoveTs = twoStartTs;
    twoMaxMovedPx = 0;
  }

  /** Fallback horizontal pan when dragging on sky/horizon where ground raycast misses. */
  function fallbackPan(dxPx, dyPx) {
    const dist = currentCamDist();
    const h = Math.max(domElement.clientHeight, 1);
    const fovScale = 2 * dist * Math.tan((camera.fov * 0.5 * Math.PI) / 180);
    const worldPerPx = fovScale / h;

    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    _right.crossVectors(_fwd, THREE.Object3D.DEFAULT_UP).normalize();

    // Scale depth pan slightly by tilt so horizon drags still feel responsive
    const sph = currentSpherical(controls, camera);
    const tiltBoost = Math.min(2.6, 1 / Math.max(0.38, Math.cos(sph.phi)));

    _shift
      .set(0, 0, 0)
      .addScaledVector(_right, -dxPx * worldPerPx)
      .addScaledVector(_fwd, dyPx * worldPerPx * tiltBoost);
    _shift.y = 0;

    camera.position.add(_shift);
    controls.target.add(_shift);
    return _shift;
  }

  function applyOneFingerMove(pt, now) {
    const dxPx = pt.x - oneLastX;
    const dyPx = pt.y - oneLastY;
    const dt = Math.max(0.004, Math.min(0.06, (now - oneLastMoveTs) / 1000));
    oneLastX = pt.x;
    oneLastY = pt.y;
    oneLastMoveTs = now;

    if (Math.abs(dxPx) < 0.01 && Math.abs(dyPx) < 0.01) return;

    const dist = currentCamDist();
    let moved = null;

    if (hasOneAnchor) {
      camera.updateMatrixWorld();
      const curHit = intersectGroundPlane(
        camera,
        domElement,
        pt.x,
        pt.y,
        controls.target.y,
        dist * 5.5,
        _hitB
      );
      if (curHit) {
        _shift.subVectors(oneAnchor, curHit);
        _shift.y = 0;
        // Clamp extreme jumps near the horizon
        const maxJump = dist * 0.85;
        const len = _shift.length();
        if (len > maxJump) {
          _shift.multiplyScalar(maxJump / len);
          // Re-anchor so subsequent frames stay smooth
          oneAnchor.copy(curHit).add(_shift);
        }
        camera.position.add(_shift);
        controls.target.add(_shift);
        moved = _shift;
      } else {
        hasOneAnchor = false;
      }
    }

    if (!moved) {
      moved = fallbackPan(dxPx, dyPx);
      // Try re-acquiring ground anchor for subsequent frames
      camera.updateMatrixWorld();
      if (
        intersectGroundPlane(
          camera,
          domElement,
          pt.x,
          pt.y,
          controls.target.y,
          dist * 5.5,
          oneAnchor
        )
      ) {
        hasOneAnchor = true;
      }
    }

    // Track flick velocity with exponential smoothing
    const instVx = moved.x / dt;
    const instVz = moved.z / dt;
    const maxSpeed = dist * 7.5;
    const speed = Math.hypot(instVx, instVz);
    const scale = speed > maxSpeed ? maxSpeed / speed : 1;
    const alpha = 0.45;
    panVel.x = panVel.x * (1 - alpha) + instVx * scale * alpha;
    panVel.z = panVel.z * (1 - alpha) + instVz * scale * alpha;
  }

  function applyTwoFingerMove(now) {
    if (!pairIds) return;
    const pA = pointers.get(pairIds[0]);
    const pB = pointers.get(pairIds[1]);
    if (!pA || !pB) return;

    const pair = computeFingerPair(pA, pB);
    if (!prevPair) {
      prevPair = pair;
      return;
    }

    const dAngle = wrapAngleDelta(pair.angle - prevPair.angle);
    const safePrevDist = Math.max(prevPair.dist, 1);
    const safeCurDist = Math.max(pair.dist, 1);
    const ratio = safeCurDist / safePrevDist;
    const logScale = Math.log(Math.max(ratio, 1e-6));
    const dMidX = pair.midX - prevPair.midX;
    const dMidY = pair.midY - prevPair.midY;

    twoMaxMovedPx += Math.hypot(dMidX, dMidY) + Math.abs(safeCurDist - safePrevDist);

    const stepped = stepTwoFingerGesture(twoGesture, {
      dAngle,
      logScale,
      dMidX,
      dMidY,
    });
    twoGesture = stepped.state;

    const prevMidX = prevPair.midX;
    const prevMidY = prevPair.midY;
    prevPair = pair;

    const dist = currentCamDist();
    const groundY = controls.target.y;

    // Capture ground point under the previous midpoint BEFORE transforming camera
    let anchorBefore = null;
    if (stepped.applyPan || stepped.applyZoom || stepped.applyRotate) {
      camera.updateMatrixWorld();
      anchorBefore = intersectGroundPlane(
        camera,
        domElement,
        prevMidX,
        prevMidY,
        groundY,
        dist * 5.5,
        _hitA
      );
    }

    const sph = currentSpherical(controls, camera);
    let sphChanged = false;

    // 1. Pinch zoom (outward = zoom in → shrink radius)
    if (controls.enableZoom && stepped.applyZoom) {
      const zoomFactor = Math.pow(ratio, controls.zoomSpeed);
      const nextRadius = Math.max(
        controls.minDistance,
        Math.min(controls.maxDistance, sph.radius / zoomFactor)
      );
      if (nextRadius !== sph.radius) {
        sph.radius = nextRadius;
        sphChanged = true;
      }
    }

    // 2. Two-finger twist → heading rotation (clockwise twist = clockwise map rotation = +theta)
    if (controls.enableRotate && stepped.applyRotate) {
      const deltaTheta = stepped.rotateDelta;
      sph.theta += deltaTheta;
      sphChanged = true;
      debugHooks.onRotateApplied?.(deltaTheta);

      const dt = Math.max(0.008, Math.min(0.05, (now - twoLastMoveTs) / 1000));
      twoLastMoveTs = now;
      const instRot = deltaTheta / dt;
      rotVel = rotVel * 0.6 + Math.max(-4.5, Math.min(4.5, instRot)) * 0.4;
    }

    // 3. Two-finger vertical parallel drag → tilt
    // Google Maps: swipe UP (dMidY < 0) tilts into 3D (increases phi); swipe DOWN returns to top-down (decreases phi)
    if (controls.enableRotate && stepped.applyTilt) {
      const h = Math.max(domElement.clientHeight, 1);
      const dPhi = (-stepped.tiltDeltaY * Math.PI * 0.9) / h;
      const nextPhi = Math.max(
        controls.minPolarAngle,
        Math.min(controls.maxPolarAngle, sph.phi + dPhi)
      );
      if (nextPhi !== sph.phi) {
        sph.phi = nextPhi;
        sphChanged = true;
      }
    }

    if (sphChanged) {
      sph.makeSafe();
      _offset.setFromSpherical(sph);
      camera.position.copy(controls.target).add(_offset);
      camera.lookAt(controls.target);
    }

    // 4. Re-seat the ground anchor under the new midpoint (simultaneous zoom-to-midpoint + rotate-around-midpoint + 2-finger pan)
    if (anchorBefore && stepped.applyPan) {
      camera.updateMatrixWorld();
      const anchorAfter = intersectGroundPlane(
        camera,
        domElement,
        pair.midX,
        pair.midY,
        groundY,
        sph.radius * 5.5,
        _hitB
      );
      if (anchorAfter) {
        _shift.subVectors(anchorBefore, anchorAfter);
        _shift.y = 0;
        const maxJump = sph.radius * 0.85;
        const len = _shift.length();
        if (len > maxJump) {
          _shift.multiplyScalar(maxJump / len);
        }
        camera.position.add(_shift);
        controls.target.add(_shift);
      }
    }

    // Clear pan velocity during 2-finger gesture so releasing doesn't fling unintentionally
    panVel.set(0, 0, 0);
  }

  function startTapZoom(scaleFactor, clientX, clientY) {
    if (!controls.enableZoom) return;
    cancelMotion();

    const sph = currentSpherical(controls, camera);
    const startRadius = sph.radius;
    const endRadius = Math.max(
      controls.minDistance,
      Math.min(controls.maxDistance, startRadius * scaleFactor)
    );
    if (Math.abs(endRadius - startRadius) < 0.01) return;

    const startTarget = controls.target.clone();
    const endTarget = controls.target.clone();

    // When zooming in on a double-tap, shift target partially toward the tapped ground point
    if (scaleFactor < 1 && clientX !== undefined && clientY !== undefined) {
      camera.updateMatrixWorld();
      const hit = intersectGroundPlane(
        camera,
        domElement,
        clientX,
        clientY,
        controls.target.y,
        startRadius * 4.5,
        _hitA
      );
      if (hit) {
        const pull = 1 - endRadius / startRadius;
        endTarget.lerp(hit, Math.min(0.65, pull));
        endTarget.y = controls.target.y;
      }
    }

    tapZoomAnim = {
      startTs: performance.now(),
      durMs: 260,
      startRadius,
      endRadius,
      startTarget,
      endTarget,
    };
  }

  const onPointerDown = (ev) => {
    if (ev.pointerType !== 'touch') return;

    cancelMotion();
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size === 1) {
      sawMultiTouchInSequence = false;
      oneStartTs = performance.now();
      oneStartX = ev.clientX;
      oneStartY = ev.clientY;
      oneMovedPx = 0;
      oneLastMoveTs = 0;
      hasOneAnchor = false;
      if (controls.enabled) {
        initOneFinger({ x: ev.clientX, y: ev.clientY });
      }
    } else if (pointers.size === 2) {
      sawMultiTouchInSequence = true;
      hasOneAnchor = false;
      initTwoFinger();
    }
  };

  const onPointerMove = (ev) => {
    if (ev.pointerType !== 'touch') return;
    if (!pointers.has(ev.pointerId)) return;

    const prev = pointers.get(ev.pointerId);
    const stepPx = Math.hypot(ev.clientX - prev.x, ev.clientY - prev.y);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (!controls.enabled) return;

    const now = performance.now();
    if (pointers.size === 1) {
      oneMovedPx += stepPx;
      if (!hasOneAnchor && oneLastMoveTs === 0) {
        initOneFinger({ x: ev.clientX, y: ev.clientY });
        return;
      }
      applyOneFingerMove({ x: ev.clientX, y: ev.clientY }, now);
    } else if (pointers.size >= 2) {
      if (!pairIds) {
        initTwoFinger();
        return;
      }
      applyTwoFingerMove(now);
    }
  };

  const onPointerUp = (ev) => {
    if (ev.pointerType !== 'touch') return;
    if (!pointers.has(ev.pointerId)) return;

    const now = performance.now();
    const prevCount = pointers.size;
    pointers.delete(ev.pointerId);

    if (prevCount === 2 && pointers.size === 1) {
      // Check for 2-finger tap (quick tap with minimal movement → zoom out)
      if (now - twoStartTs < 240 && twoMaxMovedPx < 24) {
        // Defer until the second finger lifts too; keep twoStartTs intact
        pairIds = null;
        prevPair = null;
        return;
      }
      // Seamless handoff from 2-finger back to 1-finger pan
      pairIds = null;
      prevPair = null;
      rotVel = 0;
      const remaining = pointers.values().next().value;
      if (remaining && controls.enabled) {
        initOneFinger(remaining);
      }
      return;
    }

    if (pointers.size === 0) {
      pairIds = null;
      prevPair = null;
      hasOneAnchor = false;

      if (sawMultiTouchInSequence) {
        // Two-finger quick tap → Google Maps zoom out
        if (now - twoStartTs < 280 && twoMaxMovedPx < 28 && controls.enabled) {
          startTapZoom(1.85);
        }
        // Only keep gentle rotation inertia if we were actively rotating recently
        if (twoGesture.mode !== 'rotate' || now - twoLastMoveTs > 90) {
          rotVel = 0;
        }
        panVel.set(0, 0, 0);
        return;
      }

      // Single-finger tap / double-tap check
      const tapDur = now - oneStartTs;
      const tapDist = Math.hypot(ev.clientX - oneStartX, ev.clientY - oneStartY);
      if (tapDur < 280 && tapDist < 16 && oneMovedPx < 20) {
        panVel.set(0, 0, 0);
        const sinceLast = now - lastTapTs;
        const distFromLast = Math.hypot(ev.clientX - lastTapX, ev.clientY - lastTapY);
        if (sinceLast < 320 && distFromLast < 42 && controls.enabled) {
          lastTapTs = 0;
          startTapZoom(0.5, ev.clientX, ev.clientY);
        } else {
          lastTapTs = now;
          lastTapX = ev.clientX;
          lastTapY = ev.clientY;
        }
        return;
      }

      // If the finger paused before lifting, don't flick
      if (now - oneLastMoveTs > 80) {
        panVel.set(0, 0, 0);
      }
      lastTickTs = now;
    }
  };

  /** Called every frame from wrapped controls.update() to apply inertia & tap-zoom. */
  function tick() {
    const now = performance.now();
    const dt = lastTickTs > 0 ? Math.min(0.05, Math.max(0.001, (now - lastTickTs) / 1000)) : 1 / 60;
    lastTickTs = now;

    if (!controls.enabled) {
      cancelMotion();
      return false;
    }

    let changed = false;

    // 1. Smooth double-tap / 2-finger-tap zoom animation
    if (tapZoomAnim) {
      const u = Math.min(1, (now - tapZoomAnim.startTs) / tapZoomAnim.durMs);
      const e = 1 - Math.pow(1 - u, 3); // ease-out cubic
      const sph = currentSpherical(controls, camera);
      sph.radius = tapZoomAnim.startRadius + (tapZoomAnim.endRadius - tapZoomAnim.startRadius) * e;
      controls.target.lerpVectors(tapZoomAnim.startTarget, tapZoomAnim.endTarget, e);
      _offset.setFromSpherical(sph);
      camera.position.copy(controls.target).add(_offset);
      camera.lookAt(controls.target);
      changed = true;
      if (u >= 1) tapZoomAnim = null;
      return changed;
    }

    // 2. Do not coast while fingers are down
    if (pointers.size > 0) return false;

    // 3. One-finger flick inertia (frame-rate independent exponential decay)
    const panSpeed = Math.hypot(panVel.x, panVel.z);
    if (panSpeed > MIN_PAN_SPEED) {
      const dx = panVel.x * dt;
      const dz = panVel.z * dt;
      camera.position.x += dx;
      camera.position.z += dz;
      controls.target.x += dx;
      controls.target.z += dz;
      const decay = Math.exp(-PAN_FRICTION * dt);
      panVel.x *= decay;
      panVel.z *= decay;
      changed = true;
    } else if (panSpeed > 0) {
      panVel.set(0, 0, 0);
    }

    // 4. Gentle two-finger rotation inertia
    if (Math.abs(rotVel) > MIN_ROT_SPEED) {
      const sph = currentSpherical(controls, camera);
      sph.theta += rotVel * dt;
      sph.makeSafe();
      _offset.setFromSpherical(sph);
      camera.position.copy(controls.target).add(_offset);
      camera.lookAt(controls.target);
      rotVel *= Math.exp(-ROT_FRICTION * dt);
      changed = true;
    } else if (rotVel !== 0) {
      rotVel = 0;
    }

    return changed;
  }

  domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  return {
    tick,
    cancelMotion,
    dispose() {
      domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    },
  };
}

function installDoubleClickZoom(controls, domElement) {
  const onDblClick = (ev) => {
    if (!controls.enabled || !controls.enableZoom) return;
    if (ev.target !== domElement) return;
    // Zoom in ~one "notch" toward cursor
    controls._updateZoomParameters(ev.clientX, ev.clientY);
    controls._dollyIn(Math.pow(0.95, controls.zoomSpeed * 12));
    controls.update();
  };
  domElement.addEventListener('dblclick', onDblClick);
  return () => domElement.removeEventListener('dblclick', onDblClick);
}
