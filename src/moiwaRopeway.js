import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _pos = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _right = new THREE.Vector3();
const _look = new THREE.Matrix4();
const _quat = new THREE.Quaternion();

/**
 * Samples a Catmull-Rom-ish polyline at parameter u ∈ [0, 1].
 * Stations are THREE.Vector3 control points (at least 2).
 */
function samplePath(points, u, outPos, outTan) {
  const n = points.length - 1;
  const t = Math.max(0, Math.min(1, u)) * n;
  const i = Math.min(n - 1, Math.floor(t));
  const f = t - i;
  const a = points[i];
  const b = points[i + 1];
  outPos.lerpVectors(a, b, f);
  outTan.subVectors(b, a).normalize();
  if (outTan.lengthSq() < 1e-6) outTan.set(1, 0, 0);
}

function buildCableGeometry(points, radius, radialSegs = 5) {
  const curvePts = [];
  const steps = Math.max(24, points.length * 16);
  for (let i = 0; i <= steps; i++) {
    samplePath(points, i / steps, _pos, _tan);
    curvePts.push(_pos.clone());
  }
  const curve = new THREE.CatmullRomCurve3(curvePts, false, 'centripetal', 0.5);
  return new THREE.TubeGeometry(curve, steps, radius, radialSegs, false);
}

function createStationBuilding(scale, accentHex, emissiveHex) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3.4 * scale, 1.6 * scale, 2.4 * scale),
    new THREE.MeshStandardMaterial({
      color: 0xe8eef6,
      roughness: 0.55,
      metalness: 0.12,
      emissive: emissiveHex,
      emissiveIntensity: 0.35,
    })
  );
  body.position.y = 0.85 * scale;
  body.castShadow = true;
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(3.8 * scale, 0.22 * scale, 2.7 * scale),
    new THREE.MeshStandardMaterial({ color: 0xc45a4a, roughness: 0.62, metalness: 0.2 })
  );
  roof.position.y = 1.75 * scale;
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(3.45 * scale, 0.18 * scale, 2.45 * scale),
    new THREE.MeshStandardMaterial({
      color: accentHex,
      emissive: accentHex,
      emissiveIntensity: 0.8,
      roughness: 0.4,
    })
  );
  stripe.position.y = 1.35 * scale;
  g.add(body, roof, stripe);
  return g;
}

function createSupportTower(height, scale) {
  const g = new THREE.Group();
  const mast = new THREE.Mesh(
    new THREE.BoxGeometry(0.28 * scale, height, 0.28 * scale),
    new THREE.MeshStandardMaterial({ color: 0xb8c0cc, metalness: 0.55, roughness: 0.38 })
  );
  mast.position.y = height * 0.5;
  mast.castShadow = true;
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(1.6 * scale, 0.14 * scale, 0.14 * scale),
    new THREE.MeshStandardMaterial({ color: 0x9aa3b0, metalness: 0.6, roughness: 0.35 })
  );
  arm.position.y = height * 0.92;
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.5 * scale, 0.2 * scale, 0.5 * scale),
    new THREE.MeshStandardMaterial({ color: 0xd4dae4, metalness: 0.45, roughness: 0.4 })
  );
  cap.position.y = height;
  g.add(mast, arm, cap);
  return g;
}

/**
 * Classic Mt. Moiwa aerial-tram cabin (red body, lit windows, hangar yoke).
 * Local space: +X forward along cable, +Y up, cabin hangs below origin (cable attach).
 */
