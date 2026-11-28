import * as THREE from 'three';
import { latLonToGround } from './geo.js';

const UP = new THREE.Vector3(0, 1, 0);
const _pos = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _right = new THREE.Vector3();
const _look = new THREE.Matrix4();
const _quat = new THREE.Quaternion();

/**
 * Real Mt. Moiwa Ropeway + Mini Cable Car stations (WGS84).
 * Elevations are orthometric (TP m); local Y = elev - ODORI_BASE (22m).
 * Refined asynchronously via GSI DEM when mapGround is available.
 */
const STATIONS = {
  sanroku: { name: '山麓駅', lat: 43.031547, lon: 141.333056, elev: 200 },
  chufuku: { name: '中腹駅', lat: 43.02237, lon: 141.32557, elev: 459 },
  sancho: { name: '山頂駅', lat: 43.0222026, lon: 141.3224305, elev: 520 },
};

const ODORI_BASE = 22.0;

function elevToLocalY(elev) {
  return elev - ODORI_BASE;
}

function samplePath(points, u, outPos, outTan) {
  const n = points.length - 1;
  const t = Math.max(0, Math.min(1, u)) * n;
  const i = Math.min(n - 1, Math.floor(t));
  const f = t - i;
  outPos.lerpVectors(points[i], points[i + 1], f);
  outTan.subVectors(points[i + 1], points[i]).normalize();
  if (outTan.lengthSq() < 1e-6) outTan.set(1, 0, 0);
}

function buildCableGeometry(points, radius) {
  const curvePts = [];
  const steps = Math.max(32, points.length * 20);
  for (let i = 0; i <= steps; i++) {
    samplePath(points, i / steps, _pos, _tan);
    curvePts.push(_pos.clone());
  }
  const curve = new THREE.CatmullRomCurve3(curvePts, false, 'centripetal', 0.5);
  return new THREE.TubeGeometry(curve, steps, radius, 6, false);
}

function createStationHall(scale, accentHex) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(18 * scale, 9 * scale, 14 * scale),
    new THREE.MeshStandardMaterial({
      color: 0xe8eef6,
      roughness: 0.55,
      metalness: 0.12,
      emissive: 0x2a3344,
      emissiveIntensity: 0.25,
    })
  );
  body.position.y = 4.5 * scale;
  body.castShadow = true;
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(20 * scale, 1.2 * scale, 16 * scale),
    new THREE.MeshStandardMaterial({ color: 0xc45a4a, roughness: 0.58, metalness: 0.18 })
  );
  roof.position.y = 9.6 * scale;
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(18.2 * scale, 1.0 * scale, 14.2 * scale),
    new THREE.MeshStandardMaterial({
      color: accentHex,
      emissive: accentHex,
      emissiveIntensity: 0.7,
      roughness: 0.4,
    })
  );
  stripe.position.y = 7.2 * scale;
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(22 * scale, 0.6 * scale, 18 * scale),
    new THREE.MeshStandardMaterial({ color: 0x9aa3b2, roughness: 0.7, metalness: 0.15 })
  );
  platform.position.y = 0.3 * scale;
  g.add(body, roof, stripe, platform);
  return g;
}

function createTower(height) {
  const g = new THREE.Group();
  const mast = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, height, 1.4),
    new THREE.MeshStandardMaterial({ color: 0xb8c0cc, metalness: 0.55, roughness: 0.38 })
  );
  mast.position.y = height * 0.5;
  mast.castShadow = true;
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.7, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x9aa3b0, metalness: 0.6, roughness: 0.35 })
  );
  arm.position.y = height * 0.92;
  const brace = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, height * 0.55, 0.45),
    new THREE.MeshStandardMaterial({ color: 0xa8b0bc, metalness: 0.5, roughness: 0.4 })
  );
  brace.position.set(2.2, height * 0.35, 0);
  const brace2 = brace.clone();
  brace2.position.x = -2.2;
  g.add(mast, arm, brace, brace2);
  return g;
}

