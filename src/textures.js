import * as THREE from 'three';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { canvas: c, ctx: c.getContext('2d') };
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1. Packed Snow Micro-Crystalline Bump & Roughness Texture
export function createSnowTextures() {
  const { canvas: bCan, ctx: bCtx } = makeCanvas(256, 256);
  const img = bCtx.createImageData(256, 256);
  const rng = mulberry32(9012);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      // Subtle wind-carved ripples + fine snow grain
      const wave = Math.sin(x * 0.08 + Math.sin(y * 0.05) * 2.0) * 18;
      const grain = (rng() - 0.5) * 42;
      const sparkle = rng() > 0.985 ? 55 : 0;
      const v = Math.max(0, Math.min(255, 132 + wave + grain + sparkle));
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  bCtx.putImageData(img, 0, 0);

  const bumpMap = new THREE.CanvasTexture(bCan);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(6, 6);
  return { bumpMap };
}

// 2. Realistic Architectural Building Facade PBR Maps (Diffuse + Roughness + Emissive)
export function createBuildingTextureSet(variant = 0) {
  const W = 512, H = 512;
  const rng = mulberry32(1000 + variant * 317);
  const { canvas: dCan, ctx: dCtx } = makeCanvas(W, H);
  const { canvas: eCan, ctx: eCtx } = makeCanvas(W, H);
  const { canvas: rCan, ctx: rCtx } = makeCanvas(W, H);

  const palettes = [
    { wall: '#3b4250', trim: '#292f3a', glass: '#111926' }, // Modern corporate steel
    { wall: '#554d48', trim: '#3b3532', glass: '#151b24' }, // Warm urban stone
    { wall: '#2c394d', trim: '#1d2636', glass: '#0e1726' }, // Glass curtain wall
    { wall: '#4a4e58', trim: '#323640', glass: '#141a22' }, // Hokkaido concrete/tile
  ];
  const pal = palettes[variant % palettes.length];

  dCtx.fillStyle = pal.wall;
  dCtx.fillRect(0, 0, W, H);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, W, H);
  rCtx.fillStyle = '#cfcfcf'; // Matte concrete ~0.81 roughness
  rCtx.fillRect(0, 0, W, H);

  const cols = variant === 2 ? 12 : 8 + (variant % 3) * 2;
  const rows = 14 + (variant % 2) * 4;
  const cw = W / cols;
  const rh = H / rows;

  // Horizontal concrete slab ledges
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    dCtx.fillStyle = pal.trim;
    dCtx.fillRect(0, y, W, rh * 0.16);
  }

  // Windows per floor
  for (let r = 0; r < rows; r++) {
    const floorOcc = 0.25 + rng() * 0.55;
    const isGround = r === rows - 1;
    for (let c = 0; c < cols; c++) {
      const padX = cw * (variant === 2 ? 0.08 : 0.16);
      const padY = rh * 0.22;
      const wx = c * cw + padX;
      const wy = r * rh + padY;
      const ww = cw - padX * 2;
      const wh = rh - padY * 1.45;

      // Dark glass backing + low roughness (glossy reflection!)
      dCtx.fillStyle = pal.glass;
      dCtx.fillRect(wx, wy, ww, wh);
      rCtx.fillStyle = '#242424'; // Smooth glass ~0.14 roughness
      rCtx.fillRect(wx, wy, ww, wh);

      // Mullion divider
      dCtx.fillStyle = pal.trim;
      dCtx.fillRect(wx + ww * 0.48, wy, 2, wh);

      const lit = isGround ? (rng() < 0.72) : (rng() < floorOcc);
      if (lit) {
        const temp = rng();
        let col;
        if (isGround) {
          col = temp < 0.6 ? '#ffd58a' : '#fff0cf';
        } else if (temp < 0.58) {
          col = '#ffcf7d'; // Warm tungsten office/hotel
        } else if (temp < 0.88) {
          col = '#d8ecff'; // Cool fluorescent office
        } else {
          col = '#ffdca8'; // Soft amber
        }
        const bright = 0.55 + rng() * 0.45;
        // Subtle vertical curtain/ceiling gradient inside lit room
        const g = eCtx.createLinearGradient(wx, wy, wx, wy + wh);
        g.addColorStop(0, col);
        g.addColorStop(0.65, col);
        g.addColorStop(1, '#3a2b1c');
        eCtx.globalAlpha = bright;
        eCtx.fillStyle = g;
        eCtx.fillRect(wx + 1, wy + 1, ww - 2, wh - 2);
        eCtx.globalAlpha = 1;

        // Blind / interior silhouette bars for realism
        if (!isGround && rng() < 0.35) {
          eCtx.fillStyle = 'rgba(0,0,0,0.45)';
          eCtx.fillRect(wx + 1, wy + 1, ww - 2, wh * (0.25 + rng() * 0.35));
        }

        dCtx.fillStyle = col;
        dCtx.globalAlpha = 0.45;
        dCtx.fillRect(wx + 1, wy + 1, ww - 2, wh - 2);
        dCtx.globalAlpha = 1;
      }
    }
  }

  const map = new THREE.CanvasTexture(dCan);
  const emissiveMap = new THREE.CanvasTexture(eCan);
  const roughnessMap = new THREE.CanvasTexture(rCan);
  map.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, emissiveMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return { map, emissiveMap, roughnessMap };
}

