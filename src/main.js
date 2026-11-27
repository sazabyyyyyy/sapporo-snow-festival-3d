import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import {
  createSnowTextures,
  createSnowflakeSprite,
  createProjectionMappingTexture,
} from './textures.js';
import { createSapporoCity } from './sapporoCity.js';
import { createSnowFestivalZone } from './snowSculptures.js';

// ==================== DOM REFS ====================
const wrap = document.getElementById('stage-wrap');
const shotButtons = Array.from(document.querySelectorAll('#shot-bar button'));
const shotTitle = document.getElementById('shot-title');
const shotSub = document.getElementById('shot-sub');
const fpsReadout = document.getElementById('fps-readout');
const timeline = document.getElementById('timeline');
const timecode = document.getElementById('timecode');
const btnPlay = document.getElementById('btn-play');
const btnTime = document.getElementById('btn-time');
const btnProj = document.getElementById('btn-proj');
const btnCam = document.getElementById('btn-cam');
const btnScope = document.getElementById('btn-scope');
const btnRec = document.getElementById('btn-rec');
const btnFs = document.getElementById('btn-fs');
const slSnow = document.getElementById('sl-snow');
const barTop = document.getElementById('bar-top');
const barBot = document.getElementById('bar-bot');
const cutFade = document.getElementById('cut-fade');
const recBadge = document.getElementById('rec-badge');
const recTimer = document.getElementById('rec-timer');

const lerp = (a, b, t) => a + (b - a) * t;
const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);

// ==================== RENDERER & SCENE ====================
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.className = 'w-full h-full block';
wrap.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x181c30, 0.0095);

// PMREM Environment for crisp reflections on glass skyscrapers, wet roads & ice sculptures
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex;
scene.environmentIntensity = 0.42;

const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.25, 360);
camera.position.set(-2, 4.5, 4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.485;
controls.minDistance = 5;
controls.maxDistance = 95;
controls.target.set(-12, 3.0, 0);

// ==================== POST-PROCESSING (UNREAL BLOOM + ACES OUTPUT) ====================
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(800, 400), 0.34, 0.45, 1.05);
const outputPass = new OutputPass();
composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(outputPass);

// ==================== PROCEDURAL WINTER SKY DOME ====================
const skyUniforms = {
  uTime: { value: 0 },
  uZenith: { value: new THREE.Color(0x060d26) },
  uHorizon: { value: new THREE.Color(0x6e353d) },
  uSunDir: { value: new THREE.Vector3(-0.82, 0.14, 0.42).normalize() },
  uSunCol: { value: new THREE.Color(0xff7d42) },
  uStars: { value: 0.7 },
};
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(280, 32, 20),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime, uStars;
      uniform vec3 uZenith, uHorizon, uSunDir, uSunCol;
      varying vec3 vDir;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * vnoise(p);
          p = p * 2.03 + vec2(11.3, 5.7);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 sky = mix(uHorizon, uZenith, pow(h, 0.48));
        float sunAmt = max(dot(d, normalize(uSunDir)), 0.0);
        sky += uSunCol * exp(-abs(d.y) * 9.0) * 0.25;
        sky += uSunCol * pow(sunAmt, 10.0) * 0.42;
        sky += uSunCol * pow(sunAmt, 140.0) * 2.2;

        if (d.y > 0.02) {
          vec2 cuv = d.xz / (d.y + 0.16) * 1.1 + vec2(uTime * 0.008, -uTime * 0.004);
          float c = fbm(cuv);
          float mask = smoothstep(0.46, 0.80, c) * smoothstep(0.02, 0.18, d.y) * smoothstep(0.85, 0.20, d.y);
          vec3 cCol = mix(uHorizon * 1.15, uSunCol * 1.25, pow(sunAmt, 3.0) * 0.7 + 0.15);
          sky = mix(sky, cCol, mask * 0.40);
        }

        if (uStars > 0.02 && d.y > 0.07) {
          vec2 suv = d.xz / (d.y + 0.35) * 155.0;
          vec2 id = floor(suv), gv = fract(suv) - 0.5;
          float r = hash(id);
          if (r > 0.968) {
            float tw = 0.65 + 0.35 * sin(uTime * (2.0 + r * 6.0) + r * 40.0);
            float st = smoothstep(0.16, 0.0, length(gv)) * tw * smoothstep(0.07, 0.28, d.y);
            sky += vec3(0.86, 0.93, 1.0) * st * uStars * 1.8;
          }
        }
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  })
);
scene.add(skyDome);