function createAerialCabin() {
  // Near real-scale aerial tram (~9–10m cabin) with slight boost for overlook readability
  const s = 1.15;
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(9.5 * s, 4.2 * s, 5.6 * s),
    new THREE.MeshStandardMaterial({
      color: 0xc62828,
      metalness: 0.35,
      roughness: 0.4,
      emissive: 0xc62828,
      emissiveIntensity: 0.35,
    })
  );
  body.position.y = -5.2 * s;
  body.castShadow = true;
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(8.2 * s, 2.1 * s, 5.7 * s),
    new THREE.MeshStandardMaterial({
      color: 0xffe6a8,
      emissive: 0xffc055,
      emissiveIntensity: 2.4,
      roughness: 0.2,
    })
  );
  glass.position.y = -4.4 * s;
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(9.8 * s, 0.45 * s, 5.8 * s),
    new THREE.MeshStandardMaterial({ color: 0xf2f5fa, roughness: 0.48, metalness: 0.2 })
  );
  roof.position.y = -2.9 * s;
  const hanger = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28 * s, 0.35 * s, 2.6 * s, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.7, roughness: 0.3 })
  );
  hanger.position.y = -1.2 * s;
  const yoke = new THREE.Mesh(
    new THREE.BoxGeometry(2.4 * s, 0.4 * s, 0.9 * s),
    new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.65, roughness: 0.32 })
  );
  const lamp = new THREE.PointLight(0xffd9a0, 48, 70, 2);
  lamp.position.set(0, -4.0 * s, 0);
  g.add(body, glass, roof, hanger, yoke, lamp);
  g.userData.glassMat = glass.material;
  g.userData.lamp = lamp;
  return g;
}

function createMiniCabin() {
  const s = 1.05;
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3.2 * s, 2.8 * s, 3.2 * s),
    new THREE.MeshStandardMaterial({
      color: 0xf5f7fb,
      metalness: 0.25,
      roughness: 0.4,
      emissive: 0xfff4d6,
      emissiveIntensity: 0.45,
    })
  );
  body.position.y = -2.6 * s;
  body.castShadow = true;
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(2.6 * s, 1.4 * s, 3.25 * s),
    new THREE.MeshStandardMaterial({
      color: 0xffe8b0,
      emissive: 0xffb84d,
      emissiveIntensity: 2.2,
      roughness: 0.25,
    })
  );
  glass.position.y = -2.1 * s;
  const hanger = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1.4 * s, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.7, roughness: 0.3 })
  );
  hanger.position.y = -0.6 * s;
  g.add(body, glass, hanger);
  g.userData.glassMat = glass.material;
  return g;
}

function placeCabin(cabin, points, u) {
  samplePath(points, u, _pos, _tan);
  cabin.position.copy(_pos);
  _right.crossVectors(_tan, UP).normalize();
  if (_right.lengthSq() < 0.01) _right.set(1, 0, 0);
  _look.makeBasis(_tan, UP, _right);
  _quat.setFromRotationMatrix(_look);
  cabin.quaternion.copy(_quat);
}

function makeStationPoint(spec, clearance) {
  const p = latLonToGround(spec.lat, spec.lon, elevToLocalY(spec.elev) + clearance);
  return p;
}

function rebuildCables(group, lowerPath, upperPath, cableMeshes) {
  for (const m of cableMeshes) {
    group.remove(m);
    m.geometry.dispose();
  }
  cableMeshes.length = 0;
  const cableMat = new THREE.MeshStandardMaterial({
    color: 0x8a93a3,
    metalness: 0.85,
    roughness: 0.28,
  });
  const meshes = [
    new THREE.Mesh(buildCableGeometry(lowerPath, 0.22), cableMat),
    new THREE.Mesh(buildCableGeometry(lowerPath.map(p => p.clone().setY(p.y - 0.55)), 0.14), cableMat),
    new THREE.Mesh(buildCableGeometry(upperPath, 0.16), cableMat),
    new THREE.Mesh(buildCableGeometry(upperPath.map(p => p.clone().setY(p.y - 0.4)), 0.1), cableMat),
  ];
  for (const m of meshes) {
    group.add(m);
    cableMeshes.push(m);
  }
}

