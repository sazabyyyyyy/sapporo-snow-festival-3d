import * as THREE from 'three';

/**
 * Generates high-realism 3D rolling stock geometries and procedural PBR livery textures
 * for Sapporo Municipal Subway (5000/8000/9000), JR Hokkaido (733/Rapid Airport/Limited Express),
 * and Sapporo Streetcar (A1200 Polaris / 3300 Classic / Winter Ice Wrap).
 *
 * Local car space convention (unit scale 1x1x1, scaled per line in railNetwork.js):
 *   +X = forward (-0.5 rear .. +0.5 front nose)
 *   +Y = up (0.0 rail top .. 1.0 roof crown)
 *   +Z = right (-0.5 left side .. +0.5 right side)
 */

// ==================== 1. SCULPTED 3D CARBODY LOFT GEOMETRY ====================

/**
 * Cross-section perimeter traced CCW in (Z, Y) so (dX x dProfile) points strictly outward.
 * Includes lower underbody tumblehome, vertical side walls, cant-rail bevels, and arched roof crown.
 */
const CAR_PROFILE = [
  // Bottom underside (sits slightly above bogies at y = 0.14)
  { z: -0.44, y: 0.14, v: 0.04, role: 'bot' },
  { z:  0.44, y: 0.14, v: 0.04, role: 'bot' },
  // Right lower skirt & side wall
  { z:  0.495, y: 0.22, v: 0.14, role: 'side' },
  { z:  0.50,  y: 0.80, v: 0.82, role: 'side' },
  { z:  0.455, y: 0.92, v: 0.93, role: 'roof' },
  // Arched roof crown (right -> center -> left)
  { z:  0.26,  y: 0.985, v: 0.97, role: 'roof' },
  { z:  0.00,  y: 1.00,  v: 0.99, role: 'roof' },
  { z: -0.26,  y: 0.985, v: 0.97, role: 'roof' },
  // Left upper bevel & side wall
  { z: -0.455, y: 0.92, v: 0.93, role: 'roof' },
  { z: -0.50,  y: 0.80, v: 0.82, role: 'side' },
  { z: -0.495, y: 0.22, v: 0.14, role: 'side' },
];

/**
 * Builds a smooth lofted 3D train carbody with optional aerodynamic sloped nose (lead/tail cab)
 * and clean planar side UVs so procedural door/window/stripe textures align with zero distortion.
 */
