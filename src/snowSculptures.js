import * as THREE from 'three';

function addBox(group, w, h, d, x, y, z, mat, cast = true, receive = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  group.add(m);
  return m;
}

function addCyl(group, rt, rb, h, seg, x, y, z, mat, cast = true) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

// Soft edge-faded volumetric stage spotlight beam cone
export function createLightBeam(from, to, radiusBottom, color, opacity = 0.14) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.ConeGeometry(radiusBottom, len, 24, 1, true);
  // Cone apex at origin, wide end at +Z = len
  geo.translate(0, -len * 0.5, 0);
  geo.rotateX(-Math.PI * 0.5);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormView;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vNormView;
      varying vec3 vViewDir;
      void main() {
        // Soft edge falloff so cone never shows hard polygon edges
        float edge = pow(abs(dot(normalize(vNormView), normalize(vViewDir))), 1.9);
        // vUv.y = 1 at apex (projector), 0 at wide end
        float along = smoothstep(0.0, 0.55, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
        float a = edge * along * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(from);
  mesh.lookAt(to);
  return mesh;
}

// Stage lighting truss tower in front of each Giant Snow Sculpture
export function createLightingTruss(x, z, height = 2.8) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x1d222b, metalness: 0.75, roughness: 0.35 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xd8f0ff,
    emissiveIntensity: 3.5,
  });
  addBox(g, 0.24, height, 0.24, 0, height * 0.5, 0, metal, false, false);
  addBox(g, 0.45, 0.14, 0.85, 0, height, 0, metal, false, false);
  addBox(g, 0.16, 0.16, 0.2, 0.12, height + 0.12, -0.24, lampMat, false, false);
  addBox(g, 0.16, 0.16, 0.2, 0.12, height + 0.12,  0.24, lampMat, false, false);
  g.position.set(x, 0, z);
  return g;
}

