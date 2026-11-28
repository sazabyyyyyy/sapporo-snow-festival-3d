import * as THREE from 'three';
import {
  createBuildingTextureSet,
  createWinterRoadTextures,
  createRedBrickTexture,
  createTVTowerClockTexture,
  createClockFaceTexture,
  createSusukinoSignTexture,
} from './textures.js';
import { createDetailedCarFleet } from './carFleet.js';
import { createStylizedMoiwaRopeway } from './moiwaRopeway.js';

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return (
    hash2(ix, iz) * (1 - ux) * (1 - uz) +
    hash2(ix + 1, iz) * ux * (1 - uz) +
    hash2(ix, iz + 1) * (1 - ux) * uz +
    hash2(ix + 1, iz + 1) * ux * uz
  );
}
function fbm2(x, z) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < 5; i++) {
    v += a * noise2(x * f, z * f);
    f *= 2.04;
    a *= 0.5;
  }
  return v;
}

function addStrut(group, a, b, radius, mat) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = new THREE.Vector3().subVectors(vb, va);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 6), mat);
  mesh.position.copy(va).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  group.add(mesh);
}

// ==================== SAPPORO TV TOWER (さっぽろテレビ塔) ====================
function buildTVTower(clockTex) {
  const g = new THREE.Group();
  const redSteel = new THREE.MeshStandardMaterial({
    color: 0xd92d26,
    emissive: 0x6b120e,
    emissiveIntensity: 0.7,
    roughness: 0.42,
    metalness: 0.65,
  });
  const whiteSteel = new THREE.MeshStandardMaterial({
    color: 0xeef3fa,
    emissive: 0x3b485e,
    emissiveIntensity: 0.35,
    roughness: 0.45,
    metalness: 0.5,
  });
  const podiumMat = new THREE.MeshStandardMaterial({ color: 0x454c5a, roughness: 0.72, metalness: 0.15 });
  const warmGlass = new THREE.MeshStandardMaterial({
    color: 0xffe09c,
    emissive: 0xffb84d,
    emissiveIntensity: 2.3,
    roughness: 0.15,
    metalness: 0.2,
  });

  // Base podium hall (y = 0 .. 2.2)
  const pod = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.2, 4.4), podiumMat);
  pod.position.y = 1.1;
  pod.castShadow = pod.receiveShadow = true;
  g.add(pod);
  const podGlow = new THREE.Mesh(new THREE.BoxGeometry(4.52, 0.2, 4.52), warmGlass);
  podGlow.position.y = 2.25;
  g.add(podGlow);

  // 4 Tapered Lattice Steel Legs + Cross Bracing (y = 2.2 .. 9.6)
  const tiers = [
    { y: 2.2, r: 1.85 },
    { y: 4.5, r: 1.24 },
    { y: 7.0, r: 0.90 },
    { y: 9.2, r: 0.76 },
  ];
  for (let t = 0; t < tiers.length - 1; t++) {
    const a = tiers[t], b = tiers[t + 1];
    for (let i = 0; i < 4; i++) {
      const sx = (i === 0 || i === 3) ? -1 : 1;
      const sz = (i < 2) ? -1 : 1;
      const p0 = [sx * a.r, a.y, sz * a.r];
      const p1 = [sx * b.r, b.y, sz * b.r];
      addStrut(g, p0, p1, 0.11, redSteel);

      const j = (i + 1) % 4;
      const nx = (j === 0 || j === 3) ? -1 : 1;
      const nz = (j < 2) ? -1 : 1;
      const q0 = [nx * a.r, a.y, nz * a.r];
      const q1 = [nx * b.r, b.y, nz * b.r];
      addStrut(g, p0, q1, 0.055, redSteel);
      addStrut(g, q0, p1, 0.055, redSteel);
      addStrut(g, p1, q1, 0.075, whiteSteel);
    }
  }

  // Central illuminated elevator core
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 7.2, 0.68),
    new THREE.MeshStandardMaterial({ color: 0xf08c4f, emissive: 0xd45822, emissiveIntensity: 0.9, roughness: 0.5 })
  );
  core.position.y = 5.8;
  g.add(core);

  // Iconic Digital Clock Section (y = 9.0 .. 10.0) with LIVE LED Texture on all 4 sides!
  const clockBox = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 1.02, 2.05),
    new THREE.MeshStandardMaterial({ color: 0x151922, roughness: 0.6 })
  );
  clockBox.position.y = 9.5;
  g.add(clockBox);

  const clockFaceMat = new THREE.MeshStandardMaterial({
    map: clockTex,
    emissive: 0xffffff,
    emissiveMap: clockTex,
    emissiveIntensity: 2.1,
    roughness: 0.25,
  });
  const faceGeo = new THREE.PlaneGeometry(1.78, 0.86);
  const dirs = [
    { pos: [-1.05, 9.5, 0], rotY: -Math.PI / 2 }, // West (facing Odori Park!)
    { pos: [ 1.05, 9.5, 0], rotY:  Math.PI / 2 }, // East
    { pos: [0, 9.5,  1.05], rotY: 0 },            // South
    { pos: [0, 9.5, -1.05], rotY: Math.PI },      // North
  ];
  for (const d of dirs) {
    const f = new THREE.Mesh(faceGeo, clockFaceMat);
    f.position.set(...d.pos);
    f.rotation.y = d.rotY;
    g.add(f);
  }

  // Observation Deck (y = 10.0 .. 11.4)
  const deckBot = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.28, 2.85), whiteSteel);
  deckBot.position.y = 10.16;
  const deckGlass = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.72, 2.62), warmGlass);
  deckGlass.position.y = 10.66;
  const deckTop = new THREE.Mesh(new THREE.BoxGeometry(2.90, 0.28, 2.90), redSteel);
  deckTop.position.y = 11.16;
  g.add(deckBot, deckGlass, deckTop);

  // Upper Lattice Spire & Pulsing Red Aviation Beacon
  const uTiers = [
    { y: 11.3, r: 0.68 },
    { y: 13.2, r: 0.36 },
    { y: 14.8, r: 0.14 },
  ];
  for (let t = 0; t < uTiers.length - 1; t++) {
    const a = uTiers[t], b = uTiers[t + 1];
    const mat = t === 0 ? whiteSteel : redSteel;
    for (let i = 0; i < 4; i++) {
      const sx = (i === 0 || i === 3) ? -1 : 1;
      const sz = (i < 2) ? -1 : 1;
      addStrut(g, [sx * a.r, a.y, sz * a.r], [sx * b.r, b.y, sz * b.r], 0.055, mat);
    }
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.11, 2.2, 8), whiteSteel);
  mast.position.y = 15.8;
  g.add(mast);

  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xff2a20, emissive: 0xff2218, emissiveIntensity: 5.0,
  });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), beaconMat);
  beacon.position.y = 16.95;
  g.add(beacon);

  // Warm uplight casting real orange-red glow onto tower lattice & snow below
  const towerLight = new THREE.PointLight(0xff6b38, 32, 24, 1.5);
  towerLight.position.set(0, 6.2, 0);
  g.add(towerLight);

  return { group: g, beaconMat, redSteel, towerLight };
}

