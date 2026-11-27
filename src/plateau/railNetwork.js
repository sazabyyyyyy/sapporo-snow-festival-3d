import * as THREE from 'three';
import { latLonToGround } from './geo.js';
import { RAIL_LINES } from './railData.js';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Creates a crisp Japanese station badge sprite texture on an offscreen Canvas.
 */
function createStationBadgeTexture(title, sub, accentHex, isJR) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 76;
  const ctx = c.getContext('2d');

  const hexStr = '#' + accentHex.toString(16).padStart(6, '0');

  // Rounded dark translucent pill
  ctx.fillStyle = 'rgba(9, 14, 28, 0.84)';
  ctx.strokeStyle = hexStr;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(6, 6, 244, 64, 14);
  ctx.fill();
  ctx.stroke();

  // Left color bar / badge
  ctx.fillStyle = hexStr;
  ctx.beginPath();
  ctx.roundRect(14, 15, 42, 46, 8);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isJR ? 'JR' : sub, 35, 39);

  // Station name
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 66, 39);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds an extruded/ribbon strip geometry along a sampled 3D path (positions + tangents).
 * Faster, cleaner, and flatter than TubeGeometry for railway tracks, viaduct decks, and glowing route ribbons.
 */
function buildRibbonGeometry(samples, halfWidth, yOffset = 0, closedBoxHeight = 0) {
  const n = samples.length;
  const right = new THREE.Vector3();

  if (closedBoxHeight <= 0) {
    // Flat horizontal ribbon
    const positions = new Float32Array(n * 2 * 3);
    const indices = [];
    for (let i = 0; i < n; i++) {
      const { pos, tan } = samples[i];
      right.crossVectors(tan, UP).normalize();
      if (right.lengthSq() < 0.01) right.set(1, 0, 0);

      const i6 = i * 6;
      positions[i6]     = pos.x - right.x * halfWidth;
      positions[i6 + 1] = pos.y + yOffset;
      positions[i6 + 2] = pos.z - right.z * halfWidth;
      positions[i6 + 3] = pos.x + right.x * halfWidth;
      positions[i6 + 4] = pos.y + yOffset;
      positions[i6 + 5] = pos.z + right.z * halfWidth;

      if (i < n - 1) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // 4-sided rectangular cross-section along path (for elevated viaduct decks & subway snow-shelter tunnels)
  const positions = new Float32Array(n * 4 * 3);
  const indices = [];
  for (let i = 0; i < n; i++) {
    const { pos, tan } = samples[i];
    right.crossVectors(tan, UP).normalize();
    if (right.lengthSq() < 0.01) right.set(1, 0, 0);

    const yBot = pos.y + yOffset;
    const yTop = yBot + closedBoxHeight;
    const lx = pos.x - right.x * halfWidth;
    const lz = pos.z - right.z * halfWidth;
    const rx = pos.x + right.x * halfWidth;
    const rz = pos.z + right.z * halfWidth;

    const base = i * 12;
    // 0: top-left, 1: top-right, 2: bot-right, 3: bot-left
    positions[base]      = lx; positions[base + 1]  = yTop; positions[base + 2]  = lz;
    positions[base + 3]  = rx; positions[base + 4]  = yTop; positions[base + 5]  = rz;
    positions[base + 6]  = rx; positions[base + 7]  = yBot; positions[base + 8]  = rz;
    positions[base + 9]  = lx; positions[base + 10] = yBot; positions[base + 11] = lz;

    if (i < n - 1) {
      const a = i * 4;
      const b = a + 4;
      // Top face
      indices.push(a + 0, b + 0, a + 1, a + 1, b + 0, b + 1);
      // Right face
      indices.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
      // Bottom face
      indices.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
      // Left face
      indices.push(a + 3, b + 3, a + 0, a + 0, b + 3, b + 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Evaluates a smooth motion schedule along a line with realistic deceleration, brief station stops,
 * and acceleration between stations, turning around smoothly at both termini.
 */
function buildStationSchedule(curve, stationArcLengths, totalLength, speedMps, dwellSec) {
  // Precompute cumulative travel time at every station along one full outbound run (0 -> totalLength)
  const stops = stationArcLengths.slice().sort((a, b) => a - b);
  const segs = [];
  let tCursor = 0;

  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (i === 0) {
      // Initial dwell at origin terminus
      segs.push({ type: 'dwell', t0: tCursor, t1: tCursor + dwellSec, s0: s, s1: s });
      tCursor += dwellSec;
    } else {
      const prevS = stops[i - 1];
      const dist = Math.max(10, s - prevS);
      // Add slight acceleration/deceleration overhead so short hops feel natural
      const runDur = dist / speedMps + 1.4;
      segs.push({ type: 'run', t0: tCursor, t1: tCursor + runDur, s0: prevS, s1: s });
      tCursor += runDur;
      segs.push({ type: 'dwell', t0: tCursor, t1: tCursor + dwellSec, s0: s, s1: s });
      tCursor += dwellSec;
    }
  }

  const oneWayDuration = Math.max(10, tCursor);

  function sampleDistanceAt(tMod) {
    // Binary/linear search over ~15 segments (tiny array, ultra-fast)
    for (let i = 0; i < segs.length; i++) {
      const sg = segs[i];
      if (tMod <= sg.t1 || i === segs.length - 1) {
        if (sg.type === 'dwell') return sg.s0;
        const u = Math.max(0, Math.min(1, (tMod - sg.t0) / Math.max(0.001, sg.t1 - sg.t0)));
        // Smooth ease-in-out acceleration & braking curve (smoothstep blended with linear cruise)
        const ease = u * u * (3 - 2 * u);
        const blended = u * 0.42 + ease * 0.58;
        return sg.s0 + (sg.s1 - sg.s0) * blended;
      }
    }
    return totalLength;
  }

  return { oneWayDuration, sampleDistanceAt };
}

/**
 * Full 3D Railway & Subway Network Controller for PLATEAU Sapporo:
 *  - Renders ALL 3 Sapporo Municipal Subway lines (Namboku, Tozai, Toho) + ALL 3 JR Hokkaido lines
 *  - Smooth Catmull-Rom 3D curves following exact WGS84 station locations + real GSI DEM ground elevation
 *  - Realistic JR elevated concrete viaducts with piers, plus Namboku Line's famous snow-shelter viaduct
 *  - Depth-aware X-Ray pass (THREE.GreaterDepth) so underground subways glow crisply beneath streets & buildings
 *  - Articulated multi-car 3D trains rendered via InstancedMesh (body, livery stripe, lit windows, headlights/taillights)
 *  - Station markers & clean major hub badges
 */
export function createSapporoRailNetwork(scene, mapGround) {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'SAPPORO_RAIL_NETWORK';
  scene.add(rootGroup);

  // Per-line toggle state (all enabled by default)
  const lineEnabled = {
    namboku: true,
    tozai: true,
    toho: true,
    jr: true,
  };

  let railMode = 'on'; // 'on' | 'xray' | 'off'
  const lineEntries = [];
  const labelSprites = [];

  // Shared train car unit geometries (car faces +X, up = +Y, width = Z)
  // Unit-sized 1x1x1 boxes scaled per line/car so ALL trains share minimal draw calls!
  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);

  const solidBodyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.58,
    roughness: 0.28,
  });
  const solidStripeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.45,
    metalness: 0.35,
    roughness: 0.35,
  });
  const solidWindowMat = new THREE.MeshStandardMaterial({
    color: 0xffe9b0,
    emissive: 0xffc663,
    emissiveIntensity: 2.3,
    roughness: 0.14,
    metalness: 0.25,
  });
  const solidHeadMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xf4fbff,
    emissiveIntensity: 4.8,
  });
  const solidTailMat = new THREE.MeshStandardMaterial({
    color: 0xff2b20,
    emissive: 0xff1e16,
    emissiveIntensity: 4.2,
  });

  // Underground X-Ray ghost car materials (drawn ONLY when occluded behind ground/buildings via GreaterDepth!)
  const xrayCarMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.72,
    depthTest: true,
    depthFunc: THREE.GreaterDepth,
    depthWrite: false,
    fog: true,
  });
  const xrayHeadMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    depthTest: true,
    depthFunc: THREE.GreaterDepth,
    depthWrite: false,
    fog: true,
  });

  // Shared infrastructure materials
  const viaductConcreteMat = new THREE.MeshStandardMaterial({
    color: 0x6f7885,
    roughness: 0.88,
    metalness: 0.08,
  });
  const ballastMat = new THREE.MeshStandardMaterial({
    color: 0x3b4048,
    roughness: 0.95,
    metalness: 0.05,
  });
  const shelterGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x99d6c0,
    emissive: 0x0b4c2d,
    emissiveIntensity: 0.28,
    transparent: true,
    opacity: 0.42,
    roughness: 0.22,
    metalness: 0.35,
    side: THREE.DoubleSide,
  });
  const pierGeo = new THREE.BoxGeometry(2.2, 1.0, 6.2);

  // Count total train cars & heads across all lines for InstancedMesh allocation
  let totalSolidCars = 0;
  let totalSolidTrains = 0;
  let totalXrayCars = 0;
  let totalXrayTrains = 0;

  for (const spec of RAIL_LINES) {
    const trains = spec.trainCountPerDir * 2;
    totalSolidTrains += trains;
    totalSolidCars += trains * spec.carsPerTrain;
    if (spec.group === 'subway') {
      totalXrayTrains += trains;
      totalXrayCars += trains * spec.carsPerTrain;
    }
  }

  const bodyIM = new THREE.InstancedMesh(unitBoxGeo, solidBodyMat, totalSolidCars);
  const stripeIM = new THREE.InstancedMesh(unitBoxGeo, solidStripeMat, totalSolidCars);
  const windowIM = new THREE.InstancedMesh(unitBoxGeo, solidWindowMat, totalSolidCars);
  const headIM = new THREE.InstancedMesh(unitBoxGeo, solidHeadMat, totalSolidTrains);
  const tailIM = new THREE.InstancedMesh(unitBoxGeo, solidTailMat, totalSolidTrains);

  bodyIM.castShadow = true;
  bodyIM.receiveShadow = true;
  bodyIM.frustumCulled = false;
  stripeIM.frustumCulled = false;
  windowIM.frustumCulled = false;
  headIM.frustumCulled = false;
  tailIM.frustumCulled = false;

  const xrayCarIM = new THREE.InstancedMesh(unitBoxGeo, xrayCarMat, totalXrayCars);
  const xrayHeadIM = new THREE.InstancedMesh(unitBoxGeo, xrayHeadMat, totalXrayTrains);
  xrayCarIM.renderOrder = 52;
  xrayHeadIM.renderOrder = 53;
  xrayCarIM.frustumCulled = false;
  xrayHeadIM.frustumCulled = false;

  rootGroup.add(bodyIM, stripeIM, windowIM, headIM, tailIM, xrayCarIM, xrayHeadIM);

  // Build per-line geometry & runtime structures
  let solidCarCursor = 0;
  let solidTrainCursor = 0;
  let xrayCarCursor = 0;
  let xrayTrainCursor = 0;

  const tmpColor = new THREE.Color();

  function buildLineInfra(entry) {
    const { spec, infraGroup } = entry;

    // Clear previous infra (used when GSI DEM elevation finishes refining)
    while (infraGroup.children.length > 0) {
      const ch = infraGroup.children[0];
      infraGroup.remove(ch);
      if (ch.geometry && ch.geometry !== pierGeo && ch.geometry !== unitBoxGeo) {
        ch.geometry.dispose();
      }
      if (ch.material && ch.material !== viaductConcreteMat && ch.material !== ballastMat && ch.material !== shelterGlassMat) {
        if (Array.isArray(ch.material)) {
          ch.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
        } else if (!ch.userData?.keepMat) {
          if (ch.material.map) ch.material.map.dispose();
          ch.material.dispose();
        }
      }
    }

    // 1. Convert waypoints to local Three.js 3D coordinates
    const rawPts = spec.points.map((pt, idx) => {
      const gY = entry.groundYs[idx];
      const v = latLonToGround(pt.lat, pt.lon, gY + pt.relY);
      return v;
    });

    // Apply subtle lateral shift for shared JR corridors (Chitose / Gakuen-Toshi parallel to Hakodate)
    if (spec.lateralShift) {
      const right = new THREE.Vector3();
      const tan = new THREE.Vector3();
      for (let i = 0; i < rawPts.length; i++) {
        const pPrev = rawPts[Math.max(0, i - 1)];
        const pNext = rawPts[Math.min(rawPts.length - 1, i + 1)];
        tan.subVectors(pNext, pPrev).setY(0).normalize();
        right.crossVectors(tan, UP).normalize();
        // Only apply parallel offset near Sapporo-Shiroishi / Sapporo-Soen shared zones
        const pt = spec.points[i];
        const isShared =
          (spec.id === 'jr-chitose' && i <= 4) ||
          (spec.id === 'jr-gakuen' && i <= 1);
        if (isShared) {
          rawPts[i].addScaledVector(right, spec.lateralShift);
        }
      }
    }

    const curve = new THREE.CatmullRomCurve3(rawPts, false, 'centripetal', 0.35);
    const totalLength = curve.getLength();

    // Estimate arc-length of each named station along the curve
    const denseN = Math.max(140, Math.round(totalLength / 45));
    const samples = [];
    const sampleArcLens = new Float32Array(denseN + 1);
    let accLen = 0;
    for (let i = 0; i <= denseN; i++) {
      const u = i / denseN;
      const pos = curve.getPoint(u);
      const tan = curve.getTangent(u).normalize();
      if (i > 0) accLen += pos.distanceTo(samples[i - 1].pos);
      sampleArcLens[i] = accLen;
      samples.push({ u, pos, tan, s: accLen });
    }

    const stationArcLengths = [];
    const stationPositions = [];
    for (let i = 0; i < spec.points.length; i++) {
      const pt = spec.points[i];
      if (!pt.name) continue;
      // Find closest sample to rawPts[i]
      let bestIdx = 0;
      let bestD2 = Infinity;
      for (let j = 0; j < samples.length; j++) {
        const d2 = samples[j].pos.distanceToSquared(rawPts[i]);
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = j;
        }
      }
      stationArcLengths.push(sampleArcLens[bestIdx]);
      stationPositions.push({
        pt,
        pos: samples[bestIdx].pos.clone(),
        groundY: entry.groundYs[i],
        tan: samples[bestIdx].tan.clone(),
      });
    }

    entry.curve = curve;
    entry.totalLength = accLen;
    entry.samples = samples;
    entry.sampleArcLens = sampleArcLens;
    entry.schedule = buildStationSchedule(curve, stationArcLengths, accLen, spec.speedMps, spec.dwellSec);

    // 2. Build Track Bed / Tunnel / Glowing Guideway Ribbon
    const isSubway = spec.group === 'subway';

    // Solid glowing track core (visible directly above ground, or inside translucent underground mode)
    const solidTrackMat = new THREE.MeshStandardMaterial({
      color: spec.colorHex,
      emissive: spec.glowHex,
      emissiveIntensity: isSubway ? 1.55 : 0.95,
      roughness: 0.35,
      metalness: 0.25,
    });
    const solidTrackGeo = buildRibbonGeometry(samples, isSubway ? 3.4 : 3.2, -0.35, isSubway ? 0.65 : 0.35);
    const solidTrackMesh = new THREE.Mesh(solidTrackGeo, solidTrackMat);
    solidTrackMesh.renderOrder = 2;
    infraGroup.add(solidTrackMesh);

    if (isSubway) {
      // Underground X-Ray luminous route ribbon (visible right through opaque ground/buildings!)
      const xrayRibbonMat = new THREE.MeshBasicMaterial({
        color: spec.glowHex,
        transparent: true,
        opacity: 0.34,
        depthTest: true,
        depthFunc: THREE.GreaterDepth,
        depthWrite: false,
        fog: true,
        side: THREE.DoubleSide,
      });
      const xrayRibbonGeo = buildRibbonGeometry(samples, 3.6, 0.2, 0);
      const xrayRibbon = new THREE.Mesh(xrayRibbonGeo, xrayRibbonMat);
      xrayRibbon.renderOrder = 50;
      infraGroup.add(xrayRibbon);
      entry.xrayRibbon = xrayRibbon;

      // Subtle dark underground tunnel floor underneath the glowing guideway (for glass-ground mode)
      const tunnelFloorGeo = buildRibbonGeometry(samples, 4.6, -1.2, 0.75);
      const tunnelFloor = new THREE.Mesh(tunnelFloorGeo, ballastMat);
      infraGroup.add(tunnelFloor);
    } else {
      // JR dark gravel/ballast bed beneath the line-colored rail guide
      const bedGeo = buildRibbonGeometry(samples, 4.4, -0.85, 0.6);
      const bedMesh = new THREE.Mesh(bedGeo, ballastMat);
      bedMesh.receiveShadow = true;
      infraGroup.add(bedMesh);
    }

    // 3. Elevated Viaduct Concrete Deck, Support Piers, & Namboku Line Snow Shelter!
    // Identify contiguous elevated segments from waypoints
    const elevatedChunks = [];
    let currentChunk = [];
    for (let i = 0; i < samples.length; i++) {
      // Interpolate waypoint elevation flag based on nearest control point index
      const approxIdx = Math.min(spec.points.length - 1, Math.round(samples[i].u * (spec.points.length - 1)));
      const pt = spec.points[approxIdx];
      const isElev = Boolean(pt.elevated) && pt.relY > 2.2;
      if (isElev) {
        currentChunk.push(samples[i]);
      } else if (currentChunk.length > 0) {
        if (currentChunk.length >= 2) elevatedChunks.push(currentChunk);
        currentChunk = [];
      }
    }
    if (currentChunk.length >= 2) elevatedChunks.push(currentChunk);

    const pierTransforms = [];
    for (const chunk of elevatedChunks) {
      // Concrete viaduct deck slab
      const deckGeo = buildRibbonGeometry(chunk, 4.8, -2.0, 1.55);
      const deckMesh = new THREE.Mesh(deckGeo, viaductConcreteMat);
      deckMesh.castShadow = true;
      deckMesh.receiveShadow = true;
      infraGroup.add(deckMesh);

      // Iconic Sapporo Namboku Line translucent aluminum snow-shelter shell (Minami-Hiragishi <-> Makomanai)
      if (spec.shelterElevated) {
        const shelterGeo = buildRibbonGeometry(chunk, 4.7, -0.4, 5.4);
        const shelterMesh = new THREE.Mesh(shelterGeo, shelterGlassMat);
        shelterMesh.renderOrder = 4;
        infraGroup.add(shelterMesh);
      }

      // Viaduct concrete support piers every ~48m
      let lastPierS = -999;
      for (const sm of chunk) {
        if (sm.s - lastPierS >= 48) {
          lastPierS = sm.s;
          const approxIdx = Math.min(spec.points.length - 1, Math.round(sm.u * (spec.points.length - 1)));
          const groundY = entry.groundYs[approxIdx];
          const pierHeight = Math.max(2.5, sm.pos.y - 1.8 - groundY);
          const yaw = Math.atan2(-sm.tan.z, sm.tan.x);
          pierTransforms.push({
            x: sm.pos.x,
            y: groundY + pierHeight * 0.5,
            z: sm.pos.z,
            h: pierHeight,
            yaw,
          });
        }
      }
    }

    if (pierTransforms.length > 0) {
      const pierIM = new THREE.InstancedMesh(pierGeo, viaductConcreteMat, pierTransforms.length);
      const dummy = new THREE.Object3D();
      pierTransforms.forEach((p, idx) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.yaw, 0);
        dummy.scale.set(1, p.h, 1);
        dummy.updateMatrix();
        pierIM.setMatrixAt(idx, dummy.matrix);
      });
      pierIM.castShadow = true;
      pierIM.receiveShadow = true;
      infraGroup.add(pierIM);
    }

    // 4. Station Platforms, Glowing Rings & Major Hub Labels
    const ringGeo = new THREE.RingGeometry(6.5, 10.2, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const stationRingMat = new THREE.MeshBasicMaterial({
      color: spec.glowHex,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const xrayRingMat = isSubway
      ? new THREE.MeshBasicMaterial({
          color: spec.glowHex,
          transparent: true,
          opacity: 0.62,
          side: THREE.DoubleSide,
          depthTest: true,
          depthFunc: THREE.GreaterDepth,
          depthWrite: false,
          fog: true,
        })
      : null;

    const platGeo = new THREE.BoxGeometry(88, 1.3, 10.5);
    const platMat = new THREE.MeshStandardMaterial({
      color: 0x263144,
      emissive: spec.colorHex,
      emissiveIntensity: 0.55,
      roughness: 0.5,
    });

    for (const st of stationPositions) {
      const yaw = Math.atan2(-st.tan.z, st.tan.x);

      // Station platform block at track level
      const plat = new THREE.Mesh(platGeo, platMat);
      plat.position.copy(st.pos);
      plat.position.y -= 0.4;
      plat.rotation.y = yaw;
      infraGroup.add(plat);

      // Glowing station ring at track level
      const ring = new THREE.Mesh(ringGeo, stationRingMat);
      ring.position.copy(st.pos);
      ring.position.y += 0.3;
      infraGroup.add(ring);

      // X-Ray station ring visible through ground for underground subway stops
      if (isSubway && st.pt.relY < 0 && xrayRingMat) {
        const xRing = new THREE.Mesh(ringGeo, xrayRingMat);
        xRing.position.copy(st.pos);
        xRing.position.y += 0.35;
        xRing.renderOrder = 51;
        infraGroup.add(xRing);

        // Subtle vertical light shaft connecting underground station up to street level!
        const shaftH = Math.abs(st.pt.relY) + 4.5;
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(1.1, 2.2, shaftH, 10, 1, true),
          new THREE.MeshBasicMaterial({
            color: spec.glowHex,
            transparent: true,
            opacity: 0.24,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        shaft.position.set(st.pos.x, st.pos.y + shaftH * 0.5, st.pos.z);
        infraGroup.add(shaft);
      }

      // Clean floating station badge for major hubs
      if (st.pt.major) {
        const badgeTex = createStationBadgeTexture(st.pt.name, st.pt.code || spec.shortName, spec.colorHex, !isSubway);
        const spriteMat = new THREE.SpriteMaterial({
          map: badgeTex,
          transparent: true,
          opacity: 0.92,
          depthTest: false,
          fog: true,
        });
        const sprite = new THREE.Sprite(spriteMat);
        const badgeY = Math.max(st.groundY, st.pos.y) + (isSubway ? 38 : 44);
        sprite.position.set(st.pos.x, badgeY, st.pos.z);
        sprite.scale.set(66, 19.5, 1);
        sprite.renderOrder = 60;
        infraGroup.add(sprite);
        labelSprites.push({ sprite, basePos: sprite.position.clone(), lineKey: isSubway ? spec.id : 'jr' });
      }
    }
  }

  // Initialize every line entry & train fleet
  for (const spec of RAIL_LINES) {
    const infraGroup = new THREE.Group();
    infraGroup.name = `RAIL_LINE_${spec.id}`;
    rootGroup.add(infraGroup);

    const trains = [];
    const totalDirTrains = spec.trainCountPerDir;
    const isSubway = spec.group === 'subway';

    for (const dir of [1, -1]) {
      for (let k = 0; k < totalDirTrains; k++) {
        // Stagger phases evenly around the one-way cycle
        const phase = (k + (dir === -1 ? 0.5 : 0)) / totalDirTrains;
        // For JR lines, make some trains sleek Limited Express livery (silver + Hokkaido blue/lilac stripe)!
        const isLimitedExpress = !isSubway && k === 0;

        const trainObj = {
          dir,
          phase,
          isLimitedExpress,
          solidCarStart: solidCarCursor,
          solidTrainIdx: solidTrainCursor,
          xrayCarStart: isSubway ? xrayCarCursor : -1,
          xrayTrainIdx: isSubway ? xrayTrainCursor : -1,
        };

        // Assign instance colors once for every car in this train
        const bodyHex = isLimitedExpress ? 0xf1f5f9 : spec.bodyHex;
        const stripeHex = isLimitedExpress
          ? (spec.id === 'jr-chitose' ? 0x38bdf8 : 0xa855f7) // Rapid Airport / Hokuto cyan-blue & Kamui/Lilac purple!
          : spec.stripeHex;

        for (let c = 0; c < spec.carsPerTrain; c++) {
          tmpColor.setHex(bodyHex);
          bodyIM.setColorAt(solidCarCursor + c, tmpColor);

          tmpColor.setHex(stripeHex);
          stripeIM.setColorAt(solidCarCursor + c, tmpColor);

          if (isSubway) {
            tmpColor.setHex(spec.glowHex);
            xrayCarIM.setColorAt(xrayCarCursor + c, tmpColor);
          }
        }

        solidCarCursor += spec.carsPerTrain;
        solidTrainCursor += 1;
        if (isSubway) {
          xrayCarCursor += spec.carsPerTrain;
          xrayTrainCursor += 1;
        }
        trains.push(trainObj);
      }
    }

    const entry = {
      spec,
      infraGroup,
      groundYs: spec.points.map(p => p.initGroundY),
      trains,
      curve: null,
      totalLength: 1,
      samples: [],
      sampleArcLens: null,
      schedule: null,
      xrayRibbon: null,
    };

    buildLineInfra(entry);
    lineEntries.push(entry);
  }

  if (bodyIM.instanceColor) bodyIM.instanceColor.needsUpdate = true;
  if (stripeIM.instanceColor) stripeIM.instanceColor.needsUpdate = true;
  if (xrayCarIM.instanceColor) xrayCarIM.instanceColor.needsUpdate = true;

  // ==================== ASYNC GSI DEM ELEVATION REFINEMENT ====================
  // Snap every station & waypoint across all 10 Sapporo wards to true GSI DEM ground elevation!
  if (mapGround?.getLocalElevationAt) {
    Promise.all(
      lineEntries.map(async entry => {
        let changed = false;
        const updated = await Promise.all(
          entry.spec.points.map(async (pt, i) => {
            const realY = await mapGround.getLocalElevationAt(pt.lat, pt.lon, 13);
            if (realY !== null && Number.isFinite(realY)) {
              if (Math.abs(realY - entry.groundYs[i]) > 0.5) changed = true;
              return realY;
            }
            return entry.groundYs[i];
          })
        );
        if (changed) {
          entry.groundYs = updated;
          // Clear stale label refs for this line before rebuild
          buildLineInfra(entry);
          syncVisibility();
        }
      })
    ).catch(() => {
      // Fallback gracefully to initial approximate topography if offline
    });
  }

  // ==================== FAST ARC-LENGTH CURVE SAMPLER ====================
  function samplePointAtDistance(entry, distMeters, outPos, outTan) {
    const s = Math.max(0, Math.min(entry.totalLength, distMeters));
    const arr = entry.sampleArcLens;
    const n = arr.length - 1;
    // Binary search for segment containing arc-length s
    let lo = 0;
    let hi = n;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= s) lo = mid;
      else hi = mid;
    }
    const s0 = arr[lo];
    const s1 = arr[hi];
    const f = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
    const a = entry.samples[lo];
    const b = entry.samples[hi];
    outPos.lerpVectors(a.pos, b.pos, f);
    outTan.lerpVectors(a.tan, b.tan, f).normalize();
  }

  // Reusable math scratch objects (zero GC allocations per frame!)
  const _pos = new THREE.Vector3();
  const _tan = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _basis = new THREE.Matrix4();
  const _quat = new THREE.Quaternion();
  const _scale = new THREE.Vector3();
  const _mat = new THREE.Matrix4();
  const _hideMat = new THREE.Matrix4().makeScale(0, 0, 0);

  function isLineVisible(spec) {
    if (railMode === 'off') return false;
    return spec.group === 'subway' ? Boolean(lineEnabled[spec.id]) : Boolean(lineEnabled.jr);
  }

  function syncVisibility() {
    rootGroup.visible = railMode !== 'off';
    // Keep GreaterDepth X-ray pass active in BOTH 'on' (through opaque ground) and 'xray' (through buildings above glass ground!)
    const showXrayPass = railMode !== 'off';
    xrayCarIM.visible = showXrayPass;
    xrayHeadIM.visible = showXrayPass;
    xrayCarMat.opacity = railMode === 'xray' ? 0.52 : 0.74;

    for (const entry of lineEntries) {
      const vis = isLineVisible(entry.spec);
      entry.infraGroup.visible = vis;
      if (entry.xrayRibbon) {
        entry.xrayRibbon.visible = vis && showXrayPass;
        entry.xrayRibbon.material.opacity = railMode === 'xray' ? 0.28 : 0.36;
      }
    }
  }

  function setMode(mode) {
    railMode = mode;
    syncVisibility();
  }

  function setLineEnabled(key, enabled) {
    if (key in lineEnabled) {
      lineEnabled[key] = Boolean(enabled);
      syncVisibility();
    }
  }

  function update(time, nightFactor, cameraPos) {
    if (railMode === 'off') return;

    // Dynamically adjust train interior window glow & headlight brightness by time of day
    const nightClamped = Math.max(0, Math.min(1.2, nightFactor));
    solidWindowMat.emissiveIntensity = 0.55 + 2.35 * nightClamped;
    solidHeadMat.emissiveIntensity = 1.8 + 3.8 * nightClamped;
    solidTailMat.emissiveIntensity = 1.4 + 3.2 * nightClamped;
    solidStripeMat.emissiveIntensity = 0.25 + 0.55 * nightClamped;

    // Scale station badges gently with camera distance so nearby hubs stay crisp & distant ones don't overwhelm
    if (cameraPos) {
      for (const entry of lineEntries) {
        if (!entry.infraGroup.visible) continue;
        for (const ch of entry.infraGroup.children) {
          if (ch.isSprite) {
            const d = cameraPos.distanceTo(ch.position);
            const s = Math.max(0.55, Math.min(2.6, d / 420));
            ch.scale.set(66 * s, 19.5 * s, 1);
            // Fade out very distant badges (> 4.5 km) so horizon stays clean
            ch.material.opacity = d < 3200 ? 0.90 : Math.max(0.0, 0.90 * (1 - (d - 3200) / 1600));
          }
        }
      }
    }

    const showXrayPass = railMode !== 'off';

    for (const entry of lineEntries) {
      const { spec, schedule, trains, totalLength } = entry;
      const visible = isLineVisible(spec);
      const isSubway = spec.group === 'subway';
      const carPitch = spec.carLength + spec.carGap;

      for (const tr of trains) {
        if (!visible) {
          for (let c = 0; c < spec.carsPerTrain; c++) {
            bodyIM.setMatrixAt(tr.solidCarStart + c, _hideMat);
            stripeIM.setMatrixAt(tr.solidCarStart + c, _hideMat);
            windowIM.setMatrixAt(tr.solidCarStart + c, _hideMat);
            if (isSubway) xrayCarIM.setMatrixAt(tr.xrayCarStart + c, _hideMat);
          }
          headIM.setMatrixAt(tr.solidTrainIdx, _hideMat);
          tailIM.setMatrixAt(tr.solidTrainIdx, _hideMat);
          if (isSubway) xrayHeadIM.setMatrixAt(tr.xrayTrainIdx, _hideMat);
          continue;
        }

        // Compute lead-car distance along the track using realistic station-dwell schedule
        const cycleT = ((time + tr.phase * schedule.oneWayDuration) % schedule.oneWayDuration + schedule.oneWayDuration) % schedule.oneWayDuration;
        let leadS = schedule.sampleDistanceAt(cycleT);
        if (tr.dir === -1) {
          leadS = totalLength - leadS;
        }

        // Keep entire train formation comfortably within track endpoints
        const trainTotalLen = spec.carsPerTrain * carPitch;
        const margin = trainTotalLen * 0.55;
        if (tr.dir === 1) {
          leadS = Math.max(margin, Math.min(totalLength - 8, leadS));
        } else {
          leadS = Math.max(8, Math.min(totalLength - margin, leadS));
        }

        // Lateral double-track offset (+trackGaugeHalf on left-hand Japanese rail traffic!)
        const lateralSign = tr.dir === 1 ? -1 : 1;

        for (let c = 0; c < spec.carsPerTrain; c++) {
          const carCenterS = leadS - tr.dir * (c * carPitch + spec.carLength * 0.5);
          samplePointAtDistance(entry, carCenterS, _pos, _tan);

          // Forward direction of train travel (+X in car local space)
          _fwd.copy(_tan).multiplyScalar(tr.dir).normalize();
          _right.crossVectors(_tan, UP).normalize();
          _pos.addScaledVector(_right, lateralSign * spec.trackGaugeHalf);

          // Build car orientation basis (X = forward, Y = up, Z = right-of-travel)
          _right.crossVectors(_fwd, UP).normalize();
          _up.crossVectors(_right, _fwd).normalize();
          _basis.makeBasis(_fwd, _up, _right);
          _quat.setFromRotationMatrix(_basis);

          const baseY = _pos.y;

          // 1. Main metallic train body
          _pos.y = baseY + spec.carHeight * 0.52;
          _scale.set(spec.carLength, spec.carHeight, spec.carWidth);
          _mat.compose(_pos, _quat, _scale);
          bodyIM.setMatrixAt(tr.solidCarStart + c, _mat);

          // 2. Signature line-color side & belt stripe
          _pos.y = baseY + spec.carHeight * 0.42;
          _scale.set(spec.carLength * 0.99, spec.carHeight * 0.24, spec.carWidth + 0.14);
          _mat.compose(_pos, _quat, _scale);
          stripeIM.setMatrixAt(tr.solidCarStart + c, _mat);

          // 3. Illuminated passenger windows band
          _pos.y = baseY + spec.carHeight * 0.68;
          _scale.set(spec.carLength * 0.88, spec.carHeight * 0.30, spec.carWidth + 0.12);
          _mat.compose(_pos, _quat, _scale);
          windowIM.setMatrixAt(tr.solidCarStart + c, _mat);

          // 4. Underground X-Ray glowing car pass (for subway lines)
          if (isSubway) {
            if (showXrayPass) {
              _pos.y = baseY + spec.carHeight * 0.55;
              _scale.set(spec.carLength * 0.98, spec.carHeight * 1.15, spec.carWidth * 1.25);
              _mat.compose(_pos, _quat, _scale);
              xrayCarIM.setMatrixAt(tr.xrayCarStart + c, _mat);
            } else {
              xrayCarIM.setMatrixAt(tr.xrayCarStart + c, _hideMat);
            }
          }

          // 5. Front LED Headlights (lead car c === 0)
          if (c === 0) {
            _pos.y = baseY + spec.carHeight * 0.36;
            _pos.addScaledVector(_fwd, spec.carLength * 0.5 + 0.12);
            _scale.set(0.35, 0.72, spec.carWidth * 0.76);
            _mat.compose(_pos, _quat, _scale);
            headIM.setMatrixAt(tr.solidTrainIdx, _mat);

            if (isSubway) {
              if (showXrayPass) {
                _scale.set(1.2, 1.2, spec.carWidth * 1.1);
                _mat.compose(_pos, _quat, _scale);
                xrayHeadIM.setMatrixAt(tr.xrayTrainIdx, _mat);
              } else {
                xrayHeadIM.setMatrixAt(tr.xrayTrainIdx, _hideMat);
              }
            }
          }

          // 6. Rear Crimson Taillights (tail car c === last)
          if (c === spec.carsPerTrain - 1) {
            _pos.y = baseY + spec.carHeight * 0.38;
            _pos.addScaledVector(_fwd, -(spec.carLength * 0.5 + 0.12));
            _scale.set(0.35, 0.68, spec.carWidth * 0.74);
            _mat.compose(_pos, _quat, _scale);
            tailIM.setMatrixAt(tr.solidTrainIdx, _mat);
          }
        }
      }
    }

    bodyIM.instanceMatrix.needsUpdate = true;
    stripeIM.instanceMatrix.needsUpdate = true;
    windowIM.instanceMatrix.needsUpdate = true;
    headIM.instanceMatrix.needsUpdate = true;
    tailIM.instanceMatrix.needsUpdate = true;
    if (showXrayPass) {
      xrayCarIM.instanceMatrix.needsUpdate = true;
      xrayHeadIM.instanceMatrix.needsUpdate = true;
    }
  }

  syncVisibility();

  return {
    group: rootGroup,
    update,
    setMode,
    getMode: () => railMode,
    setLineEnabled,
    getLineEnabled: () => ({ ...lineEnabled }),
    getStats: () => ({
      totalTrains: totalSolidTrains,
      subwayTrains: totalXrayTrains,
      jrTrains: totalSolidTrains - totalXrayTrains,
    }),
  };
}