// ==================== GIANT SCULPTURE #1: SNOW CASTLE KEEP (白雪の大城郭) ====================
export function buildSnowCastle(snowMat, projSnowMat, iceMat) {
  const g = new THREE.Group();

  // 1. Massive Battered Ishigaki Stone-Wall Snow Pedestal (trapezoidal tapered base)
  const baseGeo = new THREE.CylinderGeometry(3.2, 4.1, 1.55, 4);
  baseGeo.rotateY(Math.PI / 4);
  baseGeo.scale(0.82, 1.0, 1.48); // Wide in Z (facing +X East), deep in X
  const base = new THREE.Mesh(baseGeo, projSnowMat);
  base.position.set(0, 0.78, 0);
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  // Carved horizontal snow courses & recessed front castle gate (facing +X)
  addBox(g, 0.35, 0.95, 1.45, 2.15, 0.52, 0, snowMat);
  addBox(g, 0.28, 0.78, 0.82, 2.26, 0.42, 0, new THREE.MeshStandardMaterial({
    color: 0x3b4d78,
    emissive: 0x2548a8,
    emissiveIntensity: 0.75,
    roughness: 0.9,
  }), false, true);
  // Snow stairs descending to spectator stage
  for (let s = 0; s < 4; s++) {
    addBox(g, 0.42, 0.16, 2.2 + s * 0.22, 2.45 + s * 0.34, 0.56 - s * 0.14, 0, snowMat);
  }
  // Wooden Snow Festival Performance Stage Deck in front
  const stageMat = new THREE.MeshStandardMaterial({ color: 0x2d2a2e, roughness: 0.8 });
  addBox(g, 1.4, 0.22, 6.4, 3.85, 0.11, 0, stageMat, false, true);
  // Glowing blue/gold stage rim strip
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x6ecbff, emissive: 0x3daaff, emissiveIntensity: 2.2,
  });
  addBox(g, 0.08, 0.08, 6.4, 4.55, 0.22, 0, rimMat, false, false);

  // 2. Five-Tiered Tenshukaku Castle Keep (with graceful curved eaves & gables!)
  const tiers = [
    { y: 1.55, w: 3.1, d: 5.2, h: 0.82, eaveW: 3.8, eaveD: 6.1, eaveH: 0.34 },
    { y: 2.55, w: 2.55, d: 4.1, h: 0.74, eaveW: 3.25, eaveD: 5.0, eaveH: 0.32 },
    { y: 3.45, w: 2.05, d: 3.2, h: 0.66, eaveW: 2.75, eaveD: 4.05, eaveH: 0.30 },
    { y: 4.28, w: 1.55, d: 2.35, h: 0.58, eaveW: 2.2, eaveD: 3.15, eaveH: 0.28 },
    { y: 5.02, w: 1.15, d: 1.72, h: 0.54, eaveW: 1.75, eaveD: 2.45, eaveH: 0.36 },
  ];

  tiers.forEach((t, idx) => {
    // Castle wall tier
    addBox(g, t.w, t.h, t.d, 0, t.y + t.h * 0.5, 0, projSnowMat);

    // Carved window niches along the +X facade for shadow relief!
    const winCount = Math.max(2, 5 - idx);
    for (let k = 0; k < winCount; k++) {
      const wz = ((k / (winCount - 1 || 1)) - 0.5) * (t.d * 0.7);
      addBox(g, 0.14, t.h * 0.42, 0.24, t.w * 0.5 + 0.02, t.y + t.h * 0.54, wz, snowMat);
    }

    // Sweeping sloped roof eave (4-sided pyramid frustum)
    const roofGeo = new THREE.CylinderGeometry(
      Math.min(t.w, t.d) * 0.58,
      Math.min(t.eaveW, t.eaveD) * 0.68,
      t.eaveH,
      4
    );
    roofGeo.rotateY(Math.PI / 4);
    roofGeo.scale(t.eaveW / Math.min(t.eaveW, t.eaveD) * 0.92, 1.0, t.eaveD / Math.min(t.eaveW, t.eaveD) * 0.92);
    const roof = new THREE.Mesh(roofGeo, projSnowMat);
    roof.position.set(0, t.y + t.h + t.eaveH * 0.35, 0);
    roof.castShadow = true;
    roof.receiveShadow = true;
    g.add(roof);

    // Chidori-hafu triangular decorative gable on the front (+X)
    if (idx < 4) {
      const gGeo = new THREE.ConeGeometry(0.55 - idx * 0.08, 0.45, 3);
      gGeo.rotateY(Math.PI / 6);
      const gable = new THREE.Mesh(gGeo, snowMat);
      gable.position.set(t.w * 0.5 + 0.16, t.y + t.h + 0.28, 0);
      gable.castShadow = true;
      g.add(gable);
    }
  });

  // Top Ridge & Twin Shachihoko Roof Finials (illuminated warm snow gold!)
  addBox(g, 0.26, 0.22, 1.55, 0, 5.88, 0, snowMat);
  const shachiMat = new THREE.MeshStandardMaterial({
    color: 0xfff4d6,
    emissive: 0xffb840,
    emissiveIntensity: 1.6,
    roughness: 0.4,
  });
  addCyl(g, 0.06, 0.14, 0.55, 6, 0, 6.18, -0.78, shachiMat);
  addCyl(g, 0.06, 0.14, 0.55, 6, 0, 6.18,  0.78, shachiMat);

  // 3. Twin Flanking Corner Watchtowers (小天守) at z = ±3.35
  for (const side of [-1, 1]) {
    const wz = side * 3.35;
    addBox(g, 2.0, 1.8, 1.9, 0.25, 0.9, wz, projSnowMat);
    addBox(g, 1.6, 0.95, 1.5, 0.25, 2.25, wz, projSnowMat);
    const r1 = new THREE.Mesh(new THREE.ConeGeometry(1.55, 0.65, 4), projSnowMat);
    r1.rotation.y = Math.PI / 4;
    r1.position.set(0.25, 2.95, wz);
    r1.castShadow = true;
    g.add(r1);
    addBox(g, 1.05, 0.68, 1.05, 0.25, 3.32, wz, projSnowMat);
    const r2 = new THREE.Mesh(new THREE.ConeGeometry(1.12, 0.62, 4), snowMat);
    r2.rotation.y = Math.PI / 4;
    r2.position.set(0.25, 3.92, wz);
    r2.castShadow = true;
    g.add(r2);
    // Connecting snow rampart wall with battlements
    addBox(g, 1.2, 1.35, 1.25, 0.35, 0.95, side * 2.3, projSnowMat);
  }

  // Translucent carved ice lanterns flanking the stage
  for (const side of [-1, 1]) {
    const lz = side * 3.85;
    addBox(g, 0.55, 0.45, 0.55, 3.2, 0.24, lz, snowMat);
    addCyl(g, 0.18, 0.24, 0.85, 8, 3.2, 0.88, lz, iceMat, false);
  }

  return g;
}