// ==================== SAPPORO CLOCK TOWER (札幌市時計台) ====================
function buildClockTower(snowMat) {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.78 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x9c201c, roughness: 0.58 });
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xffe4a0, emissive: 0xffb946, emissiveIntensity: 2.2, roughness: 0.2,
  });
  const dialTex = createClockFaceTexture();
  const dialMat = new THREE.MeshStandardMaterial({
    map: dialTex, emissive: 0xfff0c8, emissiveMap: dialTex, emissiveIntensity: 1.5,
  });

  const hall = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.1, 2.3), wallMat);
  hall.position.y = 1.05;
  hall.castShadow = hall.receiveShadow = true;
  g.add(hall);

  // Pitched crimson roof with snow cap
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 1.85, 3.4, 3), roofMat);
  roof.rotation.z = Math.PI / 2;
  roof.rotation.x = Math.PI / 6;
  roof.scale.set(0.55, 1, 0.92);
  roof.position.y = 2.42;
  roof.castShadow = true;
  g.add(roof);

  // Warm glowing windows
  for (let i = -1; i <= 1; i++) {
    const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.68, 0.08), winMat);
    w1.position.set(i * 0.9, 1.05, 1.16);
    const w2 = w1.clone();
    w2.position.z = -1.16;
    g.add(w1, w2);
  }

  // Belfry tower + 4 glowing analog clock faces + pointed spire
  const belfry = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.0, 1.15), wallMat);
  belfry.position.set(-0.6, 3.2, 0);
  belfry.castShadow = true;
  g.add(belfry);

  const dialGeo = new THREE.CircleGeometry(0.38, 18);
  for (const [px, pz, ry] of [[0, 0.59, 0], [0, -0.59, Math.PI], [0.59, 0, Math.PI / 2], [-0.59, 0, -Math.PI / 2]]) {
    const d = new THREE.Mesh(dialGeo, dialMat);
    d.position.set(-0.6 + px, 3.55, pz);
    d.rotation.y = ry;
    g.add(d);
  }

  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.84, 1.55, 4), roofMat);
  spire.rotation.y = Math.PI / 4;
  spire.position.set(-0.6, 4.95, 0);
  spire.castShadow = true;
  g.add(spire);

  // Snow courtyard base
  const yard = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.1, 4.4), snowMat);
  yard.position.y = 0.05;
  yard.receiveShadow = true;
  g.add(yard);

  return g;
}