// ==================== LIGHTING RIG (REAL PCF SHADOWS) ====================
const hemiLight = new THREE.HemisphereLight(0x5274b8, 0x2a2030, 0.85);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xff9b62, 1.85);
sunLight.position.set(-48, 26, 22);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 5;
sunLight.shadow.camera.far = 140;
sunLight.shadow.camera.left = -56;
sunLight.shadow.camera.right = 32;
sunLight.shadow.camera.top = 34;
sunLight.shadow.camera.bottom = -34;
sunLight.shadow.bias = -0.0006;
scene.add(sunLight);

// Subtle cool rim fill light from east sky
const rimLight = new THREE.DirectionalLight(0x5b86d6, 0.55);
rimLight.position.set(42, 22, -24);
scene.add(rimLight);

// ==================== BUILD WORLD & SNOW FESTIVAL ====================
const { bumpMap: snowBump } = createSnowTextures();
const projMapping = createProjectionMappingTexture();
const sapporoCity = createSapporoCity(scene, snowBump);
const snowFestival = createSnowFestivalZone(scene, snowBump, projMapping.texture);

// ==================== 3D VOLUMETRIC SNOWFALL ====================
const SNOW_COUNT = 3400;
const snowPos = new Float32Array(SNOW_COUNT * 3);
const snowVel = new Float32Array(SNOW_COUNT * 3);
for (let i = 0; i < SNOW_COUNT; i++) {
  snowPos[i * 3]     = (Math.random() - 0.5) * 60;
  snowPos[i * 3 + 1] = Math.random() * 28;
  snowPos[i * 3 + 2] = (Math.random() - 0.5) * 60;
  snowVel[i * 3]     = 0.4 + Math.random() * 0.8;
  snowVel[i * 3 + 1] = 1.4 + Math.random() * 1.9;
  snowVel[i * 3 + 2] = (Math.random() - 0.5) * 0.7;
}
const snowGeo = new THREE.BufferGeometry();
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snowMatPts = new THREE.PointsMaterial({
  map: createSnowflakeSprite(),
  color: 0xf4f8ff,
  size: 0.42,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const snowPoints = new THREE.Points(snowGeo, snowMatPts);
scene.add(snowPoints);

function updateSnow(dt, time, camPos, amount) {
  snowPoints.visible = amount > 0.01;
  if (!snowPoints.visible) return;
  snowMatPts.opacity = Math.min(0.88, amount * 0.85);
  const pos = snowGeo.attributes.position.array;
  const half = 30, boxH = 28;
  for (let i = 0; i < SNOW_COUNT; i++) {
    const i3 = i * 3;
    let x = pos[i3] + (snowVel[i3] + Math.sin(time * 0.8 + i) * 0.4) * dt;
    let y = pos[i3 + 1] - snowVel[i3 + 1] * dt;
    let z = pos[i3 + 2] + (snowVel[i3 + 2] + Math.cos(time * 0.7 + i * 0.5) * 0.35) * dt;

    // Keep snow box centered around active camera
    while (x - camPos.x > half) x -= half * 2;
    while (x - camPos.x < -half) x += half * 2;
    while (z - camPos.z > half) z -= half * 2;
    while (z - camPos.z < -half) z += half * 2;
    if (y < 0.05) y += boxH;
    if (y > boxH + 1) y -= boxH;

    pos[i3] = x;
    pos[i3 + 1] = y;
    pos[i3 + 2] = z;
  }
  snowGeo.attributes.position.needsUpdate = true;
}

// ==================== TIME OF DAY PRESETS ====================
const TIME_PRESETS = [
  {
    label: 'トワイライト',
    clock: '17:48',
    zenith: 0x060d26,
    horizon: 0x7a3840,
    sunCol: 0xff8347,
    sunDir: [-0.82, 0.14, 0.42],
    sunInt: 1.05,
    hemiTop: 0x4b6cb0,
    hemiBot: 0x241b2c,
    hemiInt: 0.68,
    fogCol: 0x1a182b,
    fogDen: 0.0078,
    night: 0.88,
    stars: 0.65,
    bloom: 0.34,
    exposure: 0.92,
    envInt: 0.26,
  },
  {
    label: '雪まつり夜景',
    clock: '20:15',
    zenith: 0x020512,
    horizon: 0x0f1a36,
    sunCol: 0x5d82cf,
    sunDir: [-0.4, 0.55, -0.5],
    sunInt: 0.42,
    hemiTop: 0x283e72,
    hemiBot: 0x14121e,
    hemiInt: 0.52,
    fogCol: 0x0a0f1f,
    fogDen: 0.0088,
    night: 1.15,
    stars: 1.25,
    bloom: 0.42,
    exposure: 1.02,
    envInt: 0.20,
  },
  {
    label: '冬の朝',
    clock: '08:30',
    zenith: 0x2158a8,
    horizon: 0xe6c8ba,
    sunCol: 0xfff0d4,
    sunDir: [0.80, 0.34, 0.25],
    sunInt: 1.75,
    hemiTop: 0x8eb8ec,
    hemiBot: 0x666066,
    hemiInt: 0.92,
    fogCol: 0x9ab0cc,
    fogDen: 0.0054,
    night: 0.14,
    stars: 0.0,
    bloom: 0.18,
    exposure: 0.86,
    envInt: 0.50,
  },
];

function applyAtmosphere(env) {
  skyUniforms.uZenith.value.setHex(env.zenith);
  skyUniforms.uHorizon.value.setHex(env.horizon);
  skyUniforms.uSunCol.value.setHex(env.sunCol);
  skyUniforms.uSunDir.value.set(...env.sunDir).normalize();
  skyUniforms.uStars.value = env.stars;

  sunLight.color.setHex(env.sunCol);
  sunLight.intensity = env.sunInt;
  sunLight.position.set(env.sunDir[0] * 60, Math.max(14, env.sunDir[1] * 65), env.sunDir[2] * 60);

  hemiLight.color.setHex(env.hemiTop);
  hemiLight.groundColor.setHex(env.hemiBot);
  hemiLight.intensity = env.hemiInt;

  scene.fog.color.setHex(env.fogCol);
  scene.fog.density = env.fogDen;
  scene.environmentIntensity = env.envInt;
  bloomPass.strength = env.bloom;
  renderer.toneMappingExposure = env.exposure;
}

// ==================== 6-SHOT CINEMATIC DIRECTOR ====================
const SHOTS = [
  {
    dur: 9.0,
    title: 'SAPPORO SNOW FESTIVAL · GRAND CASTLE',
    sub: '大通4丁目 大雪像「白雪の大城郭」プロジェクションマッピング',
    eval(u) {
      const t = smoother(u);
      const ang = lerp(-0.42, 0.46, t);
      const rad = lerp(12.2, 8.6, t);
      return {
        eye: [-12.5 + Math.cos(ang) * rad, lerp(2.2, 4.4, t), Math.sin(ang) * rad],
        tgt: [-12.5, lerp(2.6, 3.3, t), 0],
        fov: lerp(46, 42, t),
      };
    },
  },
  {
    dur: 9.5,
    title: 'ODORI PARK · SNOW SCULPTURES TO TV TOWER',
    sub: '白龍・大聖堂・大城郭の大雪像パレード → さっぽろテレビ塔',
    eval(u) {
      const t = smoother(u);
      return {
        eye: [lerp(-42, -1.5, t), lerp(7.8, 5.4, t) + Math.sin(u * Math.PI) * 1.4, lerp(4.8, -3.2, t)],
        tgt: [lerp(-22, 12.2, t), lerp(3.4, 8.4, t), lerp(0, 0, t)],
        fov: 46,
      };
    },
  },
  {
    dur: 7.5,
    title: 'SAPPORO TV TOWER · SOSEI RIVER',
    sub: 'さっぽろテレビ塔・電光時計 & 創成川リフレクション',
    eval(u) {
      const ang = lerp(-2.25, -0.45, smoother(u));
      const rad = lerp(17.5, 20.5, u);
      return {
        eye: [12.2 + Math.cos(ang) * rad, lerp(8.2, 14.5, smoother(u)), Math.sin(ang) * rad],
        tgt: [12.2, lerp(9.4, 7.6, u), 0],
        fov: 44,
      };
    },
  },
  {
    dur: 8.5,
    title: 'SUSUKINO ICE WORLD · SAPPORO STREETCAR',
    sub: 'すすきの会場 氷の彫刻 & ネオン街・札幌市電',
    eval(u) {
      const t = smoother(u);
      return {
        eye: [lerp(-1.9, -2.2, t), lerp(2.6, 5.2, t), lerp(9.8, 27.5, t)],
        tgt: [lerp(-3.4, -3.8, t), lerp(2.2, 2.8, t), lerp(18.5, 19.5, t)],
        fov: 48,
      };
    },
  },
  {
    dur: 7.5,
    title: 'AKARENGA · CLOCK TOWER · JR TOWER',
    sub: '赤れんが庁舎・札幌市時計台・JRタワースカイライン',
    eval(u) {
      const t = smoother(u);
      return {
        eye: [lerp(-22, 7.5, t), lerp(7.5, 13.5, t), lerp(-12, -15, t)],
        tgt: [lerp(-9.5, -1.5, t), lerp(3.8, 10.5, t), lerp(-22, -34, t)],
        fov: 45,
      };
    },
  },
  {
    dur: 8.5,
    title: 'MT. MOIWA & SAPPORO WINTER PANORAMA',
    sub: '藻岩山と雪まつりの札幌市街 — ワイドパノラマ',
    eval(u) {
      const t = smoother(u);
      return {
        eye: [lerp(28, 38, t), lerp(17.5, 25, t), lerp(-15, 16, t)],
        tgt: [lerp(-18, -28, t), lerp(4.2, 6.2, t), lerp(2, 8, t)],
        fov: lerp(46, 50, t),
      };
    },
  },
];

const TOTAL_DUR = SHOTS.reduce((s, x) => s + x.dur, 0);
const SHOT_STARTS = [];
{ let acc = 0; for (const sh of SHOTS) { SHOT_STARTS.push(acc); acc += sh.dur; } }

// ==================== STATE & INTERACTION ====================
let timeIdx = 0;
let playing = true;
let projEnabled = true;
let freeCam = false;
let scopeOn = true;
let snowAmount = 0.68;
let filmTime = 0;
let clockTime = 0;
let lastShotIdx = -1;

applyAtmosphere(TIME_PRESETS[timeIdx]);

function getShotAt(t) {
  const m = ((t % TOTAL_DUR) + TOTAL_DUR) % TOTAL_DUR;
  for (let i = SHOTS.length - 1; i >= 0; i--) {
    if (m >= SHOT_STARTS[i]) return { idx: i, u: (m - SHOT_STARTS[i]) / SHOTS[i].dur };
  }
  return { idx: 0, u: 0 };
}

function updateShotUI(idx) {
  shotButtons.forEach((b, i) => {
    const active = !freeCam && i === idx;
    b.className = 'ctrl-btn px-2 py-1 rounded-md border border-[var(--border)] ' + (
      active
        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] font-medium'
        : 'bg-[var(--card)] text-[var(--foreground)]'
    );
  });
  if (freeCam) {
    shotTitle.textContent = 'FREE DRONE CAMERA · SAPPORO SNOW FESTIVAL';
    shotSub.textContent = 'ドラッグで視点回転・ホイールでズーム・右ドラッグで移動';
  } else {
    shotTitle.textContent = SHOTS[idx].title;
    shotSub.textContent = SHOTS[idx].sub;
  }
}

function triggerCutFlash() {
  cutFade.style.opacity = '0.52';
  setTimeout(() => { cutFade.style.opacity = '0'; }, 90);
}

shotButtons.forEach((btn, idx) => {
  btn.addEventListener('click', () => {
    freeCam = false;
    controls.enabled = false;
    btnCam.textContent = 'シネマ自動';
    filmTime = SHOT_STARTS[idx] + 0.04;
    playing = true;
    btnPlay.textContent = '一時停止';
    triggerCutFlash();
    updateShotUI(idx);
  });
});

btnPlay.addEventListener('click', () => {
  playing = !playing;
  btnPlay.textContent = playing ? '一時停止' : '再生';
});

timeline.addEventListener('input', () => {
  freeCam = false;
  controls.enabled = false;
  btnCam.textContent = 'シネマ自動';
  filmTime = (Number(timeline.value) / 1000) * TOTAL_DUR;
});

btnTime.addEventListener('click', () => {
  timeIdx = (timeIdx + 1) % TIME_PRESETS.length;
  btnTime.textContent = TIME_PRESETS[timeIdx].label;
  applyAtmosphere(TIME_PRESETS[timeIdx]);
});

btnProj.addEventListener('click', () => {
  projEnabled = !projEnabled;
  btnProj.textContent = projEnabled ? 'マッピング: ON' : 'マッピング: OFF';
});

btnCam.addEventListener('click', () => {
  freeCam = !freeCam;
  controls.enabled = freeCam;
  btnCam.textContent = freeCam ? '自由ドローン' : 'シネマ自動';
  updateShotUI(getShotAt(filmTime).idx);
});

renderer.domElement.addEventListener('pointerdown', () => {
  if (!freeCam) {
    freeCam = true;
    controls.enabled = true;
    btnCam.textContent = '自由ドローン';
    updateShotUI(0);
  }
});
controls.enabled = false;

slSnow.addEventListener('input', () => {
  snowAmount = Number(slSnow.value) / 100;
});

btnScope.addEventListener('click', () => {
  scopeOn = !scopeOn;
  barTop.style.height = scopeOn ? '20px' : '0px';
  barBot.style.height = scopeOn ? '20px' : '0px';
  btnScope.textContent = scopeOn ? '2.39:1' : '16:9';
});

btnFs.addEventListener('click', () => {
  try {
    if (!document.fullscreenElement) wrap.requestFullscreen?.();
    else document.exitFullscreen?.();
  } catch {}
});

// ==================== WEBM VIDEO RECORDER ====================
let recorder = null, recChunks = [], recStart = 0;
btnRec.addEventListener('click', () => {
  if (recorder && recorder.state === 'recording') {
    recorder.stop();
    return;
  }
  if (typeof MediaRecorder === 'undefined' || !renderer.domElement.captureStream) {
    btnRec.textContent = '非対応';
    return;
  }
  try {
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const stream = renderer.domElement.captureStream(30);
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6500000 });
    recChunks = [];
    recorder.ondataavailable = ev => { if (ev.data.size > 0) recChunks.push(ev.data); };
    recorder.onstop = () => {
      const blob = new Blob(recChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sapporo-snow-festival-3d.webm';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      btnRec.textContent = '録画';
      recBadge.classList.add('hidden');
      recBadge.classList.remove('flex');
    };
    recorder.start();
    recStart = performance.now();
    btnRec.textContent = '停止';
    recBadge.classList.remove('hidden');
    recBadge.classList.add('flex');
  } catch {
    btnRec.textContent = '非対応';
  }
});