// ==================== GIANT SCULPTURE #2: GOTHIC SNOW CATHEDRAL (氷雪の大聖堂) ====================
export function buildSnowCathedral(snowMat, iceMat) {
  const g = new THREE.Group();

  // Grand Snow Plinth & Steps
  addBox(g, 3.6, 0.72, 7.2, 0, 0.36, 0, snowMat);
  addBox(g, 0.85, 0.36, 4.4, 2.15, 0.18, 0, snowMat);

  // Central Nave Facade
  addBox(g, 2.6, 3.6, 3.2, 0, 2.5, 0, snowMat);

  // Deeply recessed triple Gothic portals on +X face
  const portalGlow = new THREE.MeshStandardMaterial({
    color: 0x62a8ff, emissive: 0x2665e8, emissiveIntensity: 1.2, roughness: 0.7,
  });
  for (const pz of [-1.05, 0, 1.05]) {
    const h = pz === 0 ? 1.55 : 1.15;
    addBox(g, 0.35, h, 0.65, 1.32, 0.72 + h * 0.5, pz, portalGlow, false, true);
    const arch = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.58, 4), snowMat);
    arch.rotation.y = Math.PI / 4;
    arch.position.set(1.42, 0.72 + h + 0.22, pz);
    g.add(arch);
  }

  // Iconic Carved Snow Rose Window (glowing violet-cyan ice center!)
  const roseRing = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.12, 10, 24), snowMat);
  roseRing.rotation.y = Math.PI / 2;
  roseRing.position.set(1.36, 3.25, 0);
  roseRing.castShadow = true;
  g.add(roseRing);
  const roseGlass = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 20),
    new THREE.MeshStandardMaterial({
      color: 0x99d6ff, emissive: 0x5c3eff, emissiveIntensity: 2.4, roughness: 0.2,
    })
  );
  roseGlass.rotation.y = Math.PI / 2;
  roseGlass.position.set(1.35, 3.25, 0);
  g.add(roseGlass);

  // Central triangular pediment gable
  const ped = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.35, 4), snowMat);
  ped.rotation.y = Math.PI / 4;
  ped.position.set(0.2, 4.95, 0);
  ped.castShadow = true;
  g.add(ped);

  // Twin Soaring Gothic Bell Towers at z = ±2.35
  for (const side of [-1, 1]) {
    const tz = side * 2.35;
    addBox(g, 2.2, 4.4, 1.8, 0.1, 2.9, tz, snowMat);
    // Vertical buttress pilasters
    for (const bz of [-0.85, 0.85]) {
      addBox(g, 2.45, 4.2, 0.24, 0.12, 2.8, tz + bz, snowMat);
    }
    // Belfry arches
    addBox(g, 0.25, 1.1, 0.55, 1.22, 4.1, tz, portalGlow, false, false);
    // Pointed spire + corner pinnacles
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.15, 2.1, 4), snowMat);
    spire.rotation.y = Math.PI / 4;
    spire.position.set(0.1, 6.15, tz);
    spire.castShadow = true;
    g.add(spire);
    for (const px of [-0.75, 0.75]) {
      for (const pz of [-0.65, 0.65]) {
        const pin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.85, 4), snowMat);
        pin.position.set(0.1 + px, 5.45, tz + pz);
        g.add(pin);
      }
    }
  }

  // Translucent ice colonnade flanking the steps
  for (const side of [-1, 1]) {
    addCyl(g, 0.16, 0.22, 1.6, 8, 2.2, 0.9, side * 3.1, iceMat, false);
  }
  return g;
}