export function createSculptedCarGeometry({ isLead = false, noseStyle = 'commuter' } = {}) {
  // Longitudinal stations along X (-0.5 .. +0.5)
  // Each station can smoothly taper width (wScale), roof height (yTopScale), or rake the upper nose!
  let stations;
  if (!isLead) {
    stations = [
      { x: -0.50, w: 0.99, yTop: 0.995, yBot: 1.0, rakeTop: 0.0 },
      { x: -0.47, w: 1.00, yTop: 1.00,  yBot: 1.0, rakeTop: 0.0 },
      { x:  0.47, w: 1.00, yTop: 1.00,  yBot: 1.0, rakeTop: 0.0 },
      { x:  0.50, w: 0.99, yTop: 0.995, yBot: 1.0, rakeTop: 0.0 },
    ];
  } else if (noseStyle === 'express') {
    // Sleek JR Hokkaido Limited Express aerodynamic sloped nose (789 / KiHa 261 style!)
    stations = [
      { x: -0.50, w: 0.99, yTop: 0.995, yBot: 1.0,  rakeTop:  0.00 },
      { x: -0.47, w: 1.00, yTop: 1.00,  yBot: 1.0,  rakeTop:  0.00 },
      { x:  0.34, w: 1.00, yTop: 1.00,  yBot: 1.0,  rakeTop:  0.00 },
      { x:  0.43, w: 0.96, yTop: 0.965, yBot: 0.92, rakeTop: -0.025 },
      { x:  0.485, w: 0.88, yTop: 0.86, yBot: 0.82, rakeTop: -0.055 },
      { x:  0.505, w: 0.78, yTop: 0.62, yBot: 0.78, rakeTop: -0.045 },
    ];
  } else if (noseStyle === 'tram') {
    // Modern low-floor Sapporo Polaris A1200 rounded panoramic nose
    stations = [
      { x: -0.50, w: 0.99, yTop: 0.995, yBot: 1.0,  rakeTop:  0.00 },
      { x: -0.46, w: 1.00, yTop: 1.00,  yBot: 1.0,  rakeTop:  0.00 },
      { x:  0.37, w: 1.00, yTop: 1.00,  yBot: 1.0,  rakeTop:  0.00 },
      { x:  0.45, w: 0.96, yTop: 0.98,  yBot: 0.88, rakeTop: -0.02 },
      { x:  0.50, w: 0.88, yTop: 0.92,  yBot: 0.80, rakeTop: -0.045 },
    ];
  } else {
    // Crisp modern Japanese commuter / subway cab (5000 / 8000 / 9000 / 733 series)
    stations = [
      { x: -0.50, w: 0.99, yTop: 0.995, yBot: 1.0,  rakeTop:  0.00 },
      { x: -0.47, w: 1.00, yTop: 1.00,  yBot: 1.0,  rakeTop:  0.00 },
      { x:  0.41, w: 1.00, yTop: 1.00,  yBot: 1.0,  rakeTop:  0.00 },
      { x:  0.47, w: 0.97, yTop: 0.985, yBot: 0.90, rakeTop: -0.015 },
      { x:  0.50, w: 0.92, yTop: 0.94,  yBot: 0.85, rakeTop: -0.032 },
    ];
  }

  const positions = [];
  const uvs = [];
  const indices = [];

  function samplePt(st, prof) {
    // Rake shifts upper vertices slightly backward at the nose for a realistic sloped cab windshield
    const yNorm = Math.max(0, (prof.y - 0.14) / 0.86);
    const x = st.x + st.rakeTop * Math.pow(yNorm, 1.35);
    const z = prof.z * st.w;
    const y = prof.role === 'bot'
      ? prof.y * st.yBot
      : 0.14 * st.yBot + (prof.y - 0.14) * st.yTop;
    return [x, y, z];
  }

  const nProf = CAR_PROFILE.length;
  // Build side/roof loft quads with duplicate vertices per face segment for crisp side/roof normals
  for (let i = 0; i < stations.length - 1; i++) {
    const s0 = stations[i];
    const s1 = stations[i + 1];
    for (let j = 0; j < nProf; j++) {
      const p0 = CAR_PROFILE[j];
      const p1 = CAR_PROFILE[(j + 1) % nProf];

      const a = samplePt(s0, p0);
      const b = samplePt(s1, p0);
      const c = samplePt(s1, p1);
      const d = samplePt(s0, p1);

      const baseIdx = positions.length / 3;
      positions.push(...a, ...b, ...c, ...d);

      // Map U along car length (0..1) and V along height (0..1) on side walls; roof uses top clean metallic strip
      const isRoofOrBot = p0.role === 'bot' && p1.role === 'bot';
      const u0 = isRoofOrBot ? 0.05 : Math.max(0.01, Math.min(0.99, a[0] + 0.5));
      const u1 = isRoofOrBot ? 0.05 : Math.max(0.01, Math.min(0.99, b[0] + 0.5));
      const v0 = isRoofOrBot ? 0.02 : p0.v;
      const v1 = isRoofOrBot ? 0.02 : p1.v;

      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
      // Outward winding: (a -> b -> c) and (a -> c -> d) since (b-a) is +X and (d-a) is CCW profile
      indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
    }
  }

  // Cap rear end (i = 0, facing -X) and front end (i = last, facing +X)
  function addEndCap(st, isFront) {
    const ringPts = CAR_PROFILE.map(p => samplePt(st, p));
    let cx = 0, cy = 0, cz = 0;
    for (const p of ringPts) { cx += p[0]; cy += p[1]; cz += p[2]; }
    cx /= ringPts.length; cy /= ringPts.length; cz /= ringPts.length;

    const centerIdx = positions.length / 3;
    positions.push(cx, cy, cz);
    // Sample clean neutral body/nose color from near edge of texture (u = 0.02, v = 0.45)
    uvs.push(0.02, 0.45);

    for (let j = 0; j < ringPts.length; j++) {
      positions.push(...ringPts[j]);
      uvs.push(0.02, CAR_PROFILE[j].v);
    }

    for (let j = 0; j < ringPts.length; j++) {
      const next = (j + 1) % ringPts.length;
      const vA = centerIdx + 1 + j;
      const vB = centerIdx + 1 + next;
      // Front cap (+X outward): center -> vB -> vA; Rear cap (-X outward): center -> vA -> vB
      if (isFront) {
        indices.push(centerIdx, vB, vA);
      } else {
        indices.push(centerIdx, vA, vB);
      }
    }
  }

  addEndCap(stations[0], false);
  addEndCap(stations[stations.length - 1], true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ==================== 2. SHARED 3D ROLLING STOCK DETAIL GEOMETRIES ====================

/**
 * Merges an array of non-indexed BufferGeometries (positions + normals) into one clean geometry.
 */
function mergeSimpleGeos(geos) {
  const nonIndexed = geos.map(g => (g.index ? g.toNonIndexed() : g));
  let totalVerts = 0;
  for (const g of nonIndexed) totalVerts += g.attributes.position.count;

  const pos = new Float32Array(totalVerts * 3);
  const norm = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (const g of nonIndexed) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, offset * 3);
    norm.set(g.attributes.normal.array, offset * 3);
    offset += g.attributes.position.count;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  return merged;
}

/**
 * Single-arm rooftop pantograph geometry (Z-shaped folded arm + twin carbon collector strips),
 * origin at roof mounting base (y = 0), extending ~1.05m upward.
 */
export function createPantographGeometry() {
  const parts = [];
  // Insulator base frame
  const base = new THREE.BoxGeometry(0.95, 0.10, 0.78);
  base.translate(0, 0.05, 0);
  parts.push(base);

  // Lower inclined arm (sloping back)
  const lower = new THREE.BoxGeometry(1.15, 0.07, 0.14);
  lower.rotateZ(-0.46);
  lower.translate(-0.18, 0.34, 0);
  parts.push(lower);

  // Upper inclined arm (sloping forward to collector head)
  const upper = new THREE.BoxGeometry(1.18, 0.06, 0.12);
  upper.rotateZ(0.42);
  upper.translate(-0.16, 0.78, 0);
  parts.push(upper);

  // Collector contact shoe bar (wide along Z)
  const shoe1 = new THREE.BoxGeometry(0.16, 0.05, 1.48);
  shoe1.translate(0.30, 1.02, 0);
  const shoe2 = new THREE.BoxGeometry(0.16, 0.05, 1.48);
  shoe2.translate(0.06, 1.02, 0);
  parts.push(shoe1, shoe2);

  return mergeSimpleGeos(parts);
}

/**
 * Undercarriage railway bogie truck with side frames + 4 steel wheels (origin at rail top y = 0).
 */
export function createBogieGeometry() {
  const parts = [];
  // Central bolster & side beams
  const frame = new THREE.BoxGeometry(2.35, 0.28, 1.88);
  frame.translate(0, 0.44, 0);
  parts.push(frame);

  // 4 cylindrical wheels (2 axles, left & right)
  for (const wx of [-0.78, 0.78]) {
    for (const wz of [-0.78, 0.78]) {
      const wheel = new THREE.CylinderGeometry(0.40, 0.40, 0.16, 10);
      wheel.rotateX(Math.PI / 2);
      wheel.translate(wx, 0.40, wz);
      parts.push(wheel);
    }
  }
  return mergeSimpleGeos(parts);
}

/**
 * Low-profile sculpted rooftop HVAC / air-conditioning unit pod with side louver profile.
 */
export function createHvacGeometry() {
  const parts = [];
  const main = new THREE.BoxGeometry(1.0, 0.72, 1.0);
  main.translate(0, 0.36, 0);
  const cap = new THREE.BoxGeometry(0.86, 0.28, 0.84);
  cap.translate(0, 0.86, 0);
  parts.push(main, cap);
  return mergeSimpleGeos(parts);
}

// ==================== 3. PROCEDURAL PBR TRAIN LIVERY TEXTURES ====================

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { canvas: c, ctx: c.getContext('2d') };
}