// ==================== RESIZE HANDLING ====================
function handleResize() {
  const rect = wrap.getBoundingClientRect();
  const w = Math.max(320, Math.round(rect.width));
  const h = Math.max(200, Math.round(rect.height));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
}
new ResizeObserver(handleResize).observe(wrap);
handleResize();

// ==================== MAIN ANIMATION LOOP ====================
let lastTs = performance.now();
let fpsSmooth = 60;
let projTick = 0;

function animate(ts) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;
  if (dt > 0) fpsSmooth = fpsSmooth * 0.9 + (1 / dt) * 0.1;

  clockTime += dt;
  if (playing && !freeCam) filmTime = (filmTime + dt) % TOTAL_DUR;

  if (recorder && recorder.state === 'recording') {
    const sec = Math.floor((ts - recStart) / 1000);
    recTimer.textContent = `REC ${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  }

  // Camera update
  if (freeCam) {
    controls.update();
  } else {
    const sh = getShotAt(filmTime);
    if (sh.idx !== lastShotIdx) {
      if (lastShotIdx !== -1) triggerCutFlash();
      lastShotIdx = sh.idx;
      updateShotUI(sh.idx);
    }
    const cam = SHOTS[sh.idx].eval(sh.u);
    camera.position.set(...cam.eye);
    camera.lookAt(...cam.tgt);
    controls.target.set(...cam.tgt);
    if (Math.abs(camera.fov - cam.fov) > 0.05) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
  }

  // Update dynamic subsystems
  const env = TIME_PRESETS[timeIdx];
  skyUniforms.uTime.value = clockTime;
  skyDome.position.copy(camera.position);

  // Update live projection mapping canvas at ~30fps for smooth low-overhead playback
  projTick += dt;
  if (projTick >= 0.033) {
    projTick = 0;
    projMapping.update(clockTime, projEnabled);
  }

  sapporoCity.update(clockTime, env.night, env.clock);
  snowFestival.update(clockTime, env.night, projEnabled);
  updateSnow(dt, clockTime, camera.position, snowAmount);

  // HUD updates
  timeline.value = String(Math.round((filmTime / TOTAL_DUR) * 1000));
  const secNow = Math.floor(filmTime);
  timecode.textContent = `${String(Math.floor(secNow / 60)).padStart(2, '0')}:${String(secNow % 60).padStart(2, '0')}`;
  fpsReadout.textContent = `${Math.round(fpsSmooth)} FPS · Three.js`;

  composer.render();
}

updateShotUI(0);
requestAnimationFrame(animate);