// ==================== FORMER HOKKAIDO GOV RED BRICK OFFICE (赤れんが庁舎) ====================
function buildRedBrickOffice(snowMat) {
  const g = new THREE.Group();
  const brickTex = createRedBrickTexture();
  const brickMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.82 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xe6e0d6, roughness: 0.72 });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0x2b6254, roughness: 0.45, metalness: 0.35 });
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xffdf99, emissive: 0xffaf3c, emissiveIntensity: 2.0, roughness: 0.2,
  });

  // Main brick wings + central portico
  const main = new THREE.Mesh(new THREE.BoxGeometry(8.2, 2.8, 3.4), brickMat);
  main.position.y = 1.4;
  main.castShadow = main.receiveShadow = true;
  const center = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.2, 4.0), brickMat);
  center.position.y = 1.6;
  center.castShadow = center.receiveShadow = true;
  g.add(main, center);

  // Stone cornices & snow-dusted roof
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.22, 3.65), trimMat);
  cornice.position.y = 2.86;
  const roofCap = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.35, 3.3), snowMat);
  roofCap.position.y = 3.12;
  g.add(cornice, roofCap);

  // Glowing Neo-Baroque arched windows
  for (let i = -3; i <= 3; i++) {
    const wF = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.92, 0.08), winMat);
    wF.position.set(i * 1.05, 1.55, 1.72 + (Math.abs(i) <= 1 ? 0.3 : 0));
    const wB = wF.clone();
    wB.position.z = -wF.position.z;
    g.add(wF, wB);
  }

  // Iconic Octagonal Green-Copper Cupola Dome
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 1.3, 8), brickMat);
  drum.position.y = 3.75;
  const dome = new THREE.Mesh(new THREE.ConeGeometry(1.18, 1.75, 8), copperMat);
  dome.position.y = 5.25;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), winMat);
  finial.position.y = 6.2;
  g.add(drum, dome, finial);

  // Warm uplight onto the Red Brick facade
  const uplight = new THREE.PointLight(0xffa042, 20, 16, 1.6);
  uplight.position.set(0, 2.2, 3.5);
  g.add(uplight);

  return g;
}

// ==================== JR TOWER & SAPPORO STATION SKYLINE ====================
function buildJRTower(bldgMats, snowMat) {
  const g = new THREE.Group();
  const glassMat = bldgMats[2];
  const haloMat = new THREE.MeshStandardMaterial({
    color: 0x99e0ff, emissive: 0x4cc4ff, emissiveIntensity: 2.8, roughness: 0.15,
  });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xff2820, emissive: 0xff2218, emissiveIntensity: 4.5,
  });

  // Wide Sapporo Station / Stellar Place Podium
  const station = new THREE.Mesh(new THREE.BoxGeometry(15.5, 4.0, 5.8), bldgMats[0]);
  station.position.y = 2.0;
  station.castShadow = station.receiveShadow = true;
  g.add(station);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.25, 0.9), haloMat);
  canopy.position.set(0, 1.05, 3.15);
  g.add(canopy);

  // Soaring JR Tower (173m -> 19.2 units!)
  const jr = new THREE.Mesh(new THREE.BoxGeometry(4.4, 19.2, 4.0), glassMat);
  jr.position.set(3.2, 9.6, -0.3);
  jr.castShadow = true;
  g.add(jr);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(4.56, 0.62, 4.16), haloMat);
  crown.position.set(3.2, 18.6, -0.3);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.75, 3.0), snowMat);
  roof.position.set(3.2, 19.55, -0.3);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), beaconMat);
  beacon.position.set(3.2, 20.15, -0.3);
  g.add(crown, roof, beacon);

  // Flanking modern Sapporo Station glass tower
  const westTower = new THREE.Mesh(new THREE.BoxGeometry(3.6, 13.5, 3.4), bldgMats[3]);
  westTower.position.set(-4.8, 6.75, 0.4);
  westTower.castShadow = true;
  const westCrown = new THREE.Mesh(new THREE.BoxGeometry(3.72, 0.28, 3.52), haloMat);
  westCrown.position.set(-4.8, 13.6, 0.4);
  g.add(westTower, westCrown);

  return g;
}