// ==================== GIANT SCULPTURE #3: WINGED SNOW DRAGON & ICE SPIRE (白龍と氷晶) ====================
export function buildSnowDragon(snowMat, iceMat) {
  const g = new THREE.Group();

  // Sculpted snowy mountain mound pedestal
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.9, 1.25, 12), snowMat);
  mound.scale.set(0.85, 1, 1.45);
  mound.position.set(0, 0.62, 0);
  mound.castShadow = true;
  mound.receiveShadow = true;
  g.add(mound);

  // Towering Glowing Crystal Ice Monolith Spire in center
  const spire = new THREE.Mesh(new THREE.OctahedronGeometry(1.65, 0), iceMat);
  spire.scale.set(0.65, 2.4, 0.85);
  spire.position.set(-0.3, 3.6, 0);
  g.add(spire);
  const iceCore = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.8, 0),
    new THREE.MeshStandardMaterial({
      color: 0xa8f4ff, emissive: 0x2ce8ff, emissiveIntensity: 3.0, roughness: 0.1,
    })
  );
  iceCore.scale.set(0.55, 2.1, 0.65);
  iceCore.position.set(-0.3, 3.5, 0);
  g.add(iceCore);

  // Sculpted S-Curved Snow Dragon Body coiling upward
  const bodyPts = [
    [-1.0, 1.3, -2.2, 0.72],
    [-0.2, 1.7, -1.4, 0.68],
    [ 0.8, 2.2, -0.5, 0.66],
    [ 1.1, 2.9,  0.6, 0.60],
    [ 0.6, 3.7,  1.2, 0.54],
    [ 0.9, 4.4,  0.4, 0.50],
    [ 1.6, 4.7,  0.0, 0.58], // Dragon Head facing +X
  ];
  bodyPts.forEach(([x, y, z, r], i) => {
    const seg = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), snowMat);
    seg.position.set(x, y, z);
    seg.scale.set(1.15, 0.92, 1.0);
    seg.castShadow = true;
    seg.receiveShadow = true;
    g.add(seg);
    // Dorsal ice crest fin
    if (i > 0 && i < bodyPts.length - 1) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.75, 4), iceMat);
      fin.position.set(x - 0.15, y + r + 0.2, z);
      fin.rotation.z = 0.35;
      g.add(fin);
    }
  });
  // Dragon Snout & Glowing Cyan Eyes
  addBox(g, 0.78, 0.38, 0.46, 2.15, 4.65, 0, snowMat);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x80f8ff, emissive: 0x26e8ff, emissiveIntensity: 4.0,
  });
  addBox(g, 0.12, 0.1, 0.1, 1.95, 4.82, -0.24, eyeMat, false, false);
  addBox(g, 0.12, 0.1, 0.1, 1.95, 4.82,  0.24, eyeMat, false, false);

  // Sweeping Sculpted Snow Wings fanned symmetrically skyward!
  for (const side of [-1, 1]) {
    for (let f = 0; f < 5; f++) {
      const featherLen = 2.6 - f * 0.25;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.28, featherLen, 0.62), snowMat);
      wing.position.set(
        0.1 - f * 0.26,
        3.1 + f * 0.24,
        side * (1.35 + f * 0.44)
      );
      wing.rotation.x = side * (0.42 + f * 0.14);
      wing.rotation.z = 0.22 + f * 0.08;
      wing.castShadow = true;
      wing.receiveShadow = true;
      g.add(wing);
    }
  }

  return g;
}

