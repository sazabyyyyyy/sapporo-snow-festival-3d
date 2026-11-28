/**
 * Google Maps–like camera gestures on top of Three.js MapControls.
 *
 * Desktop
 *   Left-drag            → pan
 *   Right-drag / Ctrl|Cmd+drag → rotate heading (azimuth)
 *   Middle-drag / Shift+drag   → tilt (pitch)
 *   Wheel / trackpad pinch     → zoom toward cursor
 *   Double-click               → zoom in toward cursor (optional nicety)
 *
 * Touch
 *   One-finger drag      → pan
 *   Two-finger pinch     → zoom
 *   Two-finger twist     → rotate heading (after intentional threshold)
 *   Two-finger vertical  → tilt (after intentional threshold)
 */

import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

const TWO_PI = Math.PI * 2;
const _offset = new THREE.Vector3();
const _spherical = new THREE.Spherical();

/** Radians of cumulative twist before heading rotate unlocks during a pinch. */
export const ROTATE_UNLOCK_RAD = (12 * Math.PI) / 180;
/** Extra twist required once pinch scale has already moved meaningfully. */
export const ROTATE_UNLOCK_AFTER_ZOOM_RAD = (22 * Math.PI) / 180;
/** Relative |log(scale)| that counts as a committed pinch-zoom. */
export const ZOOM_COMMIT_LOG = 0.035;
/** Midpoint vertical px before tilt unlocks (and must dominate horizontal). */
export const TILT_UNLOCK_PX = 22;
/** Horizontal mid drift must stay under this fraction of vertical to tilt. */
export const TILT_VERT_DOMINANCE = 0.55;
/** Per-frame |dAngle| above this is treated as pointer-tracking noise. */
export const MAX_STEP_ANGLE_RAD = (28 * Math.PI) / 180;
/** |log(scale)| this frame that counts as an active pinch. */
export const PINCH_DOMINATES_LOG = 0.008;
/** While pinching, ignore twist smaller than this (radians). */
export const ROTATE_WHILE_PINCH_RAD = (5 * Math.PI) / 180;

/**
 * Decide / keep two-finger mode from cumulative motion.
 * Exported for unit tests.
 *
 * Once rotate or tilt locks, it sticks for the gesture.
 * Zoom may upgrade to rotate/tilt when the user makes an intentional twist or vertical drag.
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

  // Intentional twist: large enough angle, and not dominated by pinch noise.
  const rotateNeed = zoomCommitted ? rotateAfterZoom : rotateUnlock;
  if (absAngle >= rotateNeed && absAngle >= absLog * 1.8) {
    return 'rotate';
  }

  // Vertical two-finger drag → tilt when vertical dominates horizontal.
  if (absMidY >= tiltUnlock && absMidY > absMidX * (1 / tiltDom)) {
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
  const pinchLog = thresholds.pinchDominatesLog ?? PINCH_DOMINATES_LOG;
  const rotateWhilePinch = thresholds.rotateWhilePinchRad ?? ROTATE_WHILE_PINCH_RAD;

  // Drop impossible per-frame twists (pointer id swaps / tracking glitches).
  const dAngle = Math.abs(sample.dAngle) > maxStep ? 0 : sample.dAngle;

  const next = {
    mode: state.mode,
    cumAngle: state.cumAngle + dAngle,
    cumLogScale: state.cumLogScale + sample.logScale,
    cumMidY: state.cumMidY + sample.dMidY,
    cumMidX: state.cumMidX + sample.dMidX,
  };
  next.mode = resolveTwoFingerMode(next, thresholds);

  // Active pinch wins over small twist — prevents iPad pinch “ぐるぐる”.
  const pinchDominant =
    Math.abs(sample.logScale) >= pinchLog && Math.abs(dAngle) < rotateWhilePinch;

  // Pinch zoom is always available (including while undecided). Rotate/tilt stay gated.
  const applyZoom = Math.abs(sample.logScale) > 1e-8;
  const applyRotate = next.mode === 'rotate' && !pinchDominant && dAngle !== 0;
  const applyTilt = next.mode === 'tilt' && !pinchDominant;

  return {
    state: next,
    applyZoom,
    applyRotate,
    applyTilt,
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

  // Snappier than stock 0.05 — Maps-like pan should track the finger, not lag.
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
  controls.touches = {
    ONE: THREE.TOUCH.PAN,
    TWO: THREE.TOUCH.DOLLY_ROTATE,
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

  const axisLock = installAxisLocking(controls, camera, domElement);
  installMapsTouchGestures(controls);
  if (opts.doubleClickZoom !== false) {
    installDoubleClickZoom(controls, domElement);
  }

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
        const origRotateLeft = controls._rotateLeft.bind(controls);
        controls._rotateLeft = (angle) => {
          rotateAppliedRad += angle;
          origRotateLeft(angle);
        };
        window.__mapGestureDebug = {
          controls,
          camera,
          resetRotateAccum() { rotateAppliedRad = 0; },
          getRotateAccum() { return rotateAppliedRad; },
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
    get active() { return state.active; },
    get baseMinPolar() { return state.baseMinPolar; },
    set baseMinPolar(v) { state.baseMinPolar = v; },
    get baseMaxPolar() { return state.baseMaxPolar; },
    set baseMaxPolar(v) { state.baseMaxPolar = v; },
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
 * Replace MapControls two-finger handling with Maps-like:
 * pinch → zoom, twist → heading (thresholded), vertical midpoint drag → tilt.
 */