// ==================== SUSUKINO CORNER NEON LANDMARK ====================
function buildSusukinoCorner(bldgMat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 7.2, 4.6), bldgMat);
  body.position.y = 3.6;
  body.castShadow = body.receiveShadow = true;
  g.add(body);

  // Iconic Glowing Susukino Intersection Neon Billboard!
  const billboardTex = createSusukinoSignTexture('すすきの', '#081838', '#33c8ff', false);
  const bbMat = new THREE.MeshStandardMaterial({
    map: billboardTex, emissive: 0xffffff, emissiveMap: billboardTex, emissiveIntensity: 2.1, roughness: 0.2,
  });
  const bb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, 4.2), bbMat);
  bb.position.set(2.4, 5.2, 0);
  g.add(bb);

  // Iconic Concentric Neon Rings Emblem on the upper facade
  const ring1 = new THREE.Mesh(
    new THREE.TorusGeometry(1.35, 0.14, 10, 28),
    new THREE.MeshStandardMaterial({ color: 0x35d6ff, emissive: 0x1cb8ff, emissiveIntensity: 3.4 })
  );
  ring1.rotation.y = Math.PI / 2;
  ring1.position.set(2.48, 2.75, 0);
  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(0.82, 0.12, 10, 24),
    new THREE.MeshStandardMaterial({ color: 0xffc438, emissive: 0xffa818, emissiveIntensity: 3.6 })
  );
  ring2.rotation.y = Math.PI / 2;
  ring2.position.set(2.52, 2.75, 0);
  g.add(ring1, ring2);

  // Rooftop magenta neon crown
  const crown = new THREE.Mesh(
    new THREE.BoxGeometry(4.8, 0.3, 4.8),
    new THREE.MeshStandardMaterial({ color: 0xff3da8, emissive: 0xff1e92, emissiveIntensity: 3.0 })
  );
  crown.position.y = 7.35;
  g.add(crown);

  const glow = new THREE.PointLight(0xff42aa, 26, 18, 1.5);
  glow.position.set(3.5, 4.5, 0);
  g.add(glow);

  return g;
}

// ==================== DISPLACED SNOW-CAPPED MOUNTAINS (藻岩山・手稲山) ====================
function buildMountains() {
  const segs = 128;
  const size = 280;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  function mountainHeight(x, z) {
    const westWall = Math.max(0, Math.min(1, (-x - 46) / 56));
    const swMoiwa = Math.exp(-((x + 76) ** 2 / 900 + (z - 36) ** 2 / 780)) * 31.0;
    const okura = Math.exp(-((x + 84) ** 2 / 780 + (z + 8) ** 2 / 740)) * 24.5;
    const teine = Math.exp(-((x + 102) ** 2 / 1600 + (z + 64) ** 2 / 1600)) * 42.0;
    const sWall = Math.max(0, Math.min(1, (z - 54) / 55));
    const ridgeW = (westWall * westWall * (3 - 2 * westWall)) * (13 + 28 * fbm2(x * 0.022 + 5.1, z * 0.022 + 2.3));
    const ridgeS = (sWall * sWall * (3 - 2 * sWall)) * (7 + 17 * fbm2(x * 0.025, z * 0.025));
    let h = Math.max(ridgeW, ridgeS) + swMoiwa + okura + teine;
    if (h > 0.3) {
      h += (fbm2(x * 0.075, z * 0.075) - 0.45) * Math.min(h * 0.38, 7.5);
    }
    const cityDist = Math.hypot(x * 0.85, z * 0.9);
    const basin = Math.max(0, Math.min(1, (cityDist - 46) / 22));
    const smoothBasin = basin * basin * (3 - 2 * basin);
    return Math.max(-0.08, h * smoothBasin - 0.08);
  }

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) - 22; // Shift slightly west to cover horizon
    const z = pos.getZ(i);
    const h = mountainHeight(x, z);
    pos.setXYZ(i, x, h, z);
  }
  geo.computeVertexNormals();

  const norm = geo.attributes.normal;
  const colSnow = new THREE.Color(0xe6effa);
  const colPine = new THREE.Color(0x16222c);
  const colRock = new THREE.Color(0x2c3442);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const ny = norm.getY(i);
    if (y < 0.4) {
      tmp.copy(colSnow);
    } else {
      const snowMix = Math.max(0, Math.min(1, (y - 3.5) / 14 + (ny - 0.52) * 1.65));
      tmp.copy(ny < 0.6 ? colRock : colPine).lerp(colSnow, snowMix);
    }
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.02,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;

  // Mt. Moiwa Summit Ropeway Observatory Glow
  const moiwaY = mountainHeight(-76, 36);
  const summitGroup = new THREE.Group();
  const obs = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.5, 2.6),
    new THREE.MeshStandardMaterial({ color: 0xffe9b5, emissive: 0xffb84d, emissiveIntensity: 2.6 })
  );
  obs.position.set(-76, moiwaY + 0.8, 36);
  const ant = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff3828, emissive: 0xff2a1c, emissiveIntensity: 4.5 })
  );
  ant.position.set(-76, moiwaY + 2.8, 36);
  summitGroup.add(obs, ant);

  return { mesh, summitGroup, mountainHeight };
}

