import * as THREE from 'three';
import { latLonToGround } from './geo.js';
import { RAIL_LINES } from './railData.js';
import {
  TRAIN_LIVERIES,
  createSculptedCarGeometry,
  createPantographGeometry,
  createBogieGeometry,
  createHvacGeometry,
  createTrainLiveryTextures,
  resolveTrainLiveryKey,
} from './trainModels.js';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Creates a crisp Japanese station badge sprite texture on an offscreen Canvas.
 * `compact` shrinks chrome for non-hub stops so all stations can stay readable together.
 */
function createStationBadgeTexture(title, sub, accentHex, isJR, compact = false) {
  const badgeLabel = isJR ? 'JR' : (sub || '').slice(0, 4);
  const wideCode = badgeLabel.length >= 4;
  const c = document.createElement('canvas');
  c.width = compact ? (wideCode ? 238 : 220) : (wideCode ? 276 : 256);
  c.height = compact ? 64 : 76;
  const ctx = c.getContext('2d');

  const hexStr = '#' + accentHex.toString(16).padStart(6, '0');
  const pad = compact ? 5 : 6;
  const barW = compact ? (wideCode ? 46 : 34) : (wideCode ? 56 : 42);
  const nameX = pad + 6 + barW + (compact ? 8 : 10);
  const midY = c.height * 0.5;
  const nameSize = title.length >= 9
    ? (compact ? 14 : 16)
    : title.length >= 8
      ? (compact ? 15 : 17)
      : title.length >= 6
        ? (compact ? 17 : 20)
        : (compact ? 19 : 24);

  // Rounded dark translucent pill
  ctx.fillStyle = compact ? 'rgba(9, 14, 28, 0.78)' : 'rgba(9, 14, 28, 0.84)';
  ctx.strokeStyle = hexStr;
  ctx.lineWidth = compact ? 3 : 4;
  ctx.beginPath();
  ctx.roundRect(pad, pad, c.width - pad * 2, c.height - pad * 2, compact ? 11 : 14);
  ctx.fill();
  ctx.stroke();

  // Left color bar / badge
  ctx.fillStyle = hexStr;
  ctx.beginPath();
  ctx.roundRect(pad + 6, pad + 7, barW, c.height - pad * 2 - 14, 7);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  const codeFontSize = wideCode ? (compact ? 12 : 16) : (compact ? 14 : 20);
  ctx.font = `bold ${codeFontSize}px -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeLabel, pad + 6 + barW * 0.5, midY);

  // Station name
  ctx.fillStyle = '#f8fafc';
  ctx.font = `bold ${nameSize}px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, nameX, midY);

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
function buildStationSchedule(curve, stationArcLengths, totalLength, speedMps, dwellSec, closed = false) {
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

  // For closed loops (e.g. Sapporo Streetcar), smoothly close the final segment back to stop[0]!
  if (closed && stops.length >= 2) {
    const lastS = stops[stops.length - 1];
    const wrapEndS = totalLength + stops[0];
    const wrapDist = Math.max(10, wrapEndS - lastS);
    const runDur = wrapDist / speedMps + 1.4;
    segs.push({ type: 'run', t0: tCursor, t1: tCursor + runDur, s0: lastS, s1: wrapEndS });
    tCursor += runDur;
  }

  const oneWayDuration = Math.max(10, tCursor);

  function sampleDistanceAt(tMod) {
    // Binary/linear search over ~15-25 segments (tiny array, ultra-fast)
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
 *  - Station markers & labels for EVERY subway / JR stop (hubs slightly larger)
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
    tram: true,
  };

  let railMode = 'on'; // 'on' | 'xray' | 'off'
  const lineEntries = [];
  // One floating label per unique stop name (shared JR / transfer hubs would otherwise stack)
  const placedStationLabels = new Set();
  /** @type {Map<string, { sprite: THREE.Sprite, name: string, code: string, lineId: string, lineKey: string, lineName: string, isSubway: boolean, relY: number, trackPos: THREE.Vector3, groundY: number, colorHex: number }>} */
  const stationLabelByName = new Map();
  const _pickRaycaster = new THREE.Raycaster();
  _pickRaycaster.params.Sprite = { threshold: 0.1 };

  // ==================== SCULPTED 3D ROLLING STOCK GEOMETRIES & PBR LIVERIES ====================
  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const midCarGeo = createSculptedCarGeometry({ isLead: false });
  const leadGeos = {
    commuter: createSculptedCarGeometry({ isLead: true, noseStyle: 'commuter' }),
    express:  createSculptedCarGeometry({ isLead: true, noseStyle: 'express' }),
    tram:     createSculptedCarGeometry({ isLead: true, noseStyle: 'tram' }),
  };
  const bogieGeo = createBogieGeometry();
  const hvacGeo = createHvacGeometry();
  const pantoGeo = createPantographGeometry();
  const headlightGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.12, 10);
  headlightGeo.rotateZ(Math.PI / 2);

  // Build one PBR livery material (diffuse + emissive lit windows + glossy glass roughness) per train series
  const liveryMaterials = {};
  for (const [key, style] of Object.entries(TRAIN_LIVERIES)) {
    liveryMaterials[key] = createTrainLiveryTextures(style);
  }

  const bogieMat = new THREE.MeshStandardMaterial({
    color: 0x1e242d,
    metalness: 0.65,
    roughness: 0.55,
  });
  const hvacMat = new THREE.MeshStandardMaterial({
    color: 0xc2ccd8,
    metalness: 0.42,
    roughness: 0.52,
  });
  const pantoMat = new THREE.MeshStandardMaterial({
    color: 0x3b4452,
    metalness: 0.82,
    roughness: 0.28,
  });
  const couplerMat = new THREE.MeshStandardMaterial({
    color: 0x191e26,
    metalness: 0.18,
    roughness: 0.88,
  });
  const cabGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x091322,
    emissive: 0x162438,
    emissiveIntensity: 0.35,
    metalness: 0.25,
    roughness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });
  const destLedMat = new THREE.MeshStandardMaterial({
    color: 0xfff0c2,
    emissive: 0xffb838,
    emissiveIntensity: 2.8,
  });
  const solidHeadMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xf4fbff,
    emissiveIntensity: 5.2,
  });
  const solidTailMat = new THREE.MeshStandardMaterial({
    color: 0xff2b20,
    emissive: 0xff1e16,
    emissiveIntensity: 4.4,
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

  // Pre-count exact instance capacities per livery bucket & shared rolling stock detail pools
  const leadCounts = {};
  const midCounts = {};
  let totalSolidTrains = 0;
  let totalBogies = 0;
  let totalHvacs = 0;
  let totalPantos = 0;
  let totalCouplers = 0;
  let totalXrayCars = 0;
  let totalXrayTrains = 0;

  function hasPantograph(spec, carIdx) {
    // Real Sapporo accuracy: Namboku Line uses third-rail power (no overhead pantographs)!
    if (spec.id === 'namboku') return false;
    if (spec.group === 'tram') return carIdx === 1;
    if (spec.carsPerTrain >= 6) return carIdx === 1 || carIdx === spec.carsPerTrain - 2;
    return carIdx === 1;
  }

  for (const spec of RAIL_LINES) {
    for (const dir of [1, -1]) {
      for (let k = 0; k < spec.trainCountPerDir; k++) {
        const lKey = resolveTrainLiveryKey(spec, k, dir);
        totalSolidTrains += 1;
        leadCounts[lKey] = (leadCounts[lKey] || 0) + Math.min(2, spec.carsPerTrain);
        midCounts[lKey] = (midCounts[lKey] || 0) + Math.max(0, spec.carsPerTrain - 2);
        totalCouplers += Math.max(0, spec.carsPerTrain - 1);
        for (let c = 0; c < spec.carsPerTrain; c++) {
          totalBogies += spec.group === 'tram' ? 1 : 2;
          totalHvacs += spec.group === 'tram' ? 1 : 2;
          if (hasPantograph(spec, c)) totalPantos += 1;
        }
        if (spec.group === 'subway') {
          totalXrayTrains += 1;
          totalXrayCars += spec.carsPerTrain;
        }
      }
    }
  }

  // Allocate per-livery sculpted InstancedMesh pools (lead/tail aerodynamic cabs + mid coaches)
  const carPools = {};
  for (const lKey of Object.keys(TRAIN_LIVERIES)) {
    const style = TRAIN_LIVERIES[lKey];
    const noseStyle = style.isExpress ? 'express' : (style.isTram ? 'tram' : 'commuter');
    const mat = liveryMaterials[lKey];
    const leadCount = leadCounts[lKey] || 0;
    const midCount = midCounts[lKey] || 0;

    let leadIM = null;
    if (leadCount > 0) {
      leadIM = new THREE.InstancedMesh(leadGeos[noseStyle], mat, leadCount);
      leadIM.castShadow = true;
      leadIM.receiveShadow = true;
      leadIM.frustumCulled = false;
      rootGroup.add(leadIM);
    }
    let midIM = null;
    if (midCount > 0) {
      midIM = new THREE.InstancedMesh(midCarGeo, mat, midCount);
      midIM.castShadow = true;
      midIM.receiveShadow = true;
      midIM.frustumCulled = false;
      rootGroup.add(midIM);
    }
    carPools[lKey] = { leadIM, midIM, leadCursor: 0, midCursor: 0, noseStyle };
  }

  // Allocate shared detail InstancedMesh pools (bogies, HVAC, pantographs, gangways, cab glass, twin lights)
  const bogieIM = new THREE.InstancedMesh(bogieGeo, bogieMat, Math.max(1, totalBogies));
  const hvacIM = new THREE.InstancedMesh(hvacGeo, hvacMat, Math.max(1, totalHvacs));
  const pantoIM = new THREE.InstancedMesh(pantoGeo, pantoMat, Math.max(1, totalPantos));
  const couplerIM = new THREE.InstancedMesh(unitBoxGeo, couplerMat, Math.max(1, totalCouplers));
  const cabGlassIM = new THREE.InstancedMesh(unitBoxGeo, cabGlassMat, Math.max(1, totalSolidTrains * 2));
  const destIM = new THREE.InstancedMesh(unitBoxGeo, destLedMat, Math.max(1, totalSolidTrains));
  const headIM = new THREE.InstancedMesh(headlightGeo, solidHeadMat, Math.max(1, totalSolidTrains * 2));
  const tailIM = new THREE.InstancedMesh(headlightGeo, solidTailMat, Math.max(1, totalSolidTrains * 2));

  for (const im of [bogieIM, hvacIM, pantoIM, couplerIM, cabGlassIM, destIM, headIM, tailIM]) {
    im.frustumCulled = false;
    rootGroup.add(im);
  }
  bogieIM.castShadow = false;
  hvacIM.castShadow = true;

  const xrayCarIM = new THREE.InstancedMesh(unitBoxGeo, xrayCarMat, totalXrayCars);
  const xrayHeadIM = new THREE.InstancedMesh(unitBoxGeo, xrayHeadMat, totalXrayTrains);
  xrayCarIM.renderOrder = 52;
  xrayHeadIM.renderOrder = 53;
  xrayCarIM.frustumCulled = false;
  xrayHeadIM.frustumCulled = false;
  rootGroup.add(xrayCarIM, xrayHeadIM);

  // Allocation cursors for train registration
  let solidTrainCursor = 0;
  let bogieCursor = 0;
  let hvacCursor = 0;
  let pantoCursor = 0;
  let couplerCursor = 0;
  let xrayCarCursor = 0;
  let xrayTrainCursor = 0;

  const tmpColor = new THREE.Color();

  function buildLineInfra(entry) {
    const { spec, infraGroup } = entry;

    // DEM rebuild clears meshes; also release this line's label keys so every stop
    // can be re-labeled (otherwise the Set blocks recreation and names vanish).
    for (const name of entry.ownedLabelNames || []) {
      placedStationLabels.delete(name);
      stationLabelByName.delete(name);
    }
    entry.ownedLabelNames = [];

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

    const isClosed = Boolean(spec.closed);
    const curve = new THREE.CatmullRomCurve3(rawPts, isClosed, 'centripetal', isClosed ? 0.22 : 0.35);
    const totalLength = curve.getLength();

    // Estimate arc-length of each named station along the curve
    const denseN = Math.max(isClosed ? 260 : 140, Math.round(totalLength / (isClosed ? 26 : 45)));
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
      const searchMax = isClosed ? samples.length - 1 : samples.length;
      for (let j = 0; j < searchMax; j++) {
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
    entry.schedule = buildStationSchedule(curve, stationArcLengths, accLen, spec.speedMps, spec.dwellSec, isClosed);

    // 2. Build Track Bed / Tunnel / Glowing Guideway Ribbon
    const isSubway = spec.group === 'subway';
    const isTram = spec.group === 'tram';

    // Solid glowing track core (visible directly above ground, or inside translucent underground mode)
    const solidTrackMat = new THREE.MeshStandardMaterial({
      color: spec.colorHex,
      emissive: spec.glowHex,
      emissiveIntensity: isSubway ? 1.55 : (isTram ? 1.15 : 0.95),
      roughness: 0.35,
      metalness: 0.25,
    });
    const trackHalfW = isSubway ? 3.4 : (isTram ? 2.15 : 3.2);
    const trackH = isSubway ? 0.65 : (isTram ? 0.14 : 0.35);
    const trackYOff = isSubway ? -0.35 : (isTram ? -0.02 : -0.35);
    const solidTrackGeo = buildRibbonGeometry(samples, trackHalfW, trackYOff, trackH);
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
    } else if (isTram) {
      // Sleek street-flush dark steel/stone tramway strip embedded in Sapporo avenues
      const tramBedGeo = buildRibbonGeometry(samples, 2.95, -0.08, 0.10);
      const tramBed = new THREE.Mesh(tramBedGeo, ballastMat);
      tramBed.receiveShadow = true;
      infraGroup.add(tramBed);
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

    // 4. Station Platforms, Glowing Rings & Labels (every named stop)
    const ringGeo = new THREE.RingGeometry(isTram ? 3.6 : 6.5, isTram ? 5.6 : 10.2, 24);
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

    const platGeo = new THREE.BoxGeometry(isTram ? 22 : 88, isTram ? 0.45 : 1.3, isTram ? 5.4 : 10.5);
    const platMat = new THREE.MeshStandardMaterial({
      color: 0x263144,
      emissive: spec.colorHex,
      emissiveIntensity: 0.55,
      roughness: 0.5,
    });

    for (const st of stationPositions) {
      const yaw = Math.atan2(-st.tan.z, st.tan.x);
      const isMajor = Boolean(st.pt.major);

      // Station platform block at track level
      const plat = new THREE.Mesh(platGeo, platMat);
      plat.position.copy(st.pos);
      plat.position.y -= isTram ? 0.10 : 0.4;
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

      // Floating clickable label for every station (all 24 streetcar stops included!)
      const labelKey = isTram ? `tram:${st.pt.name}` : st.pt.name;
      if (st.pt.name && !placedStationLabels.has(labelKey)) {
        placedStationLabels.add(labelKey);
        entry.ownedLabelNames.push(labelKey);
        const isJR = spec.group === 'jr';
        const badgeTex = createStationBadgeTexture(
          st.pt.name,
          st.pt.code || spec.shortName,
          spec.colorHex,
          isJR,
          !isMajor
        );
        const spriteMat = new THREE.SpriteMaterial({
          map: badgeTex,
          transparent: true,
          opacity: isMajor ? 0.94 : 0.90,
          depthTest: false,
          fog: false, // keep names readable through winter atmosphere fog
        });
        const sprite = new THREE.Sprite(spriteMat);
        // If a tram stop shares a hub name with a subway station (e.g. すすきの), lift slightly so both panels stay readable
        const sharedNameLift = isTram && placedStationLabels.has(st.pt.name) ? 16 : 0;
        const badgeY = Math.max(st.groundY, st.pos.y) + (
          isJR ? (isMajor ? 44 : 34) : (isMajor ? 38 : 30)
        ) + sharedNameLift;
        sprite.position.set(st.pos.x, badgeY, st.pos.z);

        // Subtle vertical stem connecting streetcar stop ring up to its floating panel
        if (isTram) {
          const stemH = Math.max(8, badgeY - st.pos.y - 6);
          const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.45, 0.95, stemH, 8, 1, true),
            new THREE.MeshBasicMaterial({
              color: spec.glowHex,
              transparent: true,
              opacity: 0.28,
              depthWrite: false,
              side: THREE.DoubleSide,
            })
          );
          stem.position.set(st.pos.x, st.pos.y + stemH * 0.5, st.pos.z);
          infraGroup.add(stem);
        }

        const wideRatio = isTram ? 1.08 : 1.0;
        const baseW = (isMajor ? 66 : 52) * wideRatio;
        const baseH = isMajor ? 19.5 : 15;
        sprite.scale.set(baseW, baseH, 1);
        sprite.renderOrder = isMajor ? 60 : 58;
        sprite.userData.baseW = baseW;
        sprite.userData.baseH = baseH;
        sprite.userData.isMajor = isMajor;
        sprite.userData.isStationBadge = true;
        sprite.userData.stationKey = labelKey;
        sprite.userData.stationName = st.pt.name;
        sprite.userData.peakOpacity = isMajor ? 0.94 : 0.90;
        // City-scale viewing: identical visibility range across subway, JR, and streetcar
        sprite.userData.fadeStart = isMajor ? 9000 : 7500;
        sprite.userData.fadeEnd = isMajor ? 14000 : 12000;
        infraGroup.add(sprite);

        const lineKey = isSubway ? spec.id : (isTram ? 'tram' : 'jr');
        stationLabelByName.set(labelKey, {
          key: labelKey,
          sprite,
          name: st.pt.name,
          code: st.pt.code || '',
          lineId: spec.id,
          lineKey,
          lineName: spec.name,
          isSubway,
          isTram,
          relY: st.pt.relY,
          trackPos: st.pos.clone(),
          groundY: st.groundY,
          colorHex: spec.colorHex,
        });
      }
    }
  }

  function isLineKeyVisible(lineKey) {
    if (railMode === 'off') return false;
    return Boolean(lineEnabled[lineKey]);
  }

  /**
   * Ray-pick a visible station badge under normalized device coords (-1..1).
   */
  function pickStation(ndcX, ndcY, camera) {
    if (railMode === 'off') return null;
    const sprites = [];
    for (const info of stationLabelByName.values()) {
      const sp = info.sprite;
      if (!sp.visible || sp.material.opacity < 0.05) continue;
      if (!isLineKeyVisible(info.lineKey)) continue;
      if (!info.sprite.parent?.visible) continue;
      sprites.push(sp);
    }
    if (!sprites.length) return null;

    _pickRaycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    // Enlarge pick tolerance a bit so compact badges are easy to tap
    const prevThresh = _pickRaycaster.params.Sprite?.threshold ?? 0;
    if (_pickRaycaster.params.Sprite) _pickRaycaster.params.Sprite.threshold = 0.35;
    const hits = _pickRaycaster.intersectObjects(sprites, false);
    if (_pickRaycaster.params.Sprite) _pickRaycaster.params.Sprite.threshold = prevThresh;
    if (!hits.length) return null;

    const key = hits[0].object.userData.stationKey || hits[0].object.userData.stationName;
    return key ? stationLabelByName.get(key) || null : null;
  }

  /**
   * Build a cinema-style fly-to framing for a station (eye + look-at target + copy).
   */
  function getStationCameraView(info) {
    if (!info) return null;
    const underground = info.isSubway && info.relY < 0;
    const tgt = info.trackPos.clone();
    tgt.y = underground
      ? info.groundY + 8
      : Math.max(info.groundY, info.trackPos.y) + 12;

    const dist = underground ? 210 : (info.isTram ? 155 : 250);
    const height = underground ? 105 : (info.isTram ? 64 : 88);
    const eye = new THREE.Vector3(
      tgt.x - dist * 0.78,
      tgt.y + height,
      tgt.z + dist * 0.72
    );

    const codePart = info.code ? ` ${info.code}` : '';
    const prefix = info.isSubway ? 'SUBWAY' : (info.isTram ? 'STREETCAR' : 'JR');
    return {
      name: info.name,
      code: info.code,
      eye,
      tgt,
      suggestXray: underground,
      title: `${prefix} · ${info.name}${codePart}`,
      sub: `${info.lineName} — 駅名バッジから移動 · ドラッグで周囲を確認`,
    };
  }

  // Initialize every line entry & train fleet
  for (const spec of RAIL_LINES) {
    const infraGroup = new THREE.Group();
    infraGroup.name = `RAIL_LINE_${spec.id}`;
    rootGroup.add(infraGroup);

    const trains = [];
    const totalDirTrains = spec.trainCountPerDir;
    const isSubway = spec.group === 'subway';
    const isTram = spec.group === 'tram';

    for (const dir of [1, -1]) {
      for (let k = 0; k < totalDirTrains; k++) {
        // Stagger phases evenly around the one-way cycle
        const phase = (k + (dir === -1 ? 0.5 : 0)) / totalDirTrains;
        const liveryKey = resolveTrainLiveryKey(spec, k, dir);
        const pool = carPools[liveryKey];

        // Pre-assign exact InstancedMesh slots for every car & detail part in this train!
        const carSlots = [];
        for (let c = 0; c < spec.carsPerTrain; c++) {
          const isEndCar = c === 0 || c === spec.carsPerTrain - 1;
          const slot = {
            isLead: c === 0,
            isTail: c === spec.carsPerTrain - 1,
            im: isEndCar ? pool.leadIM : pool.midIM,
            imIdx: isEndCar ? pool.leadCursor++ : pool.midCursor++,
            bogieStart: bogieCursor,
            bogieCount: isTram ? 1 : 2,
            hvacStart: hvacCursor,
            hvacCount: isTram ? 1 : 2,
            pantoIdx: hasPantograph(spec, c) ? pantoCursor++ : -1,
            couplerIdx: c < spec.carsPerTrain - 1 ? couplerCursor++ : -1,
          };
          bogieCursor += slot.bogieCount;
          hvacCursor += slot.hvacCount;
          carSlots.push(slot);

          if (isSubway) {
            tmpColor.setHex(spec.glowHex);
            xrayCarIM.setColorAt(xrayCarCursor + c, tmpColor);
          }
        }

        const trainObj = {
          dir,
          phase,
          liveryKey,
          noseStyle: pool.noseStyle,
          carSlots,
          solidTrainIdx: solidTrainCursor,
          xrayCarStart: isSubway ? xrayCarCursor : -1,
          xrayTrainIdx: isSubway ? xrayTrainCursor : -1,
        };

        // Tint destination LED per line signature color
        tmpColor.setHex(spec.glowHex);
        destIM.setColorAt(solidTrainCursor, tmpColor);

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
      ownedLabelNames: [],
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

  if (destIM.instanceColor) destIM.instanceColor.needsUpdate = true;
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
    const len = entry.totalLength;
    const s = entry.spec.closed
      ? ((distMeters % len) + len) % len
      : Math.max(0, Math.min(len, distMeters));
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
  const _subPos = new THREE.Vector3();
  const _tan = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _basis = new THREE.Matrix4();
  const _quat = new THREE.Quaternion();
  const _tailQuat = new THREE.Quaternion();
  const _glassQuat = new THREE.Quaternion();
  const _rotY180 = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);
  const _tiltZ = new THREE.Quaternion();
  const _zAxis = new THREE.Vector3(0, 0, 1);
  const _scale = new THREE.Vector3();
  const _mat = new THREE.Matrix4();
  const _hideMat = new THREE.Matrix4().makeScale(0, 0, 0);

  function isLineVisible(spec) {
    if (railMode === 'off') return false;
    if (spec.group === 'subway') return Boolean(lineEnabled[spec.id]);
    if (spec.group === 'tram') return Boolean(lineEnabled.tram);
    return Boolean(lineEnabled.jr);
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
    const winGlow = 0.28 + 1.95 * nightClamped;
    for (const mat of Object.values(liveryMaterials)) {
      mat.emissiveIntensity = winGlow;
    }
    solidHeadMat.emissiveIntensity = 1.9 + 4.2 * nightClamped;
    solidTailMat.emissiveIntensity = 1.4 + 3.4 * nightClamped;
    destLedMat.emissiveIntensity = 1.4 + 2.2 * nightClamped;
    cabGlassMat.emissiveIntensity = 0.12 + 0.35 * nightClamped;

    // Scale station badges with camera distance; keep names readable city-wide
    if (cameraPos) {
      for (const entry of lineEntries) {
        if (!entry.infraGroup.visible) continue;
        for (const ch of entry.infraGroup.children) {
          if (!ch.isSprite) continue;
          const d = cameraPos.distanceTo(ch.position);
          const baseW = ch.userData.baseW || 66;
          const baseH = ch.userData.baseH || 19.5;
          const fadeStart = ch.userData.fadeStart || 7500;
          const fadeEnd = ch.userData.fadeEnd || 12000;
          const peak = ch.userData.peakOpacity ?? (ch.userData.isMajor ? 0.94 : 0.90);
          const hoverBoost = ch.userData.hovered ? 1.08 : 1;
          // Gentler growth so far labels stay legible without huge billboards
          const s = Math.max(0.7, Math.min(2.2, Math.sqrt(d / 380))) * hoverBoost;
          ch.scale.set(baseW * s, baseH * s, 1);
          const baseOpacity = d < fadeStart
            ? peak
            : Math.max(0.0, peak * (1 - (d - fadeStart) / Math.max(1, fadeEnd - fadeStart)));
          ch.material.opacity = Math.min(1, baseOpacity * (ch.userData.hovered ? 1.06 : 1));
          ch.visible = ch.material.opacity > 0.04;
        }
      }
    }

    const showXrayPass = railMode !== 'off';

    for (const entry of lineEntries) {
      const { spec, schedule, trains, totalLength } = entry;
      const visible = isLineVisible(spec);
      const isSubway = spec.group === 'subway';
      const isTram = spec.group === 'tram';
      const carPitch = spec.carLength + spec.carGap;

      for (const tr of trains) {
        if (!visible) {
          for (let c = 0; c < tr.carSlots.length; c++) {
            const slot = tr.carSlots[c];
            slot.im?.setMatrixAt(slot.imIdx, _hideMat);
            for (let b = 0; b < slot.bogieCount; b++) bogieIM.setMatrixAt(slot.bogieStart + b, _hideMat);
            for (let h = 0; h < slot.hvacCount; h++) hvacIM.setMatrixAt(slot.hvacStart + h, _hideMat);
            if (slot.pantoIdx >= 0) pantoIM.setMatrixAt(slot.pantoIdx, _hideMat);
            if (slot.couplerIdx >= 0) couplerIM.setMatrixAt(slot.couplerIdx, _hideMat);
            if (isSubway) xrayCarIM.setMatrixAt(tr.xrayCarStart + c, _hideMat);
          }
          cabGlassIM.setMatrixAt(tr.solidTrainIdx * 2, _hideMat);
          cabGlassIM.setMatrixAt(tr.solidTrainIdx * 2 + 1, _hideMat);
          destIM.setMatrixAt(tr.solidTrainIdx, _hideMat);
          headIM.setMatrixAt(tr.solidTrainIdx * 2, _hideMat);
          headIM.setMatrixAt(tr.solidTrainIdx * 2 + 1, _hideMat);
          tailIM.setMatrixAt(tr.solidTrainIdx * 2, _hideMat);
          tailIM.setMatrixAt(tr.solidTrainIdx * 2 + 1, _hideMat);
          if (isSubway) xrayHeadIM.setMatrixAt(tr.xrayTrainIdx, _hideMat);
          continue;
        }

        // Compute lead-car distance along the track using realistic station-dwell schedule
        const cycleT = ((time + tr.phase * schedule.oneWayDuration) % schedule.oneWayDuration + schedule.oneWayDuration) % schedule.oneWayDuration;
        let leadS = schedule.sampleDistanceAt(cycleT);
        if (tr.dir === -1) {
          leadS = totalLength - leadS;
        }

        // For open lines, keep entire train comfortably inside termini; for closed loops, wrap seamlessly!
        if (spec.closed) {
          leadS = ((leadS % totalLength) + totalLength) % totalLength;
        } else {
          const trainTotalLen = spec.carsPerTrain * carPitch;
          const margin = trainTotalLen * 0.55;
          if (tr.dir === 1) {
            leadS = Math.max(margin, Math.min(totalLength - 8, leadS));
          } else {
            leadS = Math.max(8, Math.min(totalLength - margin, leadS));
          }
        }

        // Lateral double-track offset (+trackGaugeHalf on left-hand Japanese rail traffic!)
        const lateralSign = tr.dir === 1 ? -1 : 1;

        for (let c = 0; c < tr.carSlots.length; c++) {
          const slot = tr.carSlots[c];
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

          // 1. Sculpted 3D Carbody (lead faces forward, tail rotated 180 deg so aerodynamic nose faces rear!)
          _subPos.set(_pos.x, baseY, _pos.z);
          _scale.set(spec.carLength, spec.carHeight, spec.carWidth);
          if (slot.isTail && !slot.isLead) {
            _tailQuat.copy(_quat).multiply(_rotY180);
            _mat.compose(_subPos, _tailQuat, _scale);
          } else {
            _mat.compose(_subPos, _quat, _scale);
          }
          slot.im?.setMatrixAt(slot.imIdx, _mat);

          // 2. Undercarriage Bogie Trucks & Wheels (resting directly on rails at baseY!)
          const bogieScale = isTram ? 0.62 : 0.96;
          if (slot.bogieCount === 1) {
            _subPos.set(_pos.x, baseY, _pos.z);
            _scale.set(bogieScale, bogieScale, bogieScale);
            _mat.compose(_subPos, _quat, _scale);
            bogieIM.setMatrixAt(slot.bogieStart, _mat);
          } else {
            const bogieOff = spec.carLength * 0.30;
            for (let b = 0; b < 2; b++) {
              const sgn = b === 0 ? 1 : -1;
              _subPos.set(_pos.x, baseY, _pos.z).addScaledVector(_fwd, sgn * bogieOff);
              _scale.set(bogieScale, bogieScale, bogieScale);
              _mat.compose(_subPos, _quat, _scale);
              bogieIM.setMatrixAt(slot.bogieStart + b, _mat);
            }
          }

          // 3. Rooftop Air-Conditioning / HVAC Units
          const roofY = baseY + spec.carHeight * 0.985;
          if (slot.hvacCount === 1) {
            _subPos.set(_pos.x, roofY, _pos.z);
            _scale.set(spec.carLength * 0.44, 0.36, spec.carWidth * 0.62);
            _mat.compose(_subPos, _quat, _scale);
            hvacIM.setMatrixAt(slot.hvacStart, _mat);
          } else {
            const hvacOff = spec.carLength * 0.22;
            for (let h = 0; h < 2; h++) {
              const sgn = h === 0 ? 1 : -1;
              _subPos.set(_pos.x, roofY, _pos.z).addScaledVector(_fwd, sgn * hvacOff);
              _scale.set(spec.carLength * 0.24, 0.42, spec.carWidth * 0.60);
              _mat.compose(_subPos, _quat, _scale);
              hvacIM.setMatrixAt(slot.hvacStart + h, _mat);
            }
          }

          // 4. Rooftop Single-Arm Pantograph (JR electric, Tozai/Toho subways, & Sapporo Streetcars!)
          if (slot.pantoIdx >= 0) {
            const pScale = isTram ? 0.85 : (isSubway ? 0.72 : 1.05);
            const pOff = isTram ? 0 : spec.carLength * 0.36;
            _subPos.set(_pos.x, roofY + 0.02, _pos.z).addScaledVector(_fwd, pOff);
            _scale.set(pScale, pScale, pScale);
            _mat.compose(_subPos, _quat, _scale);
            pantoIM.setMatrixAt(slot.pantoIdx, _mat);
          }

          // 5. Inter-Car Articulated Gangway Bellows (幌) bridging gap to next car
          if (slot.couplerIdx >= 0) {
            _subPos.set(_pos.x, baseY + spec.carHeight * 0.54, _pos.z)
              .addScaledVector(_fwd, -(spec.carLength * 0.5 + spec.carGap * 0.5));
            _scale.set(spec.carGap + 0.24, spec.carHeight * 0.72, spec.carWidth * 0.78);
            _mat.compose(_subPos, _quat, _scale);
            couplerIM.setMatrixAt(slot.couplerIdx, _mat);
          }

          // 6. Underground X-Ray glowing car pass (for subway lines)
          if (isSubway) {
            if (showXrayPass) {
              _subPos.set(_pos.x, baseY + spec.carHeight * 0.55, _pos.z);
              _scale.set(spec.carLength * 0.98, spec.carHeight * 1.15, spec.carWidth * 1.25);
              _mat.compose(_subPos, _quat, _scale);
              xrayCarIM.setMatrixAt(tr.xrayCarStart + c, _mat);
            } else {
              xrayCarIM.setMatrixAt(tr.xrayCarStart + c, _hideMat);
            }
          }

          // 7. Front Driver Cab Windshield, Destination LED & Twin LED Headlights (lead car c === 0)
          if (slot.isLead) {
            const isExpress = tr.noseStyle === 'express';
            const rakeAngle = isExpress ? 0.34 : (isTram ? 0.20 : 0.14);
            const noseFront = spec.carLength * (isExpress ? 0.465 : 0.482);

            // Sloped dark glossy driver windshield
            _tiltZ.setFromAxisAngle(_zAxis, rakeAngle);
            _glassQuat.copy(_quat).multiply(_tiltZ);
            _subPos.set(_pos.x, baseY + spec.carHeight * (isExpress ? 0.64 : 0.66), _pos.z)
              .addScaledVector(_fwd, noseFront);
            _scale.set(0.18, spec.carHeight * (isExpress ? 0.32 : 0.34), spec.carWidth * (isExpress ? 0.78 : 0.86));
            _mat.compose(_subPos, _glassQuat, _scale);
            cabGlassIM.setMatrixAt(tr.solidTrainIdx * 2, _mat);

            // Glowing front LED Destination Display above windshield
            _subPos.set(_pos.x, baseY + spec.carHeight * (isExpress ? 0.82 : 0.86), _pos.z)
              .addScaledVector(_fwd, noseFront - (isExpress ? 0.42 : 0.16));
            _scale.set(0.12, spec.carHeight * 0.085, spec.carWidth * 0.46);
            _mat.compose(_subPos, _glassQuat, _scale);
            destIM.setMatrixAt(tr.solidTrainIdx, _mat);

            // Twin Left & Right LED Headlights
            const lampSpan = spec.carWidth * 0.30;
            const lampFwd = spec.carLength * (isExpress ? 0.498 : 0.495);
            for (let s = 0; s < 2; s++) {
              const sgn = s === 0 ? -1 : 1;
              _subPos.set(_pos.x, baseY + spec.carHeight * 0.34, _pos.z)
                .addScaledVector(_fwd, lampFwd)
                .addScaledVector(_right, sgn * lampSpan);
              const lScale = isTram ? 0.82 : 1.05;
              _scale.set(lScale, lScale, lScale);
              _mat.compose(_subPos, _quat, _scale);
              headIM.setMatrixAt(tr.solidTrainIdx * 2 + s, _mat);
            }

            if (isSubway) {
              if (showXrayPass) {
                _subPos.set(_pos.x, baseY + spec.carHeight * 0.38, _pos.z)
                  .addScaledVector(_fwd, spec.carLength * 0.51);
                _scale.set(1.2, 1.2, spec.carWidth * 1.1);
                _mat.compose(_subPos, _quat, _scale);
                xrayHeadIM.setMatrixAt(tr.xrayTrainIdx, _mat);
              } else {
                xrayHeadIM.setMatrixAt(tr.xrayTrainIdx, _hideMat);
              }
            }
          }

          // 8. Rear Driver Cab Windshield & Twin Crimson Taillights (tail car c === last)
          if (slot.isTail) {
            const isExpress = tr.noseStyle === 'express';
            const rakeAngle = isExpress ? -0.34 : (isTram ? -0.20 : -0.14);
            const noseRear = -spec.carLength * (isExpress ? 0.465 : 0.482);

            _tiltZ.setFromAxisAngle(_zAxis, rakeAngle);
            _glassQuat.copy(_quat).multiply(_tiltZ);
            _subPos.set(_pos.x, baseY + spec.carHeight * (isExpress ? 0.64 : 0.66), _pos.z)
              .addScaledVector(_fwd, noseRear);
            _scale.set(0.18, spec.carHeight * (isExpress ? 0.32 : 0.34), spec.carWidth * (isExpress ? 0.78 : 0.86));
            _mat.compose(_subPos, _glassQuat, _scale);
            cabGlassIM.setMatrixAt(tr.solidTrainIdx * 2 + 1, _mat);

            const lampSpan = spec.carWidth * 0.30;
            const lampRear = -spec.carLength * (isExpress ? 0.498 : 0.495);
            for (let s = 0; s < 2; s++) {
              const sgn = s === 0 ? -1 : 1;
              _subPos.set(_pos.x, baseY + spec.carHeight * 0.34, _pos.z)
                .addScaledVector(_fwd, lampRear)
                .addScaledVector(_right, sgn * lampSpan);
              const lScale = isTram ? 0.82 : 1.05;
              _scale.set(lScale, lScale, lScale);
              _mat.compose(_subPos, _quat, _scale);
              tailIM.setMatrixAt(tr.solidTrainIdx * 2 + s, _mat);
            }
          }
        }
      }
    }

    for (const pool of Object.values(carPools)) {
      if (pool.leadIM) pool.leadIM.instanceMatrix.needsUpdate = true;
      if (pool.midIM) pool.midIM.instanceMatrix.needsUpdate = true;
    }
    bogieIM.instanceMatrix.needsUpdate = true;
    hvacIM.instanceMatrix.needsUpdate = true;
    pantoIM.instanceMatrix.needsUpdate = true;
    couplerIM.instanceMatrix.needsUpdate = true;
    cabGlassIM.instanceMatrix.needsUpdate = true;
    destIM.instanceMatrix.needsUpdate = true;
    headIM.instanceMatrix.needsUpdate = true;
    tailIM.instanceMatrix.needsUpdate = true;
    if (showXrayPass) {
      xrayCarIM.instanceMatrix.needsUpdate = true;
      xrayHeadIM.instanceMatrix.needsUpdate = true;
    }
  }

  syncVisibility();

  function setStationHover(keyOrName) {
    for (const info of stationLabelByName.values()) {
      info.sprite.userData.hovered = Boolean(keyOrName) && (info.key === keyOrName || info.name === keyOrName);
    }
  }

  function getStationInfo(name) {
    return stationLabelByName.get(name) || stationLabelByName.get(`tram:${name}`) || null;
  }

  /**
   * Prefer live DEM-refined station pose; fall back to catalog lat/lon metadata.
   */
  function resolveStationCameraView(name, fallbackMeta = null) {
    const preferTram = Boolean(fallbackMeta?.isTram);
    const live = preferTram
      ? stationLabelByName.get(`tram:${name}`)
      : stationLabelByName.get(name);
    if (live) return getStationCameraView(live);
    if (!fallbackMeta) {
      const any = getStationInfo(name);
      return any ? getStationCameraView(any) : null;
    }

    const groundY = fallbackMeta.initGroundY ?? 0;
    const trackPos = latLonToGround(
      fallbackMeta.lat,
      fallbackMeta.lon,
      groundY + (fallbackMeta.relY ?? 0)
    );
    return getStationCameraView({
      name: fallbackMeta.name,
      code: fallbackMeta.code || '',
      lineName: fallbackMeta.lineName || '',
      isSubway: Boolean(fallbackMeta.isSubway),
      isTram: Boolean(fallbackMeta.isTram),
      relY: fallbackMeta.relY ?? 0,
      trackPos,
      groundY,
    });
  }

  const totalTramTrains = RAIL_LINES
    .filter(l => l.group === 'tram')
    .reduce((s, l) => s + l.trainCountPerDir * 2, 0);

  return {
    group: rootGroup,
    update,
    setMode,
    getMode: () => railMode,
    setLineEnabled,
    getLineEnabled: () => ({ ...lineEnabled }),
    pickStation,
    getStationInfo,
    getStationCameraView,
    resolveStationCameraView,
    setStationHover,
    getStats: () => ({
      totalTrains: totalSolidTrains,
      subwayTrains: totalXrayTrains,
      tramTrains: totalTramTrains,
      jrTrains: totalSolidTrains - totalXrayTrains - totalTramTrains,
      stations: stationLabelByName.size,
    }),
  };
}
