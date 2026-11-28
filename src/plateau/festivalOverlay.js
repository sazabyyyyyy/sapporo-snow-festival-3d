import * as THREE from 'three';
import {
  buildSnowCastle,
  buildSnowCathedral,
  buildSnowDragon,
  createLightBeam,
  createLightingTruss,
  applyCastleProjectionUVs,
  createFestivalMaterials,
} from '../snowSculptures.js';
import {
  createTVTowerClockTexture,
  createSusukinoSignTexture,
} from '../textures.js';
import { createDetailedCarFleet } from '../carFleet.js';
import { ODORI_ROT_Y, SAPPORO_POINTS } from './geo.js';

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

/**
 * Real-scale 147.2m Sapporo TV Tower landmark overlay at Odori Nishi 1-chome.
 * Provides the unmistakable illuminated red-white steel lattice, live LED digital clock (~65m),
 * warm glowing observation deck (90m), and pulsing aviation beacon (147.2m).
 */
function buildRealScaleTVTower(clockTex) {
  const g = new THREE.Group();
  const redSteel = new THREE.MeshStandardMaterial({
    color: 0xd92d26,
    emissive: 0x7a1610,
    emissiveIntensity: 0.85,
    roughness: 0.42,
    metalness: 0.65,
  });
  const whiteSteel = new THREE.MeshStandardMaterial({
    color: 0xeef3fa,
    emissive: 0x425068,
    emissiveIntensity: 0.40,
    roughness: 0.45,
    metalness: 0.5,
  });
  const warmGlass = new THREE.MeshStandardMaterial({
    color: 0xffe09c,
    emissive: 0xffb84d,
    emissiveIntensity: 2.5,
    roughness: 0.15,
    metalness: 0.2,
  });

  // 4 Tapered Lattice Steel Legs + Cross Bracing (y = 18m .. 85m, sitting cleanly atop the podium)
  const tiers = [
    { y: 16, r: 15.5 },
    { y: 38, r: 10.6 },
    { y: 60, r: 7.4 },
    { y: 80, r: 6.2 },
  ];
  for (let t = 0; t < tiers.length - 1; t++) {
    const a = tiers[t], b = tiers[t + 1];
    for (let i = 0; i < 4; i++) {
      const sx = (i === 0 || i === 3) ? -1 : 1;
      const sz = (i < 2) ? -1 : 1;
      const p0 = [sx * a.r, a.y, sz * a.r];
      const p1 = [sx * b.r, b.y, sz * b.r];
      addStrut(g, p0, p1, 0.92, redSteel);

      const j = (i + 1) % 4;
      const nx = (j === 0 || j === 3) ? -1 : 1;
      const nz = (j < 2) ? -1 : 1;
      const q0 = [nx * a.r, a.y, nz * a.r];
      const q1 = [nx * b.r, b.y, nz * b.r];
      addStrut(g, p0, q1, 0.46, redSteel);
      addStrut(g, q0, p1, 0.46, redSteel);
      addStrut(g, p1, q1, 0.62, whiteSteel);
    }
  }

  // Illuminated central elevator shaft
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(5.8, 66, 5.8),
    new THREE.MeshStandardMaterial({ color: 0xf08c4f, emissive: 0xd45822, emissiveIntensity: 0.95, roughness: 0.5 })
  );
  core.position.y = 50;
  g.add(core);

  // Iconic Live Digital LED Clock (y = 66m .. 75m, facing West down Odori Park + all 4 sides)
  const clockBox = new THREE.Mesh(
    new THREE.BoxGeometry(16.2, 8.6, 16.2),
    new THREE.MeshStandardMaterial({ color: 0x121722, roughness: 0.6 })
  );
  clockBox.position.y = 70.5;
  g.add(clockBox);

  const clockFaceMat = new THREE.MeshStandardMaterial({
    map: clockTex,
    emissive: 0xffffff,
    emissiveMap: clockTex,
    emissiveIntensity: 2.3,
    roughness: 0.25,
  });
  const faceGeo = new THREE.PlaneGeometry(14.6, 7.2);
  const dirs = [
    { pos: [-8.25, 70.5, 0], rotY: -Math.PI / 2 },
    { pos: [ 8.25, 70.5, 0], rotY:  Math.PI / 2 },
    { pos: [0, 70.5,  8.25], rotY: 0 },
    { pos: [0, 70.5, -8.25], rotY: Math.PI },
  ];
  for (const d of dirs) {
    const f = new THREE.Mesh(faceGeo, clockFaceMat);
    f.position.set(...d.pos);
    f.rotation.y = d.rotY;
    g.add(f);
  }

  // Observation Deck (y = 84m .. 96m)
  const deckBot = new THREE.Mesh(new THREE.BoxGeometry(23, 2.4, 23), whiteSteel);
  deckBot.position.y = 85.2;
  const deckGlass = new THREE.Mesh(new THREE.BoxGeometry(21.4, 6.2, 21.4), warmGlass);
  deckGlass.position.y = 89.5;
  const deckTop = new THREE.Mesh(new THREE.BoxGeometry(23.5, 2.4, 23.5), redSteel);
  deckTop.position.y = 93.8;
  g.add(deckBot, deckGlass, deckTop);

  // Upper Lattice Spire & Pulsing Red Aviation Beacon (up to real 147.2m!)
  const uTiers = [
    { y: 95, r: 5.5 },
    { y: 114, r: 2.9 },
    { y: 130, r: 1.2 },
  ];
  for (let t = 0; t < uTiers.length - 1; t++) {
    const a = uTiers[t], b = uTiers[t + 1];
    const mat = t === 0 ? whiteSteel : redSteel;
    for (let i = 0; i < 4; i++) {
      const sx = (i === 0 || i === 3) ? -1 : 1;
      const sz = (i < 2) ? -1 : 1;
      addStrut(g, [sx * a.r, a.y, sz * a.r], [sx * b.r, b.y, sz * b.r], 0.45, mat);
    }
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 17, 8), whiteSteel);
  mast.position.y = 138.5;
  g.add(mast);

  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xff2a20,
    emissive: 0xff2218,
    emissiveIntensity: 5.5,
  });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 10), beaconMat);
  beacon.position.y = 147.2;
  g.add(beacon);

  const towerLight = new THREE.PointLight(0xff6b38, 900, 180, 1.5);
  towerLight.position.set(0, 56, 0);
  g.add(towerLight);

  return { group: g, beaconMat, towerLight };
}