// ==================== FESTIVAL YATAI STALLS & CROWD ====================
function buildFestivalAtmosphere(snowMat) {
  const g = new THREE.Group();
  const tentRoof = new THREE.MeshStandardMaterial({ color: 0xe6edf6, roughness: 0.85 });
  const boothWall = new THREE.MeshStandardMaterial({ color: 0x2d2420, roughness: 0.9 });
  const warmGlow = new THREE.MeshStandardMaterial({
    color: 0xffd282, emissive: 0xffa838, emissiveIntensity: 2.6,
  });
  const lanternRed = new THREE.MeshStandardMaterial({
    color: 0xff5a3c, emissive: 0xff3b1f, emissiveIntensity: 2.8,
  });
  const crowdMat = new THREE.MeshStandardMaterial({ color: 0x181c26, roughness: 0.9 });

  // Cozy Hokkaido Snow Festival Yatai Food Stalls along Odori sidelines
  const stallPositions = [
    [-5.5, -4.8], [-8.5, -4.8], [-5.5, 4.8], [-8.5, 4.8],
    [-19.5, -4.8], [-22.0, 4.8], [-33.5, -4.8], [-33.5, 4.8],
  ];
  for (const [sx, sz] of stallPositions) {
    addBox(g, 1.65, 0.95, 1.15, sx, 0.48, sz, boothWall, false, true);
    // Warm illuminated counter interior
    addBox(g, 1.45, 0.42, 1.22, sx, 0.72, sz, warmGlow, false, false);
    // Snow-topped pitched canopy roof
    addBox(g, 1.85, 0.18, 1.38, sx, 1.12, sz, tentRoof, false, true);
    // Hanging glowing red festival lanterns (提灯)
    for (const lx of [-0.55, 0, 0.55]) {
      addCyl(g, 0.07, 0.07, 0.18, 6, sx + lx, 0.96, sz + (sz < 0 ? 0.62 : -0.62), lanternRed, false);
    }
  }

  // Spectator Crowd Silhouettes gathered in viewing plazas in front of the 3 Giant Sculptures
  const plazas = [
    { xMin: -6.2, xMax: -1.5, zSpan: 4.0, count: 48 }, // Facing Snow Castle
    { xMin: -21.2, xMax: -16.8, zSpan: 3.8, count: 32 }, // Facing Snow Cathedral
    { xMin: -35.5, xMax: -31.5, zSpan: 3.6, count: 26 }, // Facing Snow Dragon
  ];
  let seed = 17;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  const bodyGeo = new THREE.CylinderGeometry(0.11, 0.15, 0.58, 6);
  const headGeo = new THREE.SphereGeometry(0.10, 6, 6);
  const totalCrowd = plazas.reduce((s, p) => s + p.count, 0);
  const bodies = new THREE.InstancedMesh(bodyGeo, crowdMat, totalCrowd);
  const heads = new THREE.InstancedMesh(headGeo, crowdMat, totalCrowd);
  const dummy = new THREE.Object3D();

  let idx = 0;
  for (const p of plazas) {
    for (let i = 0; i < p.count; i++) {
      const cx = p.xMin + rand() * (p.xMax - p.xMin);
      const cz = (rand() - 0.5) * 2 * p.zSpan;
      const hScale = 0.85 + rand() * 0.3;
      dummy.position.set(cx, 0.30 * hScale, cz);
      dummy.scale.set(1, hScale, 1);
      dummy.updateMatrix();
      bodies.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(cx, 0.65 * hScale, cz);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      heads.setMatrixAt(idx, dummy.matrix);
      idx++;
    }
  }
  g.add(bodies, heads);

  // Cute Citizen Snow Sculptures (市民雪像) lined in Nishi 6-chome
  for (let i = 0; i < 6; i++) {
    const cx = -32.2 + (i % 3) * 1.9;
    const cz = (i < 3 ? -2.8 : 2.8);
    addBox(g, 0.9, 0.35, 0.9, cx, 0.18, cz, snowMat, true, true);
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 10), snowMat);
    s1.position.set(cx, 0.62, cz);
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), snowMat);
    s2.position.set(cx, 1.12, cz);
    s1.castShadow = s2.castShadow = true;
    g.add(s1, s2);
  }

  return g;
}