function createAerialCabin(scale, bodyHex = 0xc62828) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.2 * scale, 1.15 * scale, 1.35 * scale),
    new THREE.MeshStandardMaterial({
      color: bodyHex,
      metalness: 0.35,
      roughness: 0.42,
      emissive: bodyHex,
      emissiveIntensity: 0.15,
    })
  );
  body.position.y = -1.05 * scale;
  body.castShadow = true;

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.85 * scale, 0.55 * scale, 1.38 * scale),
    new THREE.MeshStandardMaterial({
      color: 0xffe6a8,
      emissive: 0xffc055,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.1,
    })
  );
  glass.position.y = -0.85 * scale;

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(2.3 * scale, 0.12 * scale, 1.4 * scale),
    new THREE.MeshStandardMaterial({ color: 0xf2f5fa, roughness: 0.5, metalness: 0.2 })
  );
  roof.position.y = -0.42 * scale;

  const hanger = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06 * scale, 0.08 * scale, 0.55 * scale, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.7, roughness: 0.3 })
  );
  hanger.position.y = -0.18 * scale;

  const yoke = new THREE.Mesh(
    new THREE.BoxGeometry(0.55 * scale, 0.1 * scale, 0.22 * scale),
    new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.65, roughness: 0.32 })
  );

  const lamp = new THREE.PointLight(0xffd9a0, 4 * scale, 6 * scale, 2);
  lamp.position.set(0, -0.7 * scale, 0);

  g.add(body, glass, roof, hanger, yoke, lamp);
  g.userData.glassMat = glass.material;
  g.userData.lamp = lamp;
  return g;
}

function createMiniCabin(scale) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.95 * scale, 0.85 * scale, 0.95 * scale),
    new THREE.MeshStandardMaterial({
      color: 0xf5f7fb,
      metalness: 0.25,
      roughness: 0.4,
      emissive: 0xfff4d6,
      emissiveIntensity: 0.25,
    })
  );
  body.position.y = -0.7 * scale;
  body.castShadow = true;
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.78 * scale, 0.42 * scale, 0.98 * scale),
    new THREE.MeshStandardMaterial({
      color: 0xffe8b0,
      emissive: 0xffb84d,
      emissiveIntensity: 1.4,
      roughness: 0.25,
    })
  );
  glass.position.y = -0.55 * scale;
  const hanger = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04 * scale, 0.05 * scale, 0.35 * scale, 5),
    new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.7, roughness: 0.3 })
  );
  hanger.position.y = -0.12 * scale;
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

/**
 * Stylized-scale Mt. Moiwa Ropeway for the festival city diorama.
 * Uses the same mountainHeight sampler as the displaced Moiwa mesh so cables hug the slope.
 *
 * @param {THREE.Object3D} parent
 * @param {(x:number,z:number)=>number} heightFn  terrain height at (x,z)
 */