/**
 * Places the entire Sapporo Snow Festival at true 1:1 meter scale inside the real PLATEAU street grid:
 *  - Odori Nishi 4-chome: Giant Snow Castle Keep + Live Projection Mapping
 *  - Odori Nishi 5-chome: Gothic Snow Cathedral
 *  - Odori Nishi 7-chome: Winged Snow Dragon & Crystal Ice Spire
 *  - Odori Nishi 2-chome: White Illumination Symbol Tree
 *  - Odori Nishi 6-chome: Citizen Snow Sculptures & Yatai Food Stalls
 *  - Odori Park Avenues: Snow-laden Illumination Trees & Warm Streetlamps
 *  - Odori Nishi 1-chome: Sapporo TV Tower live clock & spire overlay
 *  - Ekimae-dori / Susukino: Susukino Ice World, Neon Sign accents, Sapporo Streetcar & Traffic
 */
export function createPlateauFestivalOverlay(scene, snowBumpMap, projectionTex) {
  // Grid-aligned container anchored at Sapporo TV Tower, rotated by ODORI_ROT_Y (+9.7 deg)
  const gridGroup = new THREE.Group();
  gridGroup.name = 'SNOW_FESTIVAL_OVERLAY';
  gridGroup.position.copy(SAPPORO_POINTS.tvTower);
  gridGroup.rotation.y = ODORI_ROT_Y;
  scene.add(gridGroup);

  const { snowMat, projSnowMat, iceMat } = createFestivalMaterials(snowBumpMap, projectionTex);
  snowMat.bumpScale = 0.14;
  projSnowMat.bumpScale = 0.12;

  // Winter-only Snow Festival container (automatically hidden in Spring / Summer / Autumn!)
  const winterOnlyGroup = new THREE.Group();
  gridGroup.add(winterOnlyGroup);

  // Monumental real-world Snow Festival scale (~28m wide x ~20m tall)
  const SCULPT_SCALE = 3.2;

  // ==================== 1. GIANT SNOW SCULPTURES ALONG ODORI PARK ====================
  // Odori Nishi 4-chome (x = -393m) — Grand Snow Castle with live Projection Mapping
  const castle = buildSnowCastle(snowMat, projSnowMat, iceMat);
  applyCastleProjectionUVs(castle, projSnowMat);
  castle.scale.setScalar(SCULPT_SCALE);
  castle.position.set(-393, 0.25, 0);
  winterOnlyGroup.add(castle);

  // Odori Nishi 5-chome (x = -522m) — Gothic Snow Cathedral
  const cathedral = buildSnowCathedral(snowMat, iceMat);
  cathedral.scale.setScalar(SCULPT_SCALE);
  cathedral.position.set(-522, 0.25, 0);
  winterOnlyGroup.add(cathedral);

  // Odori Nishi 7-chome (x = -778m) — Winged Snow Dragon & Ice Spire
  const dragon = buildSnowDragon(snowMat, iceMat);
  dragon.scale.setScalar(SCULPT_SCALE);
  dragon.position.set(-778, 0.25, 0);
  winterOnlyGroup.add(dragon);

  // Volumetric Stage Spotlight Beams, Lighting Trusses & Stage Lights for the 3 Giant Sculptures
  const beams = [];
  const stageLights = [];
  const rigs = [
    { x: -366, targetX: -392, targetY: 11.5, cols: [0x4cc9ff, 0xffb347] },
    { x: -496, targetX: -521, targetY: 12.0, cols: [0x8c5cff, 0x38d8ff] },
    { x: -752, targetX: -777, targetY: 10.5, cols: [0x2ee8ff, 0xff5ca8] },
  ];
  for (const r of rigs) {
    for (let s = 0; s < 2; s++) {
      const tz = s === 0 ? -13.5 : 13.5;
      const truss = createLightingTruss(0, 0, 2.8);
      truss.scale.setScalar(3.2);
      truss.position.set(r.x, 0.25, tz);
      winterOnlyGroup.add(truss);

      const beam = createLightBeam(
        new THREE.Vector3(r.x, 9.2, tz),
        new THREE.Vector3(r.targetX, r.targetY, s === 0 ? -5.0 : 5.0),
        8.2,
        r.cols[s],
        0.15
      );
      winterOnlyGroup.add(beam);
      beams.push({ mesh: beam, baseColor: new THREE.Color(r.cols[s]), phase: r.x * 0.05 + s * 2 });
    }
    const ptA = new THREE.PointLight(r.cols[0], 340, 85, 1.6);
    ptA.position.set(r.x + 2, 13, -9);
    const ptB = new THREE.PointLight(r.cols[1], 300, 85, 1.6);
    ptB.position.set(r.x + 2, 12, 9);
    winterOnlyGroup.add(ptA, ptB);
    stageLights.push(ptA, ptB);
  }

  // ==================== 2. ODORI WHITE ILLUMINATION SYMBOL TREE & AVENUE ====================
  // Grand Symbol Tree at Odori Nishi 2-chome (x = -135m)
  const warmBulb = new THREE.MeshStandardMaterial({
    color: 0xffe4a8,
    emissive: 0xffb848,
    emissiveIntensity: 3.6,
  });
  const symBase = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 6.2, 1.4, 14), snowMat);
  symBase.position.set(-135, 0.9, 0);
  const symTree = new THREE.Mesh(
    new THREE.ConeGeometry(4.6, 15.5, 12),
    new THREE.MeshStandardMaterial({ color: 0xffe49c, emissive: 0xffb338, emissiveIntensity: 2.3, roughness: 0.35 })
  );
  symTree.position.set(-135, 9.2, 0);
  const symStar = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), warmBulb);
  symStar.position.set(-135, 17.8, 0);
  const symLight = new THREE.PointLight(0xffbe55, 280, 75, 1.6);
  symLight.position.set(-135, 11, 0);
  winterOnlyGroup.add(symBase, symTree, symStar, symLight);

  // Odori Nishi 3-chome Skating Rink / Blue Crystal Illumination Plaza (x = -264m)
  const rinkIce = new THREE.Mesh(
    new THREE.BoxGeometry(34, 0.22, 20),
    new THREE.MeshPhysicalMaterial({
      color: 0x99dcff,
      emissive: 0x165aa8,
      emissiveIntensity: 0.45,
      roughness: 0.08,
      metalness: 0.12,
      clearcoat: 1.0,
    })
  );
  rinkIce.position.set(-264, 0.36, 0);
  const rinkRim = new THREE.Mesh(
    new THREE.BoxGeometry(35.2, 0.45, 21.2),
    new THREE.MeshStandardMaterial({ color: 0x6ed4ff, emissive: 0x26a8ff, emissiveIntensity: 1.9 })
  );
  rinkRim.position.set(-264, 0.25, 0);
  winterOnlyGroup.add(rinkRim, rinkIce);

  // Odori Park Seasonal Avenue Trees (Snow Spruce in Winter, Cherry Blossoms in Spring, Lush Green in Summer, Autumn Foliage in Fall!)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x30241c, roughness: 0.95 });
  const canopyBaseMat = new THREE.MeshStandardMaterial({ color: 0x1c382c, roughness: 0.85 });
  const canopyTopMat = new THREE.MeshStandardMaterial({ color: 0xb6c8de, roughness: 0.78 });
  const lampPostMat = new THREE.MeshStandardMaterial({ color: 0x252b36, metalness: 0.6, roughness: 0.4 });
  const illumiMats = [
    new THREE.MeshStandardMaterial({ color: 0x55ccff, emissive: 0x2299ff, emissiveIntensity: 3.6 }),
    new THREE.MeshStandardMaterial({ color: 0xffd86b, emissive: 0xffaa22, emissiveIntensity: 3.6 }),
    new THREE.MeshStandardMaterial({ color: 0xb870ff, emissive: 0x8a3dff, emissiveIntensity: 3.6 }),
  ];

  const crossStreets = [-68, -198, -328, -458, -586, -714, -842];
  const treeCoords = [];
  const lampCoords = [];

  for (let x = -920; x <= -28; x += 22) {
    if (crossStreets.some(cx => Math.abs(x - cx) < 16)) continue;
    for (const side of [-1, 1]) {
      treeCoords.push({ x, z: side * 25.5 });
      lampCoords.push({ x: x + 9, z: side * 30.5 });
    }
  }
  for (let z = -340; z <= 420; z += 36) {
    lampCoords.push({ x: 97, z }, { x: 127, z });
  }

  const dummy = new THREE.Object3D();
  const trunkIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.42, 2.8, 6), trunkMat, treeCoords.length);
  const cone1IM = new THREE.InstancedMesh(new THREE.ConeGeometry(2.9, 6.4, 7), canopyBaseMat, treeCoords.length);
  const cone2IM = new THREE.InstancedMesh(new THREE.ConeGeometry(2.1, 4.4, 7), canopyTopMat, treeCoords.length);
  cone1IM.castShadow = cone2IM.castShadow = true;

  const orbGroups = [[], [], []];
  treeCoords.forEach((tc, i) => {
    dummy.position.set(tc.x, 1.5, tc.z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    trunkIM.setMatrixAt(i, dummy.matrix);

    dummy.position.set(tc.x, 5.4, tc.z);
    dummy.updateMatrix();
    cone1IM.setMatrixAt(i, dummy.matrix);

    dummy.position.set(tc.x, 7.9, tc.z);
    dummy.updateMatrix();
    cone2IM.setMatrixAt(i, dummy.matrix);

    const b = i % 3;
    for (let k = 0; k < 4; k++) {
      const a = k * 1.57 + tc.x * 0.1;
      const r = 2.15 - k * 0.34;
      orbGroups[b].push([tc.x + Math.cos(a) * r, 3.8 + k * 1.45, tc.z + Math.sin(a) * r]);
    }
  });
  gridGroup.add(trunkIM, cone1IM, cone2IM);

  const orbGeo = new THREE.SphereGeometry(0.36, 6, 6);
  orbGroups.forEach((pts, idx) => {
    const im = new THREE.InstancedMesh(orbGeo, illumiMats[idx], pts.length);
    pts.forEach((p, i) => {
      dummy.position.set(p[0], p[1], p[2]);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    winterOnlyGroup.add(im);
  });

  const poleIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.18, 6.2, 6), lampPostMat, lampCoords.length);
  const bulbIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.48, 8, 8), warmBulb, lampCoords.length);
  lampCoords.forEach((lc, i) => {
    dummy.position.set(lc.x, 3.1, lc.z);
    dummy.updateMatrix();
    poleIM.setMatrixAt(i, dummy.matrix);
    dummy.position.set(lc.x, 6.4, lc.z);
    dummy.updateMatrix();
    bulbIM.setMatrixAt(i, dummy.matrix);
  });
  gridGroup.add(poleIM, bulbIM);

  // ==================== 3. YATAI FOOD STALLS, CITIZEN SCULPTURES & CROWD (WINTER FESTIVAL) ====================
  const tentRoof = new THREE.MeshStandardMaterial({ color: 0xe6edf6, roughness: 0.85 });
  const boothWall = new THREE.MeshStandardMaterial({ color: 0x2d2420, roughness: 0.9 });
  const warmGlow = new THREE.MeshStandardMaterial({ color: 0xffd282, emissive: 0xffa838, emissiveIntensity: 2.6 });
  const lanternRed = new THREE.MeshStandardMaterial({ color: 0xff5a3c, emissive: 0xff3b1f, emissiveIntensity: 2.9 });

  const stallPositions = [
    [-362, -19], [-375, -19], [-362, 19], [-375, 19],
    [-490, -19], [-503, 19], [-625, -19], [-642, -19], [-625, 19], [-642, 19],
  ];
  for (const [sx, sz] of stallPositions) {
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(5.0, 2.8, 3.6), boothWall);
    b1.position.set(sx, 1.5, sz);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.25, 3.8), warmGlow);
    b2.position.set(sx, 2.2, sz);
    const b3 = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.55, 4.3), tentRoof);
    b3.position.set(sx, 3.35, sz);
    winterOnlyGroup.add(b1, b2, b3);
    for (const lx of [-1.6, 0, 1.6]) {
      const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 6), lanternRed);
      lan.position.set(sx + lx, 2.9, sz + (sz < 0 ? 1.95 : -1.95));
      winterOnlyGroup.add(lan);
    }
  }

  for (let i = 0; i < 8; i++) {
    const cx = -636 - (i % 4) * 10;
    const cz = i < 4 ? -9 : 9;
    const ped = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.0, 2.8), snowMat);
    ped.position.set(cx, 0.65, cz);
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 10), snowMat);
    s1.position.set(cx, 1.95, cz);
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.80, 10, 10), snowMat);
    s2.position.set(cx, 3.45, cz);
    ped.castShadow = s1.castShadow = s2.castShadow = true;
    winterOnlyGroup.add(ped, s1, s2);
  }

  const crowdMat = new THREE.MeshStandardMaterial({ color: 0x161b26, roughness: 0.9 });
  const plazas = [
    { xMin: -372, xMax: -344, zSpan: 15, count: 65 },
    { xMin: -502, xMax: -474, zSpan: 14, count: 45 },
    { xMin: -758, xMax: -732, zSpan: 13, count: 38 },
  ];
  let seed = 42;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const totalCrowd = plazas.reduce((s, p) => s + p.count, 0);
  const bodiesIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.24, 0.34, 1.35, 6), crowdMat, totalCrowd);
  const headsIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 6), crowdMat, totalCrowd);
  let cIdx = 0;
  for (const p of plazas) {
    for (let i = 0; i < p.count; i++) {
      const cx = p.xMin + rand() * (p.xMax - p.xMin);
      const cz = (rand() - 0.5) * 2 * p.zSpan;
      const hs = 0.88 + rand() * 0.25;
      dummy.position.set(cx, 0.85 * hs, cz);
      dummy.scale.set(1, hs, 1);
      dummy.updateMatrix();
      bodiesIM.setMatrixAt(cIdx, dummy.matrix);
      dummy.position.set(cx, 1.72 * hs, cz);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      headsIM.setMatrixAt(cIdx, dummy.matrix);
      cIdx++;
    }
  }
  winterOnlyGroup.add(bodiesIM, headsIM);

  // ==================== 4. SAPPORO TV TOWER LIVE OVERLAY (ODORI NISHI 1) ====================
  const tvClock = createTVTowerClockTexture();
  const tvTower = buildRealScaleTVTower(tvClock.texture);
  tvTower.group.position.set(0, 0, 0);
  gridGroup.add(tvTower.group);

  // ==================== 5. SUSUKINO ICE WORLD + NEON ACCENTS (EKIMAE-DORI SOUTH) ====================
  const ledColors = [0x29d4ff, 0xff3da8, 0x3effb4, 0xffb838, 0x7b5cff, 0x45e3ff];
  for (let i = 0; i < 8; i++) {
    const iz = 365 + i * 24;
    const ix = -328;
    const col = ledColors[i % ledColors.length];

    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 1.1, 3.6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: col, emissiveIntensity: 2.3, roughness: 0.25 })
    );
    plinth.position.set(ix, 0.65, iz);
    winterOnlyGroup.add(plinth);

    const iceShape = i % 3 === 0
      ? new THREE.OctahedronGeometry(2.1, 0)
      : i % 3 === 1
        ? new THREE.TorusKnotGeometry(1.3, 0.40, 36, 8)
        : new THREE.IcosahedronGeometry(1.9, 0);
    const iceMesh = new THREE.Mesh(iceShape, iceMat);
    iceMesh.position.set(ix, 3.6, iz);
    iceMesh.scale.set(0.95, 1.35, 0.95);
    winterOnlyGroup.add(iceMesh);

    if (i % 2 === 0) {
      const pt = new THREE.PointLight(col, 140, 48, 1.7);
      pt.position.set(ix, 4.2, iz);
      winterOnlyGroup.add(pt);
    }
  }

  // Authentic Susukino Glowing Japanese Neon Signboards flanking Ekimae-dori!
  const signConfigs = [
    { txt: 'すすきの', bg: '#081838', fg: '#33c8ff', vert: false, x: -346, y: 20, z: 548, w: 1.0, h: 8.5, d: 16.0 },
    { txt: 'ラーメン', bg: '#28070f', fg: '#ff3b3b', vert: true,  x: -345, y: 15, z: 465, w: 0.8, h: 12.0, d: 3.6 },
    { txt: 'ジンギスカン', bg: '#241404', fg: '#ff9b1c', vert: true, x: -311, y: 18, z: 488, w: 0.8, h: 14.0, d: 3.6 },
    { txt: '雪まつり', bg: '#061c36', fg: '#33d4ff', vert: true,  x: -345, y: 16, z: 412, w: 0.8, h: 12.0, d: 3.6 },
    { txt: '氷の祭典', bg: '#04262b', fg: '#2bffc8', vert: true,  x: -311, y: 14, z: 430, w: 0.8, h: 11.5, d: 3.6 },
    { txt: '北海道', bg: '#1b0830', fg: '#d84dff', vert: true,    x: -311, y: 17, z: 536, w: 0.8, h: 12.5, d: 3.8 },
  ];
  for (const sc of signConfigs) {
    const tex = createSusukinoSignTexture(sc.txt, sc.bg, sc.fg, sc.vert);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    });
    const m = new THREE.Mesh(new THREE.BoxGeometry(sc.w, sc.h, sc.d), mat);
    m.position.set(sc.x, sc.y, sc.z);
    gridGroup.add(m);
  }
  const susukinoGlow = new THREE.PointLight(0xff42aa, 420, 120, 1.5);
  susukinoGlow.position.set(-328, 22, 540);
  gridGroup.add(susukinoGlow);

  // ==================== 6. ANIMATED REAL-SCALE TRAFFIC & SAPPORO STREETCAR (市電) ====================
  const lanes = [
    { axis: 'x', pos: -45, dir: -1, min: -920, max: 180, count: 22 },
    { axis: 'x', pos: -39, dir:  1, min: -920, max: 180, count: 22 },
    { axis: 'x', pos:  39, dir: -1, min: -920, max: 180, count: 22 },
    { axis: 'x', pos:  45, dir:  1, min: -920, max: 180, count: 22 },
    { axis: 'x', pos: 580, dir: -1, min: -650, max: 120, count: 16 },
    { axis: 'x', pos: 590, dir:  1, min: -650, max: 120, count: 16 },
    { axis: 'z', pos: -335, dir:  1, min: -680, max: 320, count: 20 },
    { axis: 'z', pos: -321, dir: -1, min: -680, max: 320, count: 20 },
    { axis: 'z', pos:  88, dir:  1, min: -500, max: 520, count: 18 },
    { axis: 'z', pos: 136, dir: -1, min: -500, max: 520, count: 18 },
  ];
  const cars = [];
  for (const l of lanes) {
    for (let i = 0; i < l.count; i++) {
      cars.push({ ...l, t: rand(), speed: 0.015 + rand() * 0.014, y: 0.05 });
    }
  }
  const carFleet = createDetailedCarFleet(gridGroup, cars, 1.0);

  let lastClockStr = '';

  function setSeason(season) {
    const isWinter = season === 'winter';
    winterOnlyGroup.visible = isWinter;

    if (season === 'winter') {
      canopyBaseMat.color.setHex(0x1c382c);
      canopyTopMat.color.setHex(0xc4d5eb);
    } else if (season === 'spring') {
      // Full-bloom Sapporo Odori Park Cherry Blossoms (桜並木)!
      canopyBaseMat.color.setHex(0xf49ec0);
      canopyTopMat.color.setHex(0xffcfe2);
    } else if (season === 'summer') {
      canopyBaseMat.color.setHex(0x1f5c2a);
      canopyTopMat.color.setHex(0x3a8442);
    } else {
      // Vivid Autumn Ginkgo & Maple foliage (紅葉・イチョウ並木)
      canopyBaseMat.color.setHex(0xc4481e);
      canopyTopMat.color.setHex(0xebb02a);
    }
  }

  return {
    group: gridGroup,
    setSeason,
    update(time, nightFactor, clockStr, projEnabled) {
      if (clockStr !== lastClockStr) {
        lastClockStr = clockStr;
        tvClock.update(clockStr);
      }

      tvTower.beaconMat.emissiveIntensity = 3.2 + 3.5 * (0.5 + 0.5 * Math.sin(time * 3.8));
      tvTower.towerLight.intensity = 240 + 780 * nightFactor;

      projSnowMat.emissiveIntensity = projEnabled ? (0.38 + 0.62 * nightFactor) : 0.0;
      const beamVis = Math.max(0.02, nightFactor * 0.22);
      beams.forEach((b, i) => {
        b.mesh.material.uniforms.uOpacity.value = beamVis * (0.85 + 0.15 * Math.sin(time * 1.4 + b.phase));
        if (projEnabled && i < 2) {
          b.mesh.material.uniforms.uColor.value.setHSL((0.56 + time * 0.04 + i * 0.32) % 1, 0.85, 0.62);
        } else {
          b.mesh.material.uniforms.uColor.value.copy(b.baseColor);
        }
      });
      stageLights.forEach((l, i) => {
        l.intensity = (140 + 260 * nightFactor) * (0.9 + 0.1 * Math.sin(time * 1.8 + i));
      });

      // Animate real-scale detailed 3D cars (body, tinted cabin, 4 wheels, twin headlights & taillights)
      carFleet.update(time, nightFactor);
    },
  };
}