// ==================== MAIN EXPORT: BUILD SAPPORO CITY ====================
export function createSapporoCity(scene, snowBumpMap) {
  const rng = mulberry32(202602);
  const group = new THREE.Group();

  // Shared Snow Ground Material
  const snowMat = new THREE.MeshStandardMaterial({
    color: 0xbccce0,
    roughness: 0.78,
    metalness: 0.02,
    bumpMap: snowBumpMap,
    bumpScale: 0.06,
  });

  // 1. Flat Snow City Base + Displaced Mountains
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(170, 170), snowMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const mountains = buildMountains();
  group.add(mountains.mesh, mountains.summitGroup);

  // Mt. Moiwa Ropeway — animated aerial tram + mini cable cars hugging the slope
  const moiwaRopeway = createStylizedMoiwaRopeway(group, mountains.mountainHeight);

  // 2. Wet/Icy Winter Roads (Realistic specular asphalt with lane stripes!)
  const roadTex = createWinterRoadTextures();
  function addRoad(x, z, w, l, horizontal) {
    const map = roadTex.map.clone();
    const rMap = roadTex.roughnessMap.clone();
    map.needsUpdate = rMap.needsUpdate = true;
    const repY = (horizontal ? w : l) / 8;
    map.repeat.set(1, repY);
    rMap.repeat.set(1, repY);
    const mat = new THREE.MeshStandardMaterial({
      map,
      roughnessMap: rMap,
      roughness: 0.9,
      metalness: 0.14,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(horizontal ? l : w, horizontal ? w : l), mat);
    m.rotation.x = -Math.PI / 2;
    if (horizontal) m.rotation.z = Math.PI / 2;
    m.position.set(x, 0.04, z);
    m.receiveShadow = true;
    group.add(m);
  }

  // Odori flanking avenues (wider Odori Park z ∈ [-6.5, +6.5]!)
  addRoad(-15, -7.6, 2.5, 98, true);
  addRoad(-15,  7.6, 2.5, 98, true);
  for (const z of [-16.5, -26.5, 13.5, 22.0, 31.0]) {
    addRoad(-10, z, 2.3, 92, true);
  }
  for (const x of [-47, -33, -19, -2.5, 8.2, 16.5, 21.5]) {
    addRoad(x, 0, 2.5, 88, false);
  }

  // 3. Reflective Sosei River (創成川) at x = 19.0
  const riverMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b1c36,
    roughness: 0.12,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
  const river = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 90), riverMat);
  river.rotation.x = -Math.PI / 2;
  river.position.set(19.0, 0.05, 0);
  river.receiveShadow = true;
  group.add(river);

  // Sosei River warm glowing promenade streetlamps
  const lampPostMat = new THREE.MeshStandardMaterial({ color: 0x252b36, metalness: 0.6, roughness: 0.4 });
  const warmBulb = new THREE.MeshStandardMaterial({
    color: 0xffe4a8, emissive: 0xffb848, emissiveIntensity: 3.4,
  });
  for (let z = -34; z <= 34; z += 5.5) {
    for (const lx of [17.5, 20.5]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.5, 6), lampPostMat);
      pole.position.set(lx, 0.75, z);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), warmBulb);
      bulb.position.set(lx, 1.55, z);
      group.add(pole, bulb);
    }
  }

  // 4. Odori Park Snowy Boulevard & White Illumination Avenue Trees
  const parkBase = new THREE.Mesh(new THREE.BoxGeometry(62, 0.12, 12.2), snowMat);
  parkBase.position.set(-18, 0.05, 0);
  parkBase.receiveShadow = true;
  group.add(parkBase);

  // White Illumination Snow-Laden Spruce Trees + Fairy Lights flanking Odori Park
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x30241c, roughness: 0.95 });
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x1c382c, roughness: 0.85 });
  const illumiMats = [
    new THREE.MeshStandardMaterial({ color: 0x55ccff, emissive: 0x2299ff, emissiveIntensity: 3.6 }),
    new THREE.MeshStandardMaterial({ color: 0xffd86b, emissive: 0xffaa22, emissiveIntensity: 3.6 }),
    new THREE.MeshStandardMaterial({ color: 0xb870ff, emissive: 0x8a3dff, emissiveIntensity: 3.6 }),
  ];

  for (let x = -46; x <= 7.5; x += 3.8) {
    if (Math.abs(x - (-2.5)) < 1.9 || Math.abs(x - (-19)) < 1.9 || Math.abs(x - (-33)) < 1.9) continue;
    for (const side of [-1, 1]) {
      const tz = side * 5.25;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 0.8, 6), trunkMat);
      trunk.position.set(x, 0.45, tz);
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.8, 7), pineMat);
      c1.position.set(x, 1.55, tz);
      c1.castShadow = true;
      const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.25, 7), snowMat);
      c2.position.set(x, 2.25, tz);
      c2.castShadow = true;
      group.add(trunk, c1, c2);

      // Fairy light orbs draped in the tree
      const lm = illumiMats[Math.abs(Math.floor(x + side)) % illumiMats.length];
      for (let k = 0; k < 4; k++) {
        const a = k * 1.57 + x;
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), lm);
        orb.position.set(x + Math.cos(a) * (0.62 - k * 0.1), 1.15 + k * 0.42, tz + Math.sin(a) * (0.62 - k * 0.1));
        group.add(orb);
      }

      // Warm Boulevard Street Lamp
      if (Math.abs(Math.round(x)) % 2 === 0) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.85, 6), lampPostMat);
        pole.position.set(x + 1.6, 0.96, side * 5.95);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), warmBulb);
        bulb.position.set(x + 1.6, 1.92, side * 5.95);
        group.add(pole, bulb);
      }
    }
  }

  // Grand White Illumination Symbol Tree near Nishi 2-chome (x = 2.8, z = 0)
  const symBase = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.4, 12), snowMat);
  symBase.position.set(2.8, 0.25, 0);
  const symTree = new THREE.Mesh(
    new THREE.ConeGeometry(1.25, 4.0, 10),
    new THREE.MeshStandardMaterial({ color: 0xffe49c, emissive: 0xffb338, emissiveIntensity: 2.2, roughness: 0.35 })
  );
  symTree.position.set(2.8, 2.4, 0);
  const symStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), warmBulb);
  symStar.position.set(2.8, 4.65, 0);
  group.add(symBase, symTree, symStar);

  // 5. Building PBR Materials (4 distinct procedural architectural variants!)
  const bldgMats = [0, 1, 2, 3].map(v => {
    const tex = createBuildingTextureSet(v);
    return new THREE.MeshStandardMaterial({
      map: tex.map,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: tex.emissiveMap,
      emissiveIntensity: 1.35,
      roughnessMap: tex.roughnessMap,
      roughness: 0.95,
      metalness: v === 2 ? 0.45 : 0.18,
    });
  });

  // 6. Iconic Landmarks
  const tvClock = createTVTowerClockTexture();
  const tvTower = buildTVTower(tvClock.texture);
  tvTower.group.position.set(12.2, 0, 0);
  group.add(tvTower.group);

  const clockTower = buildClockTower(snowMat);
  clockTower.position.set(11.6, 0, -12.0);
  group.add(clockTower);

  const redBrick = buildRedBrickOffice(snowMat);
  redBrick.position.set(-11.2, 0, -21.5);
  group.add(redBrick);

  const jrTower = buildJRTower(bldgMats, snowMat);
  jrTower.position.set(-2.5, 0, -35.5);
  group.add(jrTower);

  const susukinoCorner = buildSusukinoCorner(bldgMats[1]);
  susukinoCorner.position.set(-6.4, 0, 18.0);
  group.add(susukinoCorner);

  // 7. Authentic Susukino Japanese Neon Signboards!
  const signTexts = [
    ['ラーメン', '#28070f', '#ff3b3b'],
    ['ジンギスカン', '#241404', '#ff9b1c'],
    ['雪まつり', '#061c36', '#33d4ff'],
    ['北海道', '#1b0830', '#d84dff'],
    ['氷の祭典', '#04262b', '#2bffc8'],
    ['札幌夜景', '#2e0820', '#ff3c9c'],
  ];
  const signMats = signTexts.map(([txt, bg, fg]) => {
    const t = createSusukinoSignTexture(txt, bg, fg, true);
    return new THREE.MeshStandardMaterial({
      map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 2.0, roughness: 0.2,
    });
  });

  // 8. Procedural Sapporo City Blocks (300+ InstancedMesh PBR Buildings + Snow Caps!)
  const roadXs = [-47, -33, -19, -2.5, 8.2, 16.5, 19.0, 21.5];
  const roadZs = [-26.5, -16.5, -7.6, 7.6, 13.5, 22.0, 31.0];
  const reserved = [
    { x: 12.2, z: 0, r: 5.8 },
    { x: 11.6, z: -12.0, r: 4.5 },
    { x: -11.2, z: -21.5, r: 6.8 },
    { x: -2.5, z: -35.5, r: 9.0 },
    { x: -6.4, z: 18.0, r: 4.2 },
  ];

  const buckets = [[], [], [], []];
  const roofCaps = [];
  const signPlacements = [];

  for (let gx = -54; gx <= 40; gx += 4.7) {
    for (let gz = -42; gz <= 40; gz += 4.9) {
      const bx = gx + (rng() - 0.5) * 1.15;
      const bz = gz + (rng() - 0.5) * 1.15;

      // Clear Odori Park Snow Festival corridor
      if (Math.abs(bz) < 9.2 && bx > -52 && bx < 16.5) continue;
      if (Math.abs(bx - 19.0) < 3.4) continue;
      if (roadXs.some(rx => Math.abs(bx - rx) < 2.35)) continue;
      if (roadZs.some(rz => Math.abs(bz - rz) < 2.35)) continue;
      if (reserved.some(r => Math.hypot(bx - r.x, bz - r.z) < r.r)) continue;

      const distCenter = Math.hypot(bx * 0.85, bz * 0.9);
      const density = Math.exp(-distCenter * distCenter * 0.0005);
      if (rng() > density * 0.95 + 0.14) continue;

      const bw = 2.2 + rng() * 1.9;
      const bd = 2.2 + rng() * 1.9;
      let bh = (2.4 + Math.pow(rng(), 1.55) * 8.6) * (0.45 + 0.78 * density);
      if (Math.abs(bx + 2.5) < 12 && bz < -9 && bz > -38) bh *= 1.38;
      const isSusukino = bx > -16 && bx < 13 && bz > 11 && bz < 34;
      if (isSusukino) bh = Math.max(3.6, bh * 1.08);

      const vIdx = Math.floor(rng() * 4);
      buckets[vIdx].push({ bx, bz, bw, bh, bd });
      roofCaps.push({ bx, bz, bw: bw * 0.96, by: bh + 0.08, bd: bd * 0.96 });

      if (isSusukino && rng() < 0.72) {
        const sIdx = Math.floor(rng() * signMats.length);
        const sideX = (bx < -2.5 ? 1 : -1) * (bw * 0.5 + 0.18);
        const sh = Math.min(bh * 0.65, 2.2 + rng() * 2.1);
        signPlacements.push({
          x: bx + sideX,
          y: 1.4 + sh * 0.5 + rng() * Math.max(0.2, bh - sh - 1.5),
          z: bz + (rng() - 0.5) * bd * 0.5,
          h: sh,
          sIdx,
        });
      }
    }
  }

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();

  buckets.forEach((items, vIdx) => {
    if (!items.length) return;
    const im = new THREE.InstancedMesh(unitBox, bldgMats[vIdx], items.length);
    im.castShadow = true;
    im.receiveShadow = true;
    items.forEach((it, idx) => {
      dummy.position.set(it.bx, it.bh * 0.5, it.bz);
      dummy.scale.set(it.bw, it.bh, it.bd);
      dummy.updateMatrix();
      im.setMatrixAt(idx, dummy.matrix);
    });
    group.add(im);
  });

  // Snow-blanketed building rooftops
  if (roofCaps.length) {
    const capIM = new THREE.InstancedMesh(unitBox, snowMat, roofCaps.length);
    capIM.receiveShadow = true;
    roofCaps.forEach((c, idx) => {
      dummy.position.set(c.bx, c.by, c.bz);
      dummy.scale.set(c.bw, 0.16, c.bd);
      dummy.updateMatrix();
      capIM.setMatrixAt(idx, dummy.matrix);
    });
    group.add(capIM);
  }

  // Mount Japanese Neon Signboards in Susukino
  for (const sp of signPlacements) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, sp.h, 0.85), signMats[sp.sIdx]);
    m.position.set(sp.x, sp.y, sp.z);
    group.add(m);
  }

  // 9. Animated Traffic (InstancedMesh Headlights/Taillights) + Detailed Sapporo Streetcar (市電)
  const lanes = [
    { axis: 'x', pos: -8.0, dir: -1, min: -50, max: 30, count: 14 },
    { axis: 'x', pos: -7.2, dir:  1, min: -50, max: 30, count: 14 },
    { axis: 'x', pos:  7.2, dir: -1, min: -50, max: 30, count: 14 },
    { axis: 'x', pos:  8.0, dir:  1, min: -50, max: 30, count: 14 },
    { axis: 'x', pos: 21.6, dir: -1, min: -34, max: 24, count: 10 },
    { axis: 'x', pos: 22.4, dir:  1, min: -34, max: 24, count: 10 },
    { axis: 'z', pos: -2.9, dir:  1, min: -34, max: 11, count: 10 },
    { axis: 'z', pos: -2.1, dir: -1, min: -34, max: 11, count: 10 },
    { axis: 'z', pos: 16.1, dir:  1, min: -34, max: 34, count: 12 },
    { axis: 'z', pos: 21.9, dir: -1, min: -34, max: 34, count: 12 },
  ];
  const cars = [];
  for (const l of lanes) {
    for (let i = 0; i < l.count; i++) {
      cars.push({ ...l, t: rng(), speed: 0.028 + rng() * 0.022, y: 0.04 });
    }
  }
  const carFleet = createDetailedCarFleet(group, cars, 0.145);

  // Detailed Sapporo Streetcar (Polaris Low-Floor Tram) gliding along Minami 1-jo (z = 13.5)
  const tram = new THREE.Group();
  const tramShell = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.68, 0.72),
    new THREE.MeshStandardMaterial({ color: 0x1c4534, metalness: 0.5, roughness: 0.28 })
  );
  tramShell.position.y = 0.42;
  const tramWin = new THREE.Mesh(
    new THREE.BoxGeometry(2.15, 0.28, 0.75),
    new THREE.MeshStandardMaterial({ color: 0xffe6a8, emissive: 0xffc055, emissiveIntensity: 2.8 })
  );
  tramWin.position.y = 0.50;
  const tramRoof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.66), snowMat);
  tramRoof.position.y = 0.80;
  const tramHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.16, 0.44),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c2, emissiveIntensity: 4.5 })
  );
  tramHead.position.set(1.32, 0.30, 0);
  const tramLight = new THREE.PointLight(0xffe099, 14, 10, 1.8);
  tramLight.position.set(1.8, 0.55, 0);
  tram.add(tramShell, tramWin, tramRoof, tramHead, tramLight);
  tram.position.set(0, 0.02, 13.5);
  group.add(tram);

  scene.add(group);

  let lastClockStr = '';

  return {
    group,
    update(time, nightFactor, clockStr) {
      // Update live Sapporo TV Tower LED clock when time-of-day changes
      if (clockStr !== lastClockStr) {
        lastClockStr = clockStr;
        tvClock.update(clockStr);
      }

      // Pulse TV Tower aviation beacon & adjust night building window glow
      tvTower.beaconMat.emissiveIntensity = 3.0 + 3.2 * (0.5 + 0.5 * Math.sin(time * 3.8));
      tvTower.towerLight.intensity = 10 + 32 * nightFactor;
      const winEm = 0.25 + 1.45 * nightFactor;
      for (const bm of bldgMats) bm.emissiveIntensity = winEm;

      // Update detailed moving 3D cars
      carFleet.update(time, nightFactor);

      // Glide Sapporo Streetcar along Minami 1-jo
      const tramU = ((time * 0.026) % 1 + 1) % 1;
      tram.position.x = -38 + tramU * 52;

      // Animate Mt. Moiwa Ropeway cabins along the mountain cable
      moiwaRopeway.update(time, nightFactor);
    },
  };
}