export function createStylizedMoiwaRopeway(parent, heightFn) {
  const group = new THREE.Group();
  group.name = 'MOIWA_ROPEWAY';

  // Peak matches buildMountains() summit; base sits on NE slope toward the city
  const summitXZ = { x: -76, z: 36 };
  const midXZ = { x: -66, z: 27 };
  const baseXZ = { x: -52, z: 16 };

  const cableClear = 1.35; // meters above terrain for cable clearance
  const summitY = heightFn(summitXZ.x, summitXZ.z) + cableClear + 0.6;
  const midY = heightFn(midXZ.x, midXZ.z) + cableClear + 1.8;
  const baseY = Math.max(1.2, heightFn(baseXZ.x, baseXZ.z) + cableClear + 2.4);

  const lowerPath = [
    new THREE.Vector3(baseXZ.x, baseY, baseXZ.z),
    new THREE.Vector3(
      (baseXZ.x + midXZ.x) * 0.5,
      (baseY + midY) * 0.5 + 1.2,
      (baseXZ.z + midXZ.z) * 0.5
    ),
    new THREE.Vector3(midXZ.x, midY, midXZ.z),
  ];
  const upperPath = [
    new THREE.Vector3(midXZ.x, midY, midXZ.z),
    new THREE.Vector3(
      (midXZ.x + summitXZ.x) * 0.5,
      (midY + summitY) * 0.5 + 0.6,
      (midXZ.z + summitXZ.z) * 0.5
    ),
    new THREE.Vector3(summitXZ.x, summitY, summitXZ.z),
  ];

  const cableMat = new THREE.MeshStandardMaterial({
    color: 0x8a93a3,
    metalness: 0.85,
    roughness: 0.28,
  });
  const lowerCable = new THREE.Mesh(buildCableGeometry(lowerPath, 0.04), cableMat);
  const upperCable = new THREE.Mesh(buildCableGeometry(upperPath, 0.032), cableMat);
  group.add(lowerCable, upperCable);

  // Twin parallel guide cable (visual thickness)
  const lowerGuide = lowerPath.map(p => p.clone().add(new THREE.Vector3(0, -0.1, 0)));
  const upperGuide = upperPath.map(p => p.clone().add(new THREE.Vector3(0, -0.08, 0)));
  group.add(
    new THREE.Mesh(buildCableGeometry(lowerGuide, 0.028), cableMat),
    new THREE.Mesh(buildCableGeometry(upperGuide, 0.022), cableMat)
  );

  // Stations
  const baseStation = createStationBuilding(0.55, 0xc62828, 0x4a1a12);
  baseStation.position.set(baseXZ.x, heightFn(baseXZ.x, baseXZ.z), baseXZ.z);
  const midStation = createStationBuilding(0.45, 0x2563eb, 0x0f2744);
  midStation.position.set(midXZ.x, heightFn(midXZ.x, midXZ.z), midXZ.z);
  const summitStation = createStationBuilding(0.5, 0xc62828, 0x4a1a12);
  summitStation.position.set(summitXZ.x, heightFn(summitXZ.x, summitXZ.z), summitXZ.z);
  group.add(baseStation, midStation, summitStation);

  // Support towers along lower span
  const towerUs = [0.28, 0.55, 0.78];
  for (const u of towerUs) {
    samplePath(lowerPath, u, _pos, _tan);
    const groundY = heightFn(_pos.x, _pos.z);
    const h = Math.max(2.2, _pos.y - groundY);
    const tower = createSupportTower(h, 0.55);
    tower.position.set(_pos.x, groundY, _pos.z);
    group.add(tower);
  }
  for (const u of [0.4, 0.75]) {
    samplePath(upperPath, u, _pos, _tan);
    const groundY = heightFn(_pos.x, _pos.z);
    const h = Math.max(1.6, _pos.y - groundY);
    const tower = createSupportTower(h, 0.45);
    tower.position.set(_pos.x, groundY, _pos.z);
    group.add(tower);
  }

  // Aerial tram: two cabins counter-running on lower ropeway
  const cabinA = createAerialCabin(0.48, 0xc62828);
  const cabinB = createAerialCabin(0.48, 0xb71c1c);
  group.add(cabinA, cabinB);

  // Mini cable cars on upper section
  const miniCabins = [];
  for (let i = 0; i < 4; i++) {
    const c = createMiniCabin(0.42);
    group.add(c);
    miniCabins.push({ mesh: c, phase: i / 4 });
  }

  parent.add(group);

  const LOWER_SPEED = 0.07; // cycles per second (readable motion in cinematic shots)
  const UPPER_SPEED = 0.09;

  return {
    group,
    update(time, nightFactor = 0.7) {
      const winGlow = 0.6 + 1.8 * nightFactor;
      const lampI = 2 + 10 * nightFactor;

      // Counter-running aerial tram (u and 1-u so they pass mid-span)
      const uLower = ((time * LOWER_SPEED) % 1 + 1) % 1;
      // Smooth turnaround near terminals (ease bounce)
      const ping = uLower < 0.5 ? uLower * 2 : (1 - uLower) * 2;
      const uA = smootherPing(ping);
      const uB = 1 - uA;
      placeCabin(cabinA, lowerPath, uA);
      placeCabin(cabinB, lowerPath, uB);
      cabinA.userData.glassMat.emissiveIntensity = winGlow;
      cabinB.userData.glassMat.emissiveIntensity = winGlow;
      cabinA.userData.lamp.intensity = lampI;
      cabinB.userData.lamp.intensity = lampI;

      for (const m of miniCabins) {
        const u = ((time * UPPER_SPEED + m.phase) % 1 + 1) % 1;
        placeCabin(m.mesh, upperPath, u);
        if (m.mesh.userData.glassMat) {
          m.mesh.userData.glassMat.emissiveIntensity = 0.5 + 1.4 * nightFactor;
        }
      }
    },
  };
}

/** Smooth triangle-wave remapping for aerial-tram ping-pong travel */
function smootherPing(t) {
  // t in [0,1] going base→summit half, then reverse; apply ease
  const s = t * t * (3 - 2 * t);
  return s;
}