function installMapsTouchGestures(controls) {
  let startDist = 0;
  let startAngle = 0;
  let startMidY = 0;
  let startMidX = 0;
  let gesture = {
    mode: null,
    cumAngle: 0,
    cumLogScale: 0,
    cumMidY: 0,
    cumMidX: 0,
  };

  const fingerPair = (event) => {
    const other = controls._getSecondPointerPosition(event);
    if (!other) return null;
    const x1 = event.pageX;
    const y1 = event.pageY;
    const x2 = other.x;
    const y2 = other.y;
    const dx = x2 - x1;
    const dy = y2 - y1;
    return {
      dist: Math.hypot(dx, dy),
      angle: Math.atan2(dy, dx),
      midX: 0.5 * (x1 + x2),
      midY: 0.5 * (y1 + y2),
    };
  };

  const resetGesture = () => {
    gesture = {
      mode: null,
      cumAngle: 0,
      cumLogScale: 0,
      cumMidY: 0,
      cumMidX: 0,
    };
  };

  controls._handleTouchStartDollyRotate = function (event) {
    const pair = fingerPair(event);
    if (!pair) return;
    startDist = Math.max(pair.dist, 1);
    startAngle = pair.angle;
    startMidY = pair.midY;
    startMidX = pair.midX;
    resetGesture();
    // Do NOT enable zoomToCursor for multitouch. Cursor-zoom moves the camera
    // along the view ray and re-seats the ground target, which warps heading
    // at tilted views and feels like “ぐるぐる” spin on iPad pinch.
    this._performCursorZoom = false;
  };

  controls._handleTouchMoveDollyRotate = function (event) {
    const pair = fingerPair(event);
    if (!pair) return;

    const element = this.domElement;

    let dAngle = pair.angle - startAngle;
    if (dAngle > Math.PI) dAngle -= TWO_PI;
    if (dAngle < -Math.PI) dAngle += TWO_PI;

    const ratio = startDist > 0 ? pair.dist / startDist : 1;
    const logScale = Math.log(Math.max(ratio, 1e-6));
    const dMidY = pair.midY - startMidY;
    const dMidX = pair.midX - startMidX;

    const stepped = stepTwoFingerGesture(gesture, {
      dAngle,
      logScale,
      dMidX,
      dMidY,
    });
    gesture = stepped.state;

    // Advance baselines so deltas are per-frame (not from gesture start).
    startAngle = pair.angle;
    startDist = Math.max(pair.dist, 1);
    startMidY = pair.midY;
    startMidX = pair.midX;

    // Pinch → radius zoom only (preserve heading). Rotate gated until unlock.
    if (this.enableZoom && stepped.applyZoom) {
      this._performCursorZoom = false;
      // Maps-like: outward = zoom in (_dollyOut(ratio>1) shrinks radius)
      this._dollyOut(Math.pow(ratio, this.zoomSpeed));
    }

    if (this.enableRotate && stepped.applyRotate) {
      this._rotateLeft(stepped.rotateDelta * this.rotateSpeed);
    }

    if (this.enableRotate && stepped.applyTilt) {
      this._rotateUp((-TWO_PI * stepped.tiltDeltaY * this.rotateSpeed) / element.clientHeight);
    }
    // update() is invoked by OrbitControls' onTouchMove after this handler
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
}
