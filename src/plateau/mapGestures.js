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
 *   Two-finger twist     → rotate heading
 *   Two-finger vertical  → tilt
 */

import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

const TWO_PI = Math.PI * 2;
const _offset = new THREE.Vector3();
const _spherical = new THREE.Spherical();

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

  controls.enableDamping = opts.enableDamping !== false;
  controls.dampingFactor = opts.dampingFactor ?? 0.06;
  controls.screenSpacePanning = false;
  controls.minDistance = opts.minDistance ?? 12;
  controls.maxDistance = opts.maxDistance ?? 12000;
  controls.minPolarAngle = opts.minPolarAngle ?? 0.08;
  controls.maxPolarAngle = opts.maxPolarAngle ?? Math.PI * 0.49;
  controls.zoomSpeed = opts.zoomSpeed ?? 1.05;
  controls.rotateSpeed = opts.rotateSpeed ?? 0.85;
  controls.panSpeed = opts.panSpeed ?? 1.0;
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
 * pinch → zoom, twist → heading, vertical midpoint drag → tilt.
 */
function installMapsTouchGestures(controls) {
  let startDist = 0;
  let startAngle = 0;
  let startMidY = 0;
  let startMidX = 0;

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

  controls._handleTouchStartDollyRotate = function (event) {
    const pair = fingerPair(event);
    if (!pair) return;
    startDist = Math.max(pair.dist, 1);
    startAngle = pair.angle;
    startMidY = pair.midY;
    startMidX = pair.midX;
    this._updateZoomParameters(pair.midX, pair.midY);
  };

  controls._handleTouchMoveDollyRotate = function (event) {
    const pair = fingerPair(event);
    if (!pair) return;

    const element = this.domElement;

    // Pinch → zoom
    if (this.enableZoom && startDist > 0) {
      const ratio = pair.dist / startDist;
      // Maps-like: outward = zoom in
      this._dollyOut(Math.pow(ratio, this.zoomSpeed));
      startDist = Math.max(pair.dist, 1);
      this._updateZoomParameters(pair.midX, pair.midY);
    }

    if (this.enableRotate) {
      // Twist → heading
      let dAngle = pair.angle - startAngle;
      if (dAngle > Math.PI) dAngle -= TWO_PI;
      if (dAngle < -Math.PI) dAngle += TWO_PI;
      this._rotateLeft(dAngle * this.rotateSpeed);
      startAngle = pair.angle;

      // Vertical two-finger drag → tilt (ignore small horizontal mid drift)
      const dMidY = pair.midY - startMidY;
      const dMidX = pair.midX - startMidX;
      if (Math.abs(dMidY) > Math.abs(dMidX) * 0.55 || Math.abs(dMidY) > 2) {
        this._rotateUp((-TWO_PI * dMidY * this.rotateSpeed) / element.clientHeight);
      }
      startMidY = pair.midY;
      startMidX = pair.midX;
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