// ==================== SUSUKINO ICE WORLD (すすきの会場 氷像) ====================
function buildSusukinoIceWorld(iceMat) {
  const g = new THREE.Group();
  const ledColors = [0x29d4ff, 0xff3da8, 0x3effb4, 0xffb838, 0x7b5cff, 0x45e3ff];

  for (let i = 0; i < 6; i++) {
    const iz = 15.2 + i * 2.25;
    const ix = -2.5; // Right down the pedestrianized center of Susukino Ekimae-dori!
    const col = ledColors[i % ledColors.length];

    // Illuminated LED ice plinth
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.36, 1.15),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: col, emissiveIntensity: 2.2, roughness: 0.25,
      })
    );
    plinth.position.set(ix, 0.20, iz);
    g.add(plinth);

    // Intricate faceted crystal ice sculpture on top
    const iceShape = i % 3 === 0
      ? new THREE.OctahedronGeometry(0.68, 0)
      : i % 3 === 1
        ? new THREE.TorusKnotGeometry(0.42, 0.13, 36, 8)
        : new THREE.IcosahedronGeometry(0.62, 0);
    const mesh = new THREE.Mesh(iceShape, iceMat);
    mesh.position.set(ix, 1.18, iz);
    mesh.scale.set(0.95, 1.35, 0.95);
    g.add(mesh);

    // Subtle localized colored point light on every other ice sculpture
    if (i % 2 === 0) {
      const pt = new THREE.PointLight(col, 6.5, 9, 1.8);
      pt.position.set(ix, 1.2, iz);
      g.add(pt);
    }
  }
  return g;
}

// ==================== SHARED HELPER: PROJECT UNIFIED FRONT UVs FOR CASTLE MAPPING ====================
export function applyCastleProjectionUVs(castle, projSnowMat) {
  const vTmp = new THREE.Vector3();
  castle.traverse(child => {
    if (child.isMesh && child.material === projSnowMat && child.geometry?.attributes?.position) {
      const pos = child.geometry.attributes.position;
      let uv = child.geometry.attributes.uv;
      if (!uv) {
        uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
        child.geometry.setAttribute('uv', uv);
      }
      child.updateMatrix();
      for (let i = 0; i < pos.count; i++) {
        vTmp.fromBufferAttribute(pos, i).applyMatrix4(child.matrix);
        const uCoord = Math.max(0, Math.min(1, (vTmp.z + 4.4) / 8.8));
        const vCoord = Math.max(0, Math.min(1, vTmp.y / 6.2));
        uv.setXY(i, uCoord, vCoord);
      }
      uv.needsUpdate = true;
    }
  });
}

// ==================== SHARED HELPER: CREATE FESTIVAL PBR MATERIALS ====================
export function createFestivalMaterials(snowBumpMap, projectionTex) {
  const snowMat = new THREE.MeshStandardMaterial({
    color: 0xb6c8de,
    roughness: 0.78,
    metalness: 0.02,
    bumpMap: snowBumpMap,
    bumpScale: 0.075,
  });

  const projSnowMat = new THREE.MeshStandardMaterial({
    color: 0x9cb2cc,
    roughness: 0.76,
    metalness: 0.03,
    bumpMap: snowBumpMap,
    bumpScale: 0.07,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: projectionTex,
    emissiveIntensity: 0.78,
  });

  const iceMat = new THREE.MeshPhysicalMaterial({
    color: 0xd4f4ff,
    emissive: 0x2498ee,
    emissiveIntensity: 0.78,
    roughness: 0.06,
    metalness: 0.14,
    transparent: true,
    opacity: 0.80,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    envMapIntensity: 2.2,
  });

  return { snowMat, projSnowMat, iceMat };
}