// 3. Wet/Icy Winter Asphalt Road Texture (with lane lines & tire sheen)
export function createWinterRoadTextures() {
  const { canvas: dCan, ctx: dCtx } = makeCanvas(256, 512);
  const { canvas: rCan, ctx: rCtx } = makeCanvas(256, 512);
  const rng = mulberry32(7731);

  dCtx.fillStyle = '#1b2029';
  dCtx.fillRect(0, 0, 256, 512);
  rCtx.fillStyle = '#888888';
  rCtx.fillRect(0, 0, 256, 512);

  // Snowy slush along curb edges
  const leftGrad = dCtx.createLinearGradient(0, 0, 48, 0);
  leftGrad.addColorStop(0, 'rgba(218, 228, 242, 0.92)');
  leftGrad.addColorStop(0.6, 'rgba(170, 185, 206, 0.35)');
  leftGrad.addColorStop(1, 'rgba(27, 32, 41, 0)');
  dCtx.fillStyle = leftGrad;
  dCtx.fillRect(0, 0, 48, 512);

  const rightGrad = dCtx.createLinearGradient(256, 0, 208, 0);
  rightGrad.addColorStop(0, 'rgba(218, 228, 242, 0.92)');
  rightGrad.addColorStop(0.6, 'rgba(170, 185, 206, 0.35)');
  rightGrad.addColorStop(1, 'rgba(27, 32, 41, 0)');
  dCtx.fillStyle = rightGrad;
  dCtx.fillRect(208, 0, 48, 512);

  // Glossy black-ice/wet tire tracks (low roughness = specular reflections!)
  for (const tx of [74, 102, 154, 182]) {
    rCtx.fillStyle = '#262626';
    rCtx.fillRect(tx - 9, 0, 18, 512);
    dCtx.fillStyle = 'rgba(10, 14, 20, 0.45)';
    dCtx.fillRect(tx - 9, 0, 18, 512);
  }

  // Asphalt grit
  for (let i = 0; i < 1600; i++) {
    const x = rng() * 256, y = rng() * 512;
    const v = 25 + Math.floor(rng() * 35);
    dCtx.fillStyle = `rgba(${v},${v + 4},${v + 10},0.35)`;
    dCtx.fillRect(x, y, 2, 2);
  }

  // Crisp Japanese center yellow-amber dashed line & white side lines
  dCtx.fillStyle = 'rgba(235, 190, 75, 0.72)';
  for (let y = 16; y < 512; y += 64) {
    dCtx.fillRect(125, y, 6, 36);
  }
  dCtx.fillStyle = 'rgba(225, 232, 240, 0.55)';
  dCtx.fillRect(42, 0, 4, 512);
  dCtx.fillRect(210, 0, 4, 512);

  const map = new THREE.CanvasTexture(dCan);
  const roughnessMap = new THREE.CanvasTexture(rCan);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return { map, roughnessMap };
}