/**
 * Generates high-resolution procedural PBR side-livery textures (Diffuse + Emissive + Roughness)
 * featuring authentic Japanese sliding passenger doors, framed rounded windows, interior warm lighting,
 * brushed stainless/aluminum panels, side LED destination displays, and real Sapporo liveries!
 */
export function createTrainLiveryTextures(style) {
  const W = 512;
  const H = 256;
  const { canvas: dCan, ctx: dCtx } = makeCanvas(W, H);
  const { canvas: eCan, ctx: eCtx } = makeCanvas(W, H);
  const { canvas: rCan, ctx: rCtx } = makeCanvas(W, H);

  // Base metallic/painted body fill
  dCtx.fillStyle = style.body;
  dCtx.fillRect(0, 0, W, H);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, W, H);
  rCtx.fillStyle = style.stainless ? '#5e5e5e' : '#787878'; // Brushed metal / satin paint
  rCtx.fillRect(0, 0, W, H);

  // Subtle horizontal metallic panel shading & stainless corrugation beads
  const grad = dCtx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.0, 'rgba(255,255,255,0.22)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.04)');
  grad.addColorStop(0.72, 'rgba(0,0,0,0.04)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0.28)');
  dCtx.fillStyle = grad;
  dCtx.fillRect(0, 0, W, H);

  if (style.stainless) {
    dCtx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let y = 152; y < 220; y += 6) {
      dCtx.fillRect(0, y, W, 2);
    }
  }

  // Roof crown band (top of texture: y = 0..24, corresponding to v = 0.90..1.0)
  dCtx.fillStyle = style.roof;
  dCtx.fillRect(0, 0, W, 24);
  rCtx.fillStyle = '#b4b4b4'; // Matte painted/weathered roof
  rCtx.fillRect(0, 0, W, 24);

  // Lower skirt / underframe apron (bottom of texture: y = 222..256)
  dCtx.fillStyle = style.skirt || '#262d38';
  dCtx.fillRect(0, 222, W, 34);
  rCtx.fillStyle = '#9e9e9e';
  rCtx.fillRect(0, 222, W, 34);

  // Optional lower half body paint (e.g. Classic Sapporo Streetcar green lower half or Polaris skirt!)
  if (style.lowerHalf) {
    dCtx.fillStyle = style.lowerHalf;
    dCtx.fillRect(0, 140, W, 84);
  }

  // Signature horizontal livery stripes (upper cant-rail band + waist belt + accent pinstripe)
  if (style.topStripe) {
    dCtx.fillStyle = style.topStripe;
    dCtx.fillRect(0, 32, W, style.topStripeH || 12);
  }
  if (style.waistStripe) {
    dCtx.fillStyle = style.waistStripe;
    dCtx.fillRect(0, 146, W, style.waistStripeH || 24);
  }
  if (style.accentStripe) {
    dCtx.fillStyle = style.accentStripe;
    dCtx.fillRect(0, 171, W, 9);
  }
  if (style.lowerStripe) {
    dCtx.fillStyle = style.lowerStripe;
    dCtx.fillRect(0, 200, W, 12);
  }

  // Helper to draw a framed rounded passenger window with glossy glass + lit warm interior!
  function drawWindow(x, y, w, h, warmTint = '#ffdca0') {
    const rad = Math.min(7, w * 0.16, h * 0.16);
    // Metallic window bezel
    dCtx.fillStyle = '#18202c';
    dCtx.beginPath();
    dCtx.roundRect(x - 2, y - 2, w + 4, h + 4, rad + 1);
    dCtx.fill();

    // Tinted reflective glass pane
    const wg = dCtx.createLinearGradient(x, y, x, y + h);
    wg.addColorStop(0, '#101d30');
    wg.addColorStop(0.55, '#1a2f4a');
    wg.addColorStop(1, '#0d1726');
    dCtx.fillStyle = wg;
    dCtx.beginPath();
    dCtx.roundRect(x, y, w, h, rad);
    dCtx.fill();

    // Specular low-roughness glass in roughnessMap
    rCtx.fillStyle = '#141414';
    rCtx.beginPath();
    rCtx.roundRect(x, y, w, h, rad);
    rCtx.fill();

    // Warm lit cabin interior in emissiveMap (ceiling fluorescent glow + subtle seat/passenger silhouette)
    const eg = eCtx.createLinearGradient(x, y, x, y + h);
    eg.addColorStop(0, '#fff4dc');
    eg.addColorStop(0.45, warmTint);
    eg.addColorStop(0.85, '#b87a3d');
    eg.addColorStop(1, '#3d2818');
    eCtx.fillStyle = eg;
    eCtx.beginPath();
    eCtx.roundRect(x + 2, y + 2, w - 4, h - 4, Math.max(2, rad - 1));
    eCtx.fill();

    // Subtle interior seat/handrail divider shadow so windows look deep and inhabited
    eCtx.fillStyle = 'rgba(20, 16, 22, 0.34)';
    eCtx.fillRect(x + 2, y + h * 0.68, w - 4, h * 0.30);

    // Subtle window mullion bar
    if (w > 46) {
      dCtx.fillStyle = '#243040';
      dCtx.fillRect(x + w * 0.5 - 1.5, y, 3, h);
      eCtx.fillStyle = '#080c12';
      eCtx.fillRect(x + w * 0.5 - 1.5, y, 3, h);
    }
  }

  // Draw sliding passenger doors + windows according to rolling stock layout
  const doorCount = style.doors ?? 3;
  if (style.isTram) {
    // Low-floor articulated streetcar section: huge panoramic glass bays + sleek folding doors
    const bayW = W / 3;
    for (let b = 0; b < 3; b++) {
      const bx = b * bayW;
      if (b === 1) {
        // Double low-floor sliding tram door with tall glass
        dCtx.strokeStyle = 'rgba(15, 23, 36, 0.72)';
        dCtx.lineWidth = 3;
        dCtx.strokeRect(bx + 18, 52, bayW - 36, 162);
        drawWindow(bx + 26, 62, (bayW - 60) * 0.48, 92, '#ffe6b3');
        drawWindow(bx + 32 + (bayW - 60) * 0.48, 62, (bayW - 60) * 0.48, 92, '#ffe6b3');
      } else {
        // Wide scenic streetcar window
        drawWindow(bx + 14, 58, bayW - 28, 78, '#ffe6b3');
      }
    }
  } else if (style.isExpress) {
    // JR Hokkaido Limited Express: continuous smoked-glass window band + end vestibule doors!
    // End vestibule doors
    for (const dx of [18, W - 56]) {
      dCtx.fillStyle = style.doorFill || '#cbd5e1';
      dCtx.fillRect(dx, 50, 38, 168);
      dCtx.strokeStyle = '#334155';
      dCtx.lineWidth = 2;
      dCtx.strokeRect(dx, 50, 38, 168);
      drawWindow(dx + 8, 66, 22, 54, '#ffe4b0');
    }
    // Continuous black window belt along passenger saloon with 6 panoramic express windows
    dCtx.fillStyle = '#111827';
    dCtx.fillRect(72, 58, W - 144, 72);
    const winN = 6;
    const span = (W - 156) / winN;
    for (let i = 0; i < winN; i++) {
      drawWindow(78 + i * span + 3, 64, span - 8, 60, '#ffdf9e');
    }
  } else {
    // Commuter / Subway 3-door or 4-door layout (real Sapporo 5000/8000/9000 & JR 733 proportions!)
    const segW = W / doorCount;
    for (let i = 0; i < doorCount; i++) {
      const cx = (i + 0.5) * segW;
      const dw = doorCount >= 4 ? 44 : 52;
      const dx = cx - dw * 0.5;

      // Sliding double-leaf metallic door panel + center rubber seam
      dCtx.fillStyle = style.doorFill || style.body;
      dCtx.fillRect(dx, 48, dw, 170);
      dCtx.strokeStyle = 'rgba(20, 28, 40, 0.55)';
      dCtx.lineWidth = 2;
      dCtx.strokeRect(dx, 48, dw, 170);
      dCtx.beginPath();
      dCtx.moveTo(cx, 48);
      dCtx.lineTo(cx, 218);
      dCtx.stroke();

      // Re-apply waist stripe cleanly across doors if continuous (subways/JR)
      if (style.waistStripe && !style.breakStripeOnDoors) {
        dCtx.fillStyle = style.waistStripe;
        dCtx.fillRect(dx + 1, 146, dw - 2, style.waistStripeH || 24);
      }
      if (style.accentStripe && !style.breakStripeOnDoors) {
        dCtx.fillStyle = style.accentStripe;
        dCtx.fillRect(dx + 1, 171, dw - 2, 9);
      }

      // Twin door glass windows
      const gw = (dw - 14) * 0.5;
      drawWindow(dx + 4, 62, gw, 56, '#ffe5b0');
      drawWindow(cx + 3, 62, gw, 56, '#ffe5b0');

      // Passenger saloon windows between doors
      if (i < doorCount - 1) {
        const gapStart = dx + dw + 7;
        const gapEnd = (i + 1.5) * segW - dw * 0.5 - 7;
        const gapW = gapEnd - gapStart;
        if (gapW > 30) {
          drawWindow(gapStart, 60, gapW, 64, '#ffe2a6');
        }
      }
    }

    // End saloon windows at both car ends
    const firstDoorLeft = 0.5 * segW - (doorCount >= 4 ? 22 : 26);
    if (firstDoorLeft > 26) {
      drawWindow(10, 60, firstDoorLeft - 17, 64, '#ffe2a6');
      drawWindow(W - firstDoorLeft + 7, 60, firstDoorLeft - 17, 64, '#ffe2a6');
    }
  }

  // Glowing side LED destination indicator near upper center of every car!
  const ledX = W * 0.5 - 24;
  const ledY = 34;
  dCtx.fillStyle = '#070a10';
  dCtx.fillRect(ledX, ledY, 48, 12);
  eCtx.fillStyle = style.ledColor || '#ffae38';
  eCtx.fillRect(ledX + 4, ledY + 3, 40, 6);

  const map = new THREE.CanvasTexture(dCan);
  const emissiveMap = new THREE.CanvasTexture(eCan);
  const roughnessMap = new THREE.CanvasTexture(rCan);
  map.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, emissiveMap, roughnessMap]) {
    t.anisotropy = 8;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
  }

  return new THREE.MeshStandardMaterial({
    map,
    emissive: new THREE.Color(0xffffff),
    emissiveMap,
    emissiveIntensity: 1.5,
    roughnessMap,
    roughness: 0.92,
    metalness: style.stainless ? 0.55 : 0.28,
  });
}