// ==================== MAIN EXPORT: BUILD ALL SNOW FESTIVAL SCULPTURES ====================
export function createSnowFestivalZone(scene, snowBumpMap, projectionTex) {
  const group = new THREE.Group();
  const { snowMat, projSnowMat, iceMat } = createFestivalMaterials(snowBumpMap, projectionTex);

  // Place Giant Snow Sculpture #1: Grand Snow Castle Keep at Odori Nishi 4-chome (x = -12.5)
  const castle = buildSnowCastle(snowMat, projSnowMat, iceMat);
  applyCastleProjectionUVs(castle, projSnowMat);
  castle.position.set(-12.5, 0.08, 0);
  group.add(castle);

  // Place Giant Snow Sculpture #2: Gothic Snow Cathedral at Odori Nishi 5-chome (x = -26.5)
  const cathedral = buildSnowCathedral(snowMat, iceMat);
  cathedral.position.set(-26.5, 0.08, 0);
  group.add(cathedral);

  // Place Giant Snow Sculpture #3: Winged Snow Dragon & Ice Spire at Odori Nishi 7-chome (x = -40.5)
  const dragon = buildSnowDragon(snowMat, iceMat);
  dragon.position.set(-40.5, 0.08, 0);
  group.add(dragon);

  // Volumetric Spotlight Beams & Truss Towers for the 3 Giant Sculptures!
  const beams = [];
  const stageLights = [];

  const rigs = [
    { x: -6.4, targetX: -12.2, targetY: 3.5, cols: [0x4cc9ff, 0xffb347] },
    { x: -20.8, targetX: -26.2, targetY: 3.6, cols: [0x8c5cff, 0x38d8ff] },
    { x: -35.0, targetX: -40.2, targetY: 3.2, cols: [0x2ee8ff, 0xff5ca8] },
  ];
  for (const r of rigs) {
    for (let s = 0; s < 2; s++) {
      const tz = s === 0 ? -3.7 : 3.7;
      group.add(createLightingTruss(r.x, tz, 2.7));
      const beam = createLightBeam(
        new THREE.Vector3(r.x, 2.75, tz),
        new THREE.Vector3(r.targetX, r.targetY, (s === 0 ? -1.4 : 1.4)),
        2.3,
        r.cols[s],
        0.13
      );
      group.add(beam);
      beams.push({ mesh: beam, baseColor: new THREE.Color(r.cols[s]), phase: r.x + s * 2 });
    }
    // Real dynamic stage illumination on each giant snow sculpture (calibrated to prevent whiteout)
    const ptA = new THREE.PointLight(r.cols[0], 5.5, 18, 1.8);
    ptA.position.set(r.x + 0.6, 3.8, -2.6);
    const ptB = new THREE.PointLight(r.cols[1], 4.8, 18, 1.8);
    ptB.position.set(r.x + 0.6, 3.6, 2.6);
    group.add(ptA, ptB);
    stageLights.push(ptA, ptB);
  }

  // Festival Yatai Stalls, Crowd & Citizen Sculptures
  group.add(buildFestivalAtmosphere(snowMat));

  // Susukino Ice World Crystal Sculptures
  group.add(buildSusukinoIceWorld(iceMat));

  scene.add(group);

  return {
    group,
    projSnowMat,
    update(time, nightFactor, projEnabled) {
      projSnowMat.emissiveIntensity = projEnabled ? (0.35 + 0.58 * nightFactor) : 0.0;
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
        l.intensity = (2.8 + 4.4 * nightFactor) * (0.9 + 0.1 * Math.sin(time * 1.8 + i));
      });
    },
  };
}