// 4. Red Brick Texture (Former Hokkaido Government Office)
export function createRedBrickTexture() {
  const { canvas, ctx } = makeCanvas(256, 256);
  const rng = mulberry32(4211);
  ctx.fillStyle = '#5c261f';
  ctx.fillRect(0, 0, 256, 256);

  const bh = 12, bw = 28;
  for (let r = 0; r < 256 / bh; r++) {
    const off = (r % 2) * (bw / 2);
    for (let c = -1; c < 256 / bw + 1; c++) {
      const shade = 0.8 + rng() * 0.35;
      ctx.fillStyle = `rgb(${Math.round(138 * shade)},${Math.round(44 * shade)},${Math.round(36 * shade)})`;
      ctx.fillRect(c * bw + off + 1, r * bh + 1, bw - 2, bh - 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1.6);
  return tex;
}

// 5. Sapporo TV Tower Live Digital Clock LED Texture
export function createTVTowerClockTexture() {
  const { canvas, ctx } = makeCanvas(256, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  function update(timeText) {
    ctx.fillStyle = '#070b0d';
    ctx.fillRect(0, 0, 256, 128);
    // Subtle dark LED grid bezel
    ctx.strokeStyle = '#ff4433';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 248, 120);

    // Glowing emerald-green / cyan-green Panasonic-style Sapporo TV Tower LED clock
    ctx.save();
    ctx.font = 'bold 74px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#32ff8a';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#5cffaa';
    ctx.fillText(timeText, 128, 68);
    ctx.restore();

    tex.needsUpdate = true;
  }

  update('17:48');
  return { texture: tex, update };
}

// 6. Sapporo Clock Tower Analog Face Texture
export function createClockFaceTexture() {
  const { canvas, ctx } = makeCanvas(128, 128);
  ctx.fillStyle = '#fff3d0';
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#9c261f';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Hour ticks
  ctx.strokeStyle = '#1b1d22';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.lineWidth = i % 3 === 0 ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(a) * 42, 64 + Math.sin(a) * 42);
    ctx.lineTo(64 + Math.cos(a) * 51, 64 + Math.sin(a) * 51);
    ctx.stroke();
  }
  // Hands at 5:48
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 + 14, 64 + 26); ctx.stroke();
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 - 28, 64 - 28); ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 7. Authentic Susukino Japanese Neon Signboard Textures
export function createSusukinoSignTexture(text, bg, fg, vertical = true) {
  const { canvas, ctx } = makeCanvas(vertical ? 128 : 256, vertical ? 384 : 128);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Double neon tube border
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;
  ctx.shadowColor = fg;
  ctx.shadowBlur = 14;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = fg;
  ctx.shadowBlur = 16;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (vertical) {
    const chars = Array.from(text);
    const step = (canvas.height - 48) / Math.max(1, chars.length);
    ctx.font = `900 ${Math.min(54, Math.floor(step * 0.78))}px "Hiragino Sans", "Yu Gothic", sans-serif`;
    chars.forEach((ch, idx) => {
      ctx.fillText(ch, canvas.width / 2, 24 + step * (idx + 0.5));
    });
  } else {
    ctx.font = '900 48px "Hiragino Sans", "Yu Gothic", sans-serif';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 8. Soft Radial Snowflake Sprite
export function createSnowflakeSprite() {
  const { canvas, ctx } = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(235,245,255,0.85)');
  g.addColorStop(0.7, 'rgba(195,220,255,0.28)');
  g.addColorStop(1, 'rgba(195,220,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

// 9. LIVE ANIMATED PROJECTION MAPPING TEXTURE for the Giant Snow Castle!
export function createProjectionMappingTexture() {
  const W = 512, H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const flakes = Array.from({ length: 48 }, (_, i) => ({
    x: (i * 97) % W,
    y: (i * 53) % H,
    r: 1.5 + (i % 4) * 1.1,
    vy: 18 + (i % 5) * 9,
  }));

  function update(t, enabled) {
    if (!enabled) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);
      tex.needsUpdate = true;
      return;
    }

    // Cycle through 3 poetic Sapporo Snow Festival projection show themes
    const phase = (t * 0.12) % 3;

    // Deep atmospheric indigo/aurora base wash
    const bg = ctx.createLinearGradient(0, 0, W, H);
    if (phase < 1) {
      bg.addColorStop(0, '#071c4a');
      bg.addColorStop(0.5, '#17489e');
      bg.addColorStop(1, '#3b1c7a');
    } else if (phase < 2) {
      bg.addColorStop(0, '#1e0b36');
      bg.addColorStop(0.5, '#8a1e5e');
      bg.addColorStop(1, '#d96b1f');
    } else {
      bg.addColorStop(0, '#042a38');
      bg.addColorStop(0.5, '#0c7872');
      bg.addColorStop(1, '#1d3c94');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Sweeping Aurora Light Ribbons across the Snow Castle
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const y = H * (0.28 + k * 0.16)
          + Math.sin(x * 0.018 + t * (1.2 + k * 0.35) + k * 1.7) * 26
          + Math.cos(x * 0.009 - t * 0.8) * 14;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = k % 2 === 0
        ? `hsla(${(195 + t * 28 + k * 45) % 360}, 95%, 65%, 0.55)`
        : `hsla(${(42 + t * 20 + k * 35) % 360}, 100%, 68%, 0.5)`;
      ctx.lineWidth = 14 - k * 2;
      ctx.stroke();
    }

    // Architectural Scanning Gold Laser Lines (classic Snow Festival mapping motif!)
    const scanY = ((t * 58) % (H + 40)) - 20;
    const lg = ctx.createLinearGradient(0, scanY - 18, 0, scanY + 18);
    lg.addColorStop(0, 'rgba(255, 220, 120, 0)');
    lg.addColorStop(0.5, 'rgba(255, 236, 155, 0.85)');
    lg.addColorStop(1, 'rgba(255, 220, 120, 0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, scanY - 18, W, 36);

    // Vertical golden architectural outlines pulsing in sync
    ctx.strokeStyle = `rgba(255, 215, 110, ${0.28 + 0.25 * Math.sin(t * 2.4)})`;
    ctx.lineWidth = 2;
    for (let x = 32; x < W; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 32; y < H; y += 48) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Sparkling projected snow crystals / sakura petals
    for (const f of flakes) {
      const fy = (f.y + t * f.vy) % H;
      const fx = (f.x + Math.sin(t * 1.4 + f.y) * 18 + W) % W;
      ctx.fillStyle = phase > 1 && phase < 2 ? 'rgba(255, 195, 225, 0.85)' : 'rgba(215, 245, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(fx, fy, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    tex.needsUpdate = true;
  }

  update(0, true);
  return { texture: tex, update };
}