/**
 * Curated authentic Sapporo rolling-stock livery library.
 */
export const TRAIN_LIVERIES = {
  // Sapporo Subway 5000 Series (Namboku Line — 4 doors, emerald green stripes)
  'subway-namboku': {
    body: '#e8eef5',
    roof: '#b8c4d2',
    skirt: '#28323e',
    topStripe: '#00a854',
    topStripeH: 10,
    waistStripe: '#00a854',
    waistStripeH: 24,
    accentStripe: '#007a3d',
    doors: 4,
    stainless: false,
    ledColor: '#4ade80',
  },
  // Sapporo Subway 8000 Series (Tozai Line — 3 doors, vivid orange stripes)
  'subway-tozai': {
    body: '#e8eef5',
    roof: '#b8c4d2',
    skirt: '#28323e',
    topStripe: '#f39800',
    topStripeH: 10,
    waistStripe: '#f39800',
    waistStripeH: 24,
    accentStripe: '#d97706',
    doors: 3,
    stainless: false,
    ledColor: '#fbbf24',
  },
  // Sapporo Subway 9000 Series (Toho Line — 3 doors, sky-blue belt + sleek modern look)
  'subway-toho': {
    body: '#eef3f8',
    roof: '#b4c2d4',
    skirt: '#1e293b',
    topStripe: '#0088d6',
    topStripeH: 10,
    waistStripe: '#0088d6',
    waistStripeH: 26,
    accentStripe: '#38bdf8',
    doors: 3,
    stainless: true,
    ledColor: '#38bdf8',
  },
  // JR Hokkaido 733 Series Commuter (Hakodate & Gakuen-Toshi Lines — brushed stainless + JR light green)
  'jr-commuter': {
    body: '#ced8e4',
    roof: '#8e9bab',
    skirt: '#1f2937',
    topStripe: '#1c2430',
    topStripeH: 8,
    waistStripe: '#22b14c',
    waistStripeH: 20,
    accentStripe: '#86efac',
    doors: 3,
    stainless: true,
    ledColor: '#ffad33',
  },
  // JR Hokkaido 733-3000 Rapid Airport (Chitose Line — brushed stainless + Rapid blue & JR green double band)
  'jr-airport': {
    body: '#d6e0ec',
    roof: '#919fb0',
    skirt: '#1e293b',
    topStripe: '#1d78d8',
    topStripeH: 10,
    waistStripe: '#1d78d8',
    waistStripeH: 22,
    accentStripe: '#22b14c',
    doors: 3,
    stainless: true,
    ledColor: '#38bdf8',
  },
  // JR Hokkaido Limited Express (789 Kamui / Lilac / KiHa 261 Hokuto — sleek silver + lavender/cyan)
  'jr-express': {
    body: '#e6edf5',
    roof: '#94a3b8',
    skirt: '#1e2433',
    topStripe: '#6366f1',
    topStripeH: 12,
    waistStripe: '#8b5cf6',
    waistStripeH: 20,
    accentStripe: '#38bdf8',
    lowerStripe: '#f59e0b',
    isExpress: true,
    stainless: true,
    ledColor: '#c4b5fd',
  },
  // Sapporo Streetcar A1200 Polaris (modern forest green & matte black low-floor tram)
  'tram-polaris': {
    body: '#eef2ee',
    lowerHalf: '#1a4735',
    roof: '#cbd5d0',
    skirt: '#141a1e',
    topStripe: '#1a4735',
    topStripeH: 10,
    waistStripe: '#84cc16',
    waistStripeH: 12,
    isTram: true,
    stainless: false,
    ledColor: '#facc15',
  },
  // Sapporo Streetcar 3300 Classic (iconic warm cream + deep Sapporo green lower half)
  'tram-classic': {
    body: '#f4eed8',
    lowerHalf: '#1d5e3a',
    roof: '#c8c4b4',
    skirt: '#1b2420',
    waistStripe: '#e5b84b',
    waistStripeH: 8,
    isTram: true,
    stainless: false,
    ledColor: '#fbbf24',
  },
  // Sapporo Streetcar Winter Snow-Miku / Ice Crystal Special Livery
  'tram-snow': {
    body: '#e8f7ff',
    lowerHalf: '#0284c7',
    roof: '#d4ecfa',
    skirt: '#162840',
    topStripe: '#38bdf8',
    topStripeH: 10,
    waistStripe: '#7dd3fc',
    waistStripeH: 14,
    isTram: true,
    stainless: false,
    ledColor: '#7dd3fc',
  },
};

export function resolveTrainLiveryKey(spec, trainIndexInDir, dir) {
  if (spec.id === 'namboku') return 'subway-namboku';
  if (spec.id === 'tozai') return 'subway-tozai';
  if (spec.id === 'toho') return 'subway-toho';
  if (spec.group === 'tram') {
    const v = (trainIndexInDir + (dir === -1 ? 1 : 0)) % 3;
    return v === 0 ? 'tram-polaris' : (v === 1 ? 'tram-classic' : 'tram-snow');
  }
  // JR Hokkaido lines
  if (trainIndexInDir === 0) return 'jr-express';
  if (spec.id === 'jr-chitose') return 'jr-airport';
  return 'jr-commuter';
}