/**
 * Real-scale Mt. Moiwa Ropeway (山麓↔中腹 aerial tram) + Mini Cable Car (中腹↔山頂).
 * Cabins animate continuously; station elevations refine via GSI DEM when available.
 */
export function createPlateauMoiwaRopeway(scene, mapGround = null) {
  const group = new THREE.Group();
  group.name = 'MOIWA_ROPEWAY_PLATEAU';

  const CLEAR_LOWER = 28; // cable clearance above ground (m) — keep well above DEM ridges
  const CLEAR_UPPER = 18;

  let sanroku = makeStationPoint(STATIONS.sanroku, CLEAR_LOWER);
  let chufuku = makeStationPoint(STATIONS.chufuku, CLEAR_LOWER);
  let sancho = makeStationPoint(STATIONS.sancho, CLEAR_UPPER);

  // Mid span bow so cables clear the ridge
  function buildPaths() {
    const midLower = new THREE.Vector3().lerpVectors(sanroku, chufuku, 0.5);
    midLower.y += 28;
    const midUpper = new THREE.Vector3().lerpVectors(chufuku, sancho, 0.5);
    midUpper.y += 12;
    return {
      lower: [sanroku.clone(), midLower, chufuku.clone()],
      upper: [chufuku.clone(), midUpper, sancho.clone()],
    };
  }

  let paths = buildPaths();
  const cableMeshes = [];
  rebuildCables(group, paths.lower, paths.upper, cableMeshes);

  // Bright emissive route ribbon so the ropeway reads clearly against GSI photo tiles
  const ribbonMat = new THREE.MeshBasicMaterial({
    color: 0xff5522,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  let lowerRibbon = null;
  let upperRibbon = null;
  function rebuildRibbons() {
    if (lowerRibbon) {
      group.remove(lowerRibbon);
      lowerRibbon.geometry.dispose();
    }
    if (upperRibbon) {
      group.remove(upperRibbon);
      upperRibbon.geometry.dispose();
    }
    lowerRibbon = new THREE.Mesh(buildCableGeometry(paths.lower, 1.4), ribbonMat);
    upperRibbon = new THREE.Mesh(buildCableGeometry(paths.upper, 1.0), ribbonMat);
    group.add(lowerRibbon, upperRibbon);
  }
  rebuildRibbons();

  // Station halls at ground level (below cable attach)
  const hallSanroku = createStationHall(0.62, 0xc62828);
  hallSanroku.position.set(sanroku.x, sanroku.y - CLEAR_LOWER, sanroku.z);
  const hallChufuku = createStationHall(0.52, 0x2563eb);
  hallChufuku.position.set(chufuku.x, chufuku.y - CLEAR_LOWER, chufuku.z);
  const hallSancho = createStationHall(0.55, 0xc62828);
  hallSancho.position.set(sancho.x, sancho.y - CLEAR_UPPER, sancho.z);
  // Orient halls roughly along the cable approach
  for (const [hall, a, b] of [
    [hallSanroku, sanroku, chufuku],
    [hallChufuku, chufuku, sancho],
    [hallSancho, chufuku, sancho],
  ]) {
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    hall.rotation.y = yaw;
  }
  group.add(hallSanroku, hallChufuku, hallSancho);

  const towers = [];
  function rebuildTowers() {
    for (const t of towers) group.remove(t);
    towers.length = 0;
    for (const u of [0.22, 0.45, 0.68, 0.88]) {
      samplePath(paths.lower, u, _pos, _tan);
      const groundY = _pos.y - CLEAR_LOWER * (1 - Math.abs(u - 0.5) * 0.3);
      const h = Math.max(18, _pos.y - groundY);
      const tower = createTower(h);
      tower.position.set(_pos.x, groundY, _pos.z);
      group.add(tower);
      towers.push(tower);
    }
    for (const u of [0.35, 0.7]) {
      samplePath(paths.upper, u, _pos, _tan);
      const groundY = _pos.y - CLEAR_UPPER;
      const h = Math.max(12, _pos.y - groundY);
      const tower = createTower(h);
      tower.position.set(_pos.x, groundY, _pos.z);
      group.add(tower);
      towers.push(tower);
    }
  }
  rebuildTowers();

  const cabinA = createAerialCabin();
  const cabinB = createAerialCabin();
  group.add(cabinA, cabinB);

  const miniCabins = [];
  for (let i = 0; i < 5; i++) {
    const c = createMiniCabin();
    group.add(c);
    miniCabins.push({ mesh: c, phase: i / 5 });
  }

  scene.add(group);

  // Async DEM elevation snap (same pattern as rail network)
  if (mapGround?.getLocalElevationAt) {
    Promise.all([
      mapGround.getLocalElevationAt(STATIONS.sanroku.lat, STATIONS.sanroku.lon, 13),
      mapGround.getLocalElevationAt(STATIONS.chufuku.lat, STATIONS.chufuku.lon, 13),
      mapGround.getLocalElevationAt(STATIONS.sancho.lat, STATIONS.sancho.lon, 13),
    ]).then(([y0, y1, y2]) => {
      let changed = false;
      if (y0 !== null && Number.isFinite(y0)) {
        sanroku = latLonToGround(STATIONS.sanroku.lat, STATIONS.sanroku.lon, y0 + CLEAR_LOWER);
        hallSanroku.position.set(sanroku.x, y0, sanroku.z);
        changed = true;
      }
      if (y1 !== null && Number.isFinite(y1)) {
        chufuku = latLonToGround(STATIONS.chufuku.lat, STATIONS.chufuku.lon, y1 + CLEAR_LOWER);
        hallChufuku.position.set(chufuku.x, y1, chufuku.z);
        changed = true;
      }
      if (y2 !== null && Number.isFinite(y2)) {
        sancho = latLonToGround(STATIONS.sancho.lat, STATIONS.sancho.lon, y2 + CLEAR_UPPER);
        hallSancho.position.set(sancho.x, y2, sancho.z);
        changed = true;
      }
      if (changed) {
        paths = buildPaths();
        rebuildCables(group, paths.lower, paths.upper, cableMeshes);
        rebuildRibbons();
        rebuildTowers();
      }
    }).catch(() => {});
  }

  const LOWER_SPEED = 0.045; // full cycle / sec (ping-pong; readable from overlooks)
  const UPPER_SPEED = 0.065;

  function easePing(t) {
    return t * t * (3 - 2 * t);
  }

  return {
    group,
    stations: STATIONS,
    /** Viewpoint helper: profile look at mid ropeway from the east */
    getViewpoint() {
      const mid = new THREE.Vector3().lerpVectors(sanroku, chufuku, 0.42);
      const eye = mid.clone().add(new THREE.Vector3(210, 55, -30));
      return { eye, tgt: mid.clone() };
    },
    update(time, nightFactor = 0.7) {
      const winGlow = 0.5 + 1.7 * nightFactor;
      const lampI = 8 + 36 * nightFactor;

      const cycle = ((time * LOWER_SPEED) % 1 + 1) % 1;
      const ping = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2;
      const uA = easePing(ping);
      const uB = 1 - uA;
      placeCabin(cabinA, paths.lower, uA);
      placeCabin(cabinB, paths.lower, uB);
      cabinA.userData.glassMat.emissiveIntensity = winGlow;
      cabinB.userData.glassMat.emissiveIntensity = winGlow;
      cabinA.userData.lamp.intensity = lampI;
      cabinB.userData.lamp.intensity = lampI;

      for (const m of miniCabins) {
        const u = ((time * UPPER_SPEED + m.phase) % 1 + 1) % 1;
        placeCabin(m.mesh, paths.upper, u);
        if (m.mesh.userData.glassMat) {
          m.mesh.userData.glassMat.emissiveIntensity = 0.4 + 1.3 * nightFactor;
        }
      }
    },
  };
}
