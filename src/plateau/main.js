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
} from '../textures.js';
import {
  SAPPORO_POINTS,
  SAPPORO_WARD_VIEWS,
  latLonToGround,
  isInsideSapporo,
  findNearestWard,
} from './geo.js';
import { createWinterUniforms } from './winterMaterial.js';
import { createPlateauCityManager } from './plateauTiles.js';
import { createRealScaleTerrain } from './terrain.js';
import { createMapGroundLayer, MAP_STYLES } from './mapGround.js';
import { createPlateauFestivalOverlay } from './festivalOverlay.js';
import { PLATEAU_SHOTS } from './shots.js';

// ==================== DOM REFS ====================
const wrap = document.getElementById('stage-wrap');
const shotButtons = Array.from(document.querySelectorAll('#shot-bar button[data-shot]'));
const wardButtons = Array.from(document.querySelectorAll('#ward-bar button[data-ward]'));
const timeButtons = Array.from(document.querySelectorAll('#time-bar button[data-time]'));
const seasonButtons = Array.from(document.querySelectorAll('#season-bar button[data-season]'));
const weatherButtons = Array.from(document.querySelectorAll('#weather-bar button[data-weather]'));
const camPadButtons = Array.from(document.querySelectorAll('#cam-pad button[data-cam-act]'));
const camPad = document.getElementById('cam-pad');
const btnPadToggle = document.getElementById('btn-pad-toggle');
const lblPrecip = document.getElementById('lbl-precip');
const shotTitle = document.getElementById('shot-title');
const shotSub = document.getElementById('shot-sub');
const tileReadout = document.getElementById('tile-readout');
const fpsReadout = document.getElementById('fps-readout');
const timeline = document.getElementById('timeline');
const timecode = document.getElementById('timecode');
const btnPlay = document.getElementById('btn-play');
const btnLoc = document.getElementById('btn-loc');
const btnLod = document.getElementById('btn-lod');
const btnMap = document.getElementById('btn-map');
const btnStyle = document.getElementById('btn-style');
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
const tileProgressWrap = document.getElementById('tile-progress-wrap');
const tileProgressBar = document.getElementById('tile-progress-bar');

// ==================== RENDERER & REAL-SCALE SCENE ====================
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.className = 'w-full h-full block';
wrap.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x16192c, 0.00042);

// PMREM Environment for crisp reflections on ice sculptures, Sosei River & glass towers
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex;
scene.environmentIntensity = 0.32;

const camera = new THREE.PerspectiveCamera(46, 16 / 9, 2.0, 45000);
camera.position.set(0, 35, 90);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 12;
controls.maxDistance = 12000;
controls.target.copy(SAPPORO_POINTS.odoriNishi4).setY(12);

// ==================== POST-PROCESSING (UNREAL BLOOM + ACES OUTPUT) ====================
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(800, 400), 0.34, 0.45, 1.08);
const outputPass = new OutputPass();
composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(outputPass);

// ==================== PROCEDURAL WINTER SKY DOME (36km RADIUS) ====================
const skyUniforms = {
  uTime: { value: 0 },
  uZenith: { value: new THREE.Color(0x060d26) },
  uHorizon: { value: new THREE.Color(0x7a3840) },
  uSunDir: { value: new THREE.Vector3(-0.82, 0.14, 0.42).normalize() },
  uSunCol: { value: new THREE.Color(0xff8347) },
  uStars: { value: 0.7 },
  uCloudCover: { value: 0.55 },
  uOvercast: { value: 0.0 },
};
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(36000, 32, 20),
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
      uniform float uTime, uStars, uCloudCover, uOvercast;
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
        float sunVis = 1.0 - uOvercast * 0.85;
        sky += uSunCol * exp(-abs(d.y) * 9.0) * 0.25 * sunVis;
        sky += uSunCol * pow(sunAmt, 10.0) * 0.42 * sunVis;
        sky += uSunCol * pow(sunAmt, 140.0) * 2.2 * sunVis;

        if (d.y > 0.01) {
          vec2 cuv = d.xz / (d.y + 0.16) * 1.1 + vec2(uTime * 0.008, -uTime * 0.004);
          float c = fbm(cuv);
          float lowEdge = mix(0.62, 0.22, uCloudCover);
          float mask = smoothstep(lowEdge, lowEdge + 0.34, c) * smoothstep(0.01, 0.16, d.y) * smoothstep(0.92, 0.14, d.y);
          vec3 overcastCol = mix(uHorizon, vec3(dot(uHorizon, vec3(0.3, 0.55, 0.15))), 0.65) * 0.88;
          vec3 cCol = mix(
            mix(uHorizon * 1.15, uSunCol * 1.25, pow(sunAmt, 3.0) * 0.7 + 0.15),
            overcastCol,
            uOvercast
          );
          sky = mix(sky, cCol, mask * mix(0.28, 0.88, uCloudCover));
        }

        if (uStars > 0.02 && uOvercast < 0.75 && d.y > 0.07) {
          vec2 suv = d.xz / (d.y + 0.35) * 155.0;
          vec2 id = floor(suv), gv = fract(suv) - 0.5;
          float r = hash(id);
          if (r > 0.968) {
            float tw = 0.65 + 0.35 * sin(uTime * (2.0 + r * 6.0) + r * 40.0);
            float st = smoothstep(0.16, 0.0, length(gv)) * tw * smoothstep(0.07, 0.28, d.y);
            sky += vec3(0.86, 0.93, 1.0) * st * uStars * (1.0 - uOvercast) * 1.8;
          }
        }
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  })
);
scene.add(skyDome);

// ==================== REAL-SCALE LIGHTING RIG ====================
const hemiLight = new THREE.HemisphereLight(0x5274b8, 0x2a2030, 0.78);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xff9b62, 1.55);
sunLight.position.set(-480, 260, 220);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 50;
sunLight.shadow.camera.far = 1800;
sunLight.shadow.camera.left = -400;
sunLight.shadow.camera.right = 400;
sunLight.shadow.camera.top = 380;
sunLight.shadow.camera.bottom = -380;
sunLight.shadow.bias = -0.00045;
sunLight.shadow.normalBias = 0.35;
scene.add(sunLight);
scene.add(sunLight.target);

const rimLight = new THREE.DirectionalLight(0x5b86d6, 0.62);
rimLight.position.set(420, 220, -240);
scene.add(rimLight);

// ==================== BUILD PLATEAU WORLD, TERRAIN & SNOW FESTIVAL ====================
const { bumpMap: snowBump } = createSnowTextures();
const projMapping = createProjectionMappingTexture();
const winterUniforms = createWinterUniforms();

const terrain = createRealScaleTerrain(scene, snowBump);
const mapGround = createMapGroundLayer(scene, renderer);
const plateauCity = createPlateauCityManager({
  scene,
  camera,
  renderer,
  winterUniforms,
});
const festivalOverlay = createPlateauFestivalOverlay(scene, snowBump, projMapping.texture);

// ==================== 3D CURRENT LOCATION BEACON MARKER ====================
const locMarker = new THREE.Group();
locMarker.visible = false;
const locBeamMat = new THREE.MeshBasicMaterial({
  color: 0x34d399,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});
const locBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 4.5, 95, 16, 1, true), locBeamMat);
locBeam.position.y = 47.5;
const locPinMat = new THREE.MeshStandardMaterial({
  color: 0x6ee7b7,
  emissive: 0x10b981,
  emissiveIntensity: 3.4,
  roughness: 0.15,
  metalness: 0.2,
});
const locPin = new THREE.Mesh(new THREE.OctahedronGeometry(4.5, 0), locPinMat);
locPin.position.y = 28;
const locRingMat = new THREE.MeshBasicMaterial({
  color: 0x38bdf8,
  transparent: true,
  opacity: 0.85,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const locRing = new THREE.Mesh(new THREE.RingGeometry(6, 9, 36), locRingMat);
locRing.rotation.x = -Math.PI / 2;
locRing.position.y = 0.6;
const locBaseDisc = new THREE.Mesh(
  new THREE.CircleGeometry(5.5, 24),
  new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
);
locBaseDisc.rotation.x = -Math.PI / 2;
locBaseDisc.position.y = 0.5;
locMarker.add(locBeam, locPin, locRing, locBaseDisc);
scene.add(locMarker);

// ==================== REAL-SCALE 3D VOLUMETRIC SNOWFALL ====================
const SNOW_COUNT = 3600;
const SNOW_HALF = 140;
const SNOW_HEIGHT = 110;
const snowPos = new Float32Array(SNOW_COUNT * 3);
const snowVel = new Float32Array(SNOW_COUNT * 3);
for (let i = 0; i < SNOW_COUNT; i++) {
  snowPos[i * 3]     = (Math.random() - 0.5) * SNOW_HALF * 2;
  snowPos[i * 3 + 1] = Math.random() * SNOW_HEIGHT;
  snowPos[i * 3 + 2] = (Math.random() - 0.5) * SNOW_HALF * 2;
  snowVel[i * 3]     = 1.4 + Math.random() * 2.8;
  snowVel[i * 3 + 1] = 4.2 + Math.random() * 5.6;
  snowVel[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
}
const snowGeo = new THREE.BufferGeometry();
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snowMatPts = new THREE.PointsMaterial({
  map: createSnowflakeSprite(),
  color: 0xf4f8ff,
  size: 1.55,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const snowPoints = new THREE.Points(snowGeo, snowMatPts);
scene.add(snowPoints);

// ==================== REAL-SCALE 3D RAIN STREAKS (RAIN WEATHER) ====================
const RAIN_COUNT = 1800;
const RAIN_HALF = 110;
const RAIN_HEIGHT = 95;
const rainPos = new Float32Array(RAIN_COUNT * 6); // 2 vertices (top & bottom of streak) per drop
const rainSpeed = new Float32Array(RAIN_COUNT);
for (let i = 0; i < RAIN_COUNT; i++) {
  const rx = (Math.random() - 0.5) * RAIN_HALF * 2;
  const ry = Math.random() * RAIN_HEIGHT;
  const rz = (Math.random() - 0.5) * RAIN_HALF * 2;
  rainSpeed[i] = 48 + Math.random() * 26;
  const i6 = i * 6;
  rainPos[i6] = rx;
  rainPos[i6 + 1] = ry;
  rainPos[i6 + 2] = rz;
  rainPos[i6 + 3] = rx - 0.6;
  rainPos[i6 + 4] = ry - 3.6;
  rainPos[i6 + 5] = rz - 0.2;
}
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({
  color: 0xb8d8ff,
  transparent: true,
  opacity: 0.42,
  depthWrite: false,
});
const rainLines = new THREE.LineSegments(rainGeo, rainMat);
rainLines.visible = false;
scene.add(rainLines);

function updatePrecipitation(dt, time, camPos, amount, weather, season) {
  const isRain = weather === 'rain';
  const isSnow = weather === 'snow';
  const isSeasonalDrift = weather === 'clear' && (season === 'spring' || season === 'autumn') && amount > 0.05;

  // 1. Rain streaks
  rainLines.visible = isRain && amount > 0.01;
  if (rainLines.visible) {
    rainMat.opacity = Math.min(0.62, 0.2 + amount * 0.42);
    const pos = rainGeo.attributes.position.array;
    const minY = Math.max(0.5, camPos.y - 42);
    const maxY = minY + RAIN_HEIGHT;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const i6 = i * 6;
      let x = pos[i6] - 5.5 * dt;
      let y = pos[i6 + 1] - rainSpeed[i] * dt;
      let z = pos[i6 + 2] - 2.0 * dt;

      while (x - camPos.x > RAIN_HALF) x -= RAIN_HALF * 2;
      while (x - camPos.x < -RAIN_HALF) x += RAIN_HALF * 2;
      while (z - camPos.z > RAIN_HALF) z -= RAIN_HALF * 2;
      while (z - camPos.z < -RAIN_HALF) z += RAIN_HALF * 2;
      if (y < minY) y += RAIN_HEIGHT;
      if (y > maxY) y -= RAIN_HEIGHT;

      pos[i6] = x;
      pos[i6 + 1] = y;
      pos[i6 + 2] = z;
      pos[i6 + 3] = x - 0.55;
      pos[i6 + 4] = y - 3.8;
      pos[i6 + 5] = z - 0.2;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // 2. Snowflakes (snow weather) or gentle drifting Sakura Petals (spring) / Autumn Leaves (autumn)
  snowPoints.visible = (isSnow || isSeasonalDrift) && amount > 0.01;
  if (!snowPoints.visible) return;

  if (isSnow) {
    snowMatPts.color.setHex(0xf4f8ff);
    snowMatPts.size = 1.55;
    snowMatPts.opacity = Math.min(0.86, amount * 0.85);
  } else if (season === 'spring') {
    snowMatPts.color.setHex(0xffbfd8); // Cherry blossom petals!
    snowMatPts.size = 1.35;
    snowMatPts.opacity = Math.min(0.65, amount * 0.55);
  } else {
    snowMatPts.color.setHex(0xe58d35); // Drifting autumn leaves!
    snowMatPts.size = 1.45;
    snowMatPts.opacity = Math.min(0.60, amount * 0.50);
  }

  const pos = snowGeo.attributes.position.array;
  const minY = Math.max(0.5, camPos.y - 45);
  const maxY = minY + SNOW_HEIGHT;
  const fallMult = isSnow ? 1.0 : 0.55;
  for (let i = 0; i < SNOW_COUNT; i++) {
    const i3 = i * 3;
    let x = pos[i3] + (snowVel[i3] + Math.sin(time * 0.8 + i) * 1.8) * dt;
    let y = pos[i3 + 1] - snowVel[i3 + 1] * fallMult * dt;
    let z = pos[i3 + 2] + (snowVel[i3 + 2] + Math.cos(time * 0.7 + i * 0.5) * 1.4) * dt;

    while (x - camPos.x > SNOW_HALF) x -= SNOW_HALF * 2;
    while (x - camPos.x < -SNOW_HALF) x += SNOW_HALF * 2;
    while (z - camPos.z > SNOW_HALF) z -= SNOW_HALF * 2;
    while (z - camPos.z < -SNOW_HALF) z += SNOW_HALF * 2;
    if (y < minY) y += SNOW_HEIGHT;
    if (y > maxY) y -= SNOW_HEIGHT;

    pos[i3] = x;
    pos[i3 + 1] = y;
    pos[i3 + 2] = z;
  }
  snowGeo.attributes.position.needsUpdate = true;
}

// ==================== TIME OF DAY PRESETS (REAL-SCALE FOG) ====================
const TIME_PRESETS = [
  {
    label: 'トワイライト',
    clock: '17:48',
    zenith: 0x060d26,
    horizon: 0x7a3840,
    sunCol: 0xff8347,
    sunDir: [-0.82, 0.14, 0.42],
    sunInt: 1.15,
    hemiTop: 0x5274b8,
    hemiBot: 0x261c2e,
    hemiInt: 0.74,
    fogCol: 0x1a192e,
    fogDen: 0.00024,
    night: 0.88,
    stars: 0.65,
    bloom: 0.34,
    exposure: 0.96,
    envInt: 0.28,
    tint: 0x5a6d96,
    snowCol: 0xc2d2ea,
  },
  {
    label: '雪まつり夜景',
    clock: '20:15',
    zenith: 0x020512,
    horizon: 0x0f1a36,
    sunCol: 0x5d82cf,
    sunDir: [-0.4, 0.55, -0.5],
    sunInt: 0.48,
    hemiTop: 0x2b437a,
    hemiBot: 0x14121e,
    hemiInt: 0.58,
    fogCol: 0x0a1022,
    fogDen: 0.00026,
    night: 1.15,
    stars: 1.25,
    bloom: 0.42,
    exposure: 1.05,
    envInt: 0.22,
    tint: 0x3b4d78,
    snowCol: 0x9bb2d4,
  },
  {
    label: '冬の快晴（昼）',
    clock: '13:15',
    zenith: 0x104ea8,
    horizon: 0xb2d8f5,
    sunCol: 0xfff8ea,
    sunDir: [-0.26, 0.72, 0.64], // Crisp southern Hokkaido winter noon sun
    sunInt: 2.35,
    hemiTop: 0xb8dcff,
    hemiBot: 0x768496,
    hemiInt: 1.05,
    fogCol: 0xc2daf0,
    fogDen: 0.00009,
    night: 0.0,
    stars: 0.0,
    bloom: 0.09,
    exposure: 0.94,
    envInt: 0.65,
    tint: 0xffffff,
    snowCol: 0xf4f8ff,
  },
  {
    label: '冬の朝',
    clock: '08:30',
    zenith: 0x2158a8,
    horizon: 0xe6c8ba,
    sunCol: 0xfff0d4,
    sunDir: [0.80, 0.34, 0.25],
    sunInt: 1.80,
    hemiTop: 0x8eb8ec,
    hemiBot: 0x666066,
    hemiInt: 0.95,
    fogCol: 0x9ab0cc,
    fogDen: 0.00014,
    night: 0.10,
    stars: 0.0,
    bloom: 0.14,
    exposure: 0.90,
    envInt: 0.52,
    tint: 0xffffff,
    snowCol: 0xe4eef8,
  },
];

let activeSunDir = new THREE.Vector3(-0.82, 0.14, 0.42).normalize();

function updateSunShadowAnchor(focusPos) {
  // Snap shadow center to 16m increments so building shadows stay crisp without texel swimming
  const sx = Math.round(focusPos.x / 16) * 16;
  const sy = Math.round(Math.max(0, focusPos.y) / 16) * 16;
  const sz = Math.round(focusPos.z / 16) * 16;
  sunLight.target.position.set(sx, sy, sz);
  sunLight.position.set(
    sx + activeSunDir.x * 760,
    sy + Math.max(220, activeSunDir.y * 820),
    sz + activeSunDir.z * 760
  );
  sunLight.target.updateMatrixWorld();
}

const WEATHER_MODIFIERS = {
  clear:  { label: '快晴', cloud: 0.22, overcast: 0.00, sunMul: 1.08, hemiMul: 1.00, fogMul: 0.72, bloomMul: 1.00, expMul: 1.00 },
  cloudy: { label: '曇り', cloud: 0.86, overcast: 0.68, sunMul: 0.42, hemiMul: 1.12, fogMul: 1.45, bloomMul: 0.82, expMul: 0.94 },
  rain:   { label: '雨',   cloud: 0.96, overcast: 0.86, sunMul: 0.28, hemiMul: 0.95, fogMul: 1.95, bloomMul: 1.15, expMul: 0.90 },
  snow:   { label: '雪',   cloud: 0.72, overcast: 0.42, sunMul: 0.78, hemiMul: 1.06, fogMul: 1.30, bloomMul: 1.00, expMul: 0.98 },
};

const SEASON_LABELS = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

let activeSeason = 'winter';
let activeWeather = 'snow';

function applyAtmosphere(env) {
  const wm = WEATHER_MODIFIERS[activeWeather] || WEATHER_MODIFIERS.clear;

  // Blend overcast sky gray tint for cloudy/rainy moods
  const zenCol = new THREE.Color(env.zenith);
  const horCol = new THREE.Color(env.horizon);
  const fogCol = new THREE.Color(env.fogCol);
  if (wm.overcast > 0.05) {
    const grayZen = new THREE.Color().setScalar(zenCol.r * 0.3 + zenCol.g * 0.55 + zenCol.b * 0.15).lerp(new THREE.Color(0x4a5568), 0.35);
    const grayHor = new THREE.Color().setScalar(horCol.r * 0.3 + horCol.g * 0.55 + horCol.b * 0.15).lerp(new THREE.Color(0x64748b), 0.35);
    zenCol.lerp(grayZen, wm.overcast * 0.72);
    horCol.lerp(grayHor, wm.overcast * 0.72);
    fogCol.lerp(grayHor, wm.overcast * 0.55);
  }

  skyUniforms.uZenith.value.copy(zenCol);
  skyUniforms.uHorizon.value.copy(horCol);
  skyUniforms.uSunCol.value.setHex(env.sunCol);
  activeSunDir.set(...env.sunDir).normalize();
  skyUniforms.uSunDir.value.copy(activeSunDir);
  skyUniforms.uStars.value = env.stars;
  skyUniforms.uCloudCover.value = wm.cloud;
  skyUniforms.uOvercast.value = wm.overcast;

  sunLight.color.setHex(env.sunCol);
  sunLight.intensity = env.sunInt * wm.sunMul;
  updateSunShadowAnchor(controls.target);

  hemiLight.color.setHex(env.hemiTop);
  hemiLight.groundColor.setHex(env.hemiBot);
  hemiLight.intensity = env.hemiInt * wm.hemiMul;

  scene.fog.color.copy(fogCol);
  scene.fog.density = env.fogDen * wm.fogMul;
  scene.environmentIntensity = env.envInt * (activeWeather === 'rain' ? 1.18 : 1.0);
  bloomPass.strength = env.bloom * wm.bloomMul;
  renderer.toneMappingExposure = env.exposure * wm.expMul;

  winterUniforms.uNightFactor.value = env.night;
  winterUniforms.uTintColor.value.setHex(env.tint);
  winterUniforms.uSnowColor.value.setHex(env.snowCol);
  // Roof snow on PLATEAU buildings: full in winter, moderate when snow weather is forced in other seasons, 0 otherwise
  winterUniforms.uSnowCover.value = activeSeason === 'winter' ? 0.90 : (activeWeather === 'snow' ? 0.55 : 0.0);

  terrain.setSeasonAndWeather(activeSeason, activeWeather);
  mapGround.setAtmosphere(env.night, activeSeason, activeWeather);
  festivalOverlay.setSeason(activeSeason);

  // Update particle slider label to match current season/weather
  if (activeWeather === 'rain') lblPrecip.textContent = '雨量';
  else if (activeWeather === 'snow') lblPrecip.textContent = '降雪';
  else if (activeSeason === 'spring') lblPrecip.textContent = '桜吹雪';
  else if (activeSeason === 'autumn') lblPrecip.textContent = '落葉';
  else lblPrecip.textContent = '降水';

  timeButtons.forEach((b, i) => {
    const active = i === timeIdx;
    b.className = 'ctrl-btn px-2 py-1.5 ' + (
      active
        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] font-medium'
        : 'text-[var(--foreground)]'
    );
  });
  seasonButtons.forEach(b => {
    const active = b.dataset.season === activeSeason;
    b.className = 'ctrl-btn px-2 py-1 ' + (
      active
        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] font-medium'
        : 'text-[var(--foreground)]'
    );
  });
  weatherButtons.forEach(b => {
    const active = b.dataset.weather === activeWeather;
    b.className = 'ctrl-btn px-2 py-1 ' + (
      active
        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] font-medium'
        : 'text-[var(--foreground)]'
    );
  });
}

// ==================== TIMELINE & STATE ====================
const TOTAL_DUR = PLATEAU_SHOTS.reduce((s, x) => s + x.dur, 0);
const SHOT_STARTS = [];
{ let acc = 0; for (const sh of PLATEAU_SHOTS) { SHOT_STARTS.push(acc); acc += sh.dur; } }

let timeIdx = 0;
let playing = true;
let projEnabled = true;
let freeCam = false;
let scopeOn = true;
let snowAmount = 0.68;
let whiteModelMode = false;
let filmTime = 0;
let clockTime = 0;
let lastShotIdx = -1;
let activeWardId = null;
let activeLocationInfo = null;
let flyAnim = null; // Smooth camera fly-to transition when clicking a ward or current location button

const WARD_BY_ID = Object.fromEntries(SAPPORO_WARD_VIEWS.map(w => [w.id, w]));

applyAtmosphere(TIME_PRESETS[timeIdx]);

function getShotAt(t) {
  const m = ((t % TOTAL_DUR) + TOTAL_DUR) % TOTAL_DUR;
  for (let i = PLATEAU_SHOTS.length - 1; i >= 0; i--) {
    if (m >= SHOT_STARTS[i]) return { idx: i, u: (m - SHOT_STARTS[i]) / PLATEAU_SHOTS[i].dur };
  }
  return { idx: 0, u: 0 };
}

function updateWardUI() {
  wardButtons.forEach(b => {
    const active = freeCam && b.dataset.ward === activeWardId;
    b.className = 'ctrl-btn px-1.5 py-1 rounded border border-[var(--border)] ' + (
      active
        ? 'bg-sky-500 text-slate-950 font-semibold border-sky-300'
        : 'bg-[var(--card)] text-[var(--foreground)]'
    );
  });
}

function updateShotUI(idx) {
  shotButtons.forEach((b, i) => {
    const active = !freeCam && i === idx;
    b.className = 'ctrl-btn px-2.5 py-1.5 rounded-md border border-[var(--border)] ' + (
      active
        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] font-medium'
        : 'bg-[var(--card)] text-[var(--foreground)]'
    );
  });
  updateWardUI();
  if (freeCam) {
    if (activeLocationInfo) {
      shotTitle.textContent = activeLocationInfo.title;
      shotSub.textContent = activeLocationInfo.sub;
    } else {
      const w = activeWardId ? WARD_BY_ID[activeWardId] : null;
      if (w) {
        shotTitle.textContent = `SAPPORO WARD · ${w.name}`;
        shotSub.textContent = `${w.area} — ドラッグ回転・ホイールズーム・右ドラッグ移動`;
      } else {
        shotTitle.textContent = 'FREE DRONE CAMERA · PLATEAU SAPPORO';
        shotSub.textContent = '実寸PLATEAU札幌市街を自由飛行 — ドラッグ回転・ホイールズーム・右ドラッグ移動';
      }
    }
  } else {
    shotTitle.textContent = PLATEAU_SHOTS[idx].title;
    shotSub.textContent = PLATEAU_SHOTS[idx].sub;
  }
}

function flyToWard(wardId) {
  const w = WARD_BY_ID[wardId];
  if (!w) return;
  activeLocationInfo = null;
  activeWardId = wardId;
  freeCam = true;
  controls.enabled = true;
  btnCam.textContent = '自由ドローン';
  flyAnim = {
    startPos: camera.position.clone(),
    startTgt: controls.target.clone(),
    endPos: w.eye.clone(),
    endTgt: w.tgt.clone(),
    t: 0,
    dur: 1.05,
  };
  updateShotUI(0);
}

function requestCurrentLocation() {
  if (!navigator.geolocation) {
    shotTitle.textContent = 'GEOLOCATION UNAVAILABLE';
    shotSub.textContent = 'このブラウザでは位置情報（Geolocation API）を利用できません';
    return;
  }
  btnLoc.textContent = '📍 測位中...';
  btnLoc.disabled = true;

  navigator.geolocation.getCurrentPosition(
    pos => {
      btnLoc.textContent = '📍 現在地';
      btnLoc.disabled = false;
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      const accTxt = Number.isFinite(accuracy) ? `（誤差 ±${Math.round(accuracy)}m）` : '';

      if (!isInsideSapporo(lat, lon)) {
        activeLocationInfo = {
          title: 'CURRENT LOCATION · 札幌市外',
          sub: `現在地（${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E）は札幌市の表示範囲外です — 札幌10区ボタンから地域を選べます`,
        };
        freeCam = true;
        controls.enabled = true;
        btnCam.textContent = '自由ドローン';
        updateShotUI(0);
        return;
      }

      const nearest = findNearestWard(lat, lon);
      const groundPos = latLonToGround(lat, lon, nearest.groundY);

      locMarker.position.copy(groundPos);
      locMarker.visible = true;

      // Refine beacon height to exact GSI DEM road/ground elevation as soon as tile resolves
      mapGround.getLocalElevationAt(lat, lon).then(realY => {
        if (realY !== null && Number.isFinite(realY)) {
          locMarker.position.y = realY;
        }
      });

      const tgt = groundPos.clone().add(new THREE.Vector3(0, 18, 0));
      const eye = groundPos.clone().add(new THREE.Vector3(210, 125, 195));

      activeWardId = nearest.id;
      activeLocationInfo = {
        title: `CURRENT LOCATION · 現在地（${nearest.name}付近）`,
        sub: `${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E ${accTxt} — ドラッグ回転・ズーム可能`,
      };
      freeCam = true;
      controls.enabled = true;
      btnCam.textContent = '自由ドローン';
      flyAnim = {
        startPos: camera.position.clone(),
        startTgt: controls.target.clone(),
        endPos: eye,
        endTgt: tgt,
        t: 0,
        dur: 1.1,
      };
      updateShotUI(0);
    },
    err => {
      btnLoc.textContent = '📍 現在地';
      btnLoc.disabled = false;
      const msg = err.code === 1
        ? '位置情報の利用が拒否されました（ブラウザの許可設定を確認してください）'
        : err.code === 2
          ? '現在地を取得できませんでした（位置情報サービスを確認してください）'
          : '現在地の取得がタイムアウトしました';
      activeLocationInfo = {
        title: 'CURRENT LOCATION · 取得できませんでした',
        sub: msg,
      };
      freeCam = true;
      controls.enabled = true;
      btnCam.textContent = '自由ドローン';
      updateShotUI(0);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

function triggerCutFlash() {
  cutFade.style.opacity = '0.45';
  setTimeout(() => { cutFade.style.opacity = '0'; }, 90);
}

shotButtons.forEach((btn, idx) => {
  btn.addEventListener('click', () => {
    activeWardId = null;
    activeLocationInfo = null;
    flyAnim = null;
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

btnLoc.addEventListener('click', requestCurrentLocation);

wardButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    flyToWard(btn.dataset.ward);
  });
});

btnLod.addEventListener('click', () => {
  const next = plateauCity.getMode() === 'lod2' ? 'lod1' : 'lod2';
  plateauCity.loadMode(next);
  btnLod.textContent = next === 'lod2' ? '札幌全10区: LOD2' : '札幌全10区: LOD1';
});

const MAP_STYLE_ORDER = ['std', 'photo', 'pale'];
btnMap.addEventListener('click', () => {
  const idx = (MAP_STYLE_ORDER.indexOf(mapGround.getStyle()) + 1) % MAP_STYLE_ORDER.length;
  const next = MAP_STYLE_ORDER[idx];
  mapGround.setStyle(next);
  btnMap.textContent = MAP_STYLES[next].label;
  mapGround.update(controls.target);
});

btnStyle.addEventListener('click', () => {
  whiteModelMode = !whiteModelMode;
  winterUniforms.uWhiteModel.value = whiteModelMode ? 1.0 : 0.0;
  btnStyle.textContent = whiteModelMode ? 'ホワイト模型' : 'リアル質感';
});

btnPlay.addEventListener('click', () => {
  playing = !playing;
  btnPlay.textContent = playing ? '一時停止' : '再生';
});

timeline.addEventListener('input', () => {
  activeWardId = null;
  flyAnim = null;
  freeCam = false;
  controls.enabled = false;
  btnCam.textContent = 'シネマ自動';
  filmTime = (Number(timeline.value) / 1000) * TOTAL_DUR;
});

timeButtons.forEach((btn, idx) => {
  btn.addEventListener('click', () => {
    timeIdx = idx;
    applyAtmosphere(TIME_PRESETS[timeIdx]);
  });
});

seasonButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const nextSeason = btn.dataset.season;
    if (!nextSeason) return;
    activeSeason = nextSeason;
    // Automatically pair natural weather when changing between winter & non-winter (user can still override anytime)
    if (activeSeason === 'winter' && activeWeather === 'clear') {
      activeWeather = 'snow';
    } else if (activeSeason !== 'winter' && activeWeather === 'snow') {
      activeWeather = 'clear';
    }
    applyAtmosphere(TIME_PRESETS[timeIdx]);
  });
});

weatherButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const nextWeather = btn.dataset.weather;
    if (!nextWeather) return;
    activeWeather = nextWeather;
    applyAtmosphere(TIME_PRESETS[timeIdx]);
  });
});

// ==================== ON-SCREEN CAMERA CONTROL PAD (HOLD OR TAP) ====================
const heldCamActions = new Set();
const _camFwd = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camOffset = new THREE.Vector3();
const _camSph = new THREE.Spherical();

function ensureFreeCamForPad() {
  flyAnim = null;
  if (!freeCam) {
    freeCam = true;
    controls.enabled = true;
    btnCam.textContent = '自由ドローン';
    updateShotUI(0);
  }
}

function applyCameraPadStep(act, dtStep) {
  const dist = Math.max(20, camera.position.distanceTo(controls.target));
  // Speed scales cleanly with current camera distance so both street-level & city-wide movement feel responsive
  const moveSpeed = Math.max(45, dist * 0.72) * dtStep;
  const altSpeed = Math.max(30, dist * 0.45) * dtStep;
  const rotSpeed = 0.95 * dtStep;

  if (act === 'reset') {
    flyToWard('chuo');
    return;
  }

  ensureFreeCamForPad();

  camera.getWorldDirection(_camFwd);
  _camFwd.y = 0;
  if (_camFwd.lengthSq() < 1e-4) _camFwd.set(0, 0, -1);
  _camFwd.normalize();
  _camRight.crossVectors(_camFwd, THREE.Object3D.DEFAULT_UP).normalize();

  if (act === 'fwd') {
    camera.position.addScaledVector(_camFwd, moveSpeed);
    controls.target.addScaledVector(_camFwd, moveSpeed);
  } else if (act === 'back') {
    camera.position.addScaledVector(_camFwd, -moveSpeed);
    controls.target.addScaledVector(_camFwd, -moveSpeed);
  } else if (act === 'left') {
    camera.position.addScaledVector(_camRight, -moveSpeed);
    controls.target.addScaledVector(_camRight, -moveSpeed);
  } else if (act === 'right') {
    camera.position.addScaledVector(_camRight, moveSpeed);
    controls.target.addScaledVector(_camRight, moveSpeed);
  } else if (act === 'up') {
    camera.position.y += altSpeed;
    controls.target.y += altSpeed * 0.5;
  } else if (act === 'down') {
    const nextY = Math.max(5, camera.position.y - altSpeed);
    const dy = camera.position.y - nextY;
    camera.position.y = nextY;
    controls.target.y = Math.max(-18, controls.target.y - dy * 0.5);
  } else {
    _camOffset.subVectors(camera.position, controls.target);
    _camSph.setFromVector3(_camOffset);
    if (act === 'rotL') _camSph.theta += rotSpeed;
    else if (act === 'rotR') _camSph.theta -= rotSpeed;
    else if (act === 'tiltUp') _camSph.phi = Math.max(0.14, _camSph.phi - rotSpeed * 0.75);
    else if (act === 'tiltDown') _camSph.phi = Math.min(Math.PI * 0.485, _camSph.phi + rotSpeed * 0.75);
    else if (act === 'zoomIn') _camSph.radius = Math.max(controls.minDistance, _camSph.radius * Math.pow(0.45, dtStep));
    else if (act === 'zoomOut') _camSph.radius = Math.min(controls.maxDistance, _camSph.radius * Math.pow(2.2, dtStep));
    _camOffset.setFromSpherical(_camSph);
    camera.position.copy(controls.target).add(_camOffset);
  }
  camera.lookAt(controls.target);
}

camPadButtons.forEach(btn => {
  const act = btn.dataset.camAct;
  btn.addEventListener('pointerdown', ev => {
    ev.stopPropagation();
    if (act === 'reset') {
      applyCameraPadStep('reset', 0.16);
      return;
    }
    heldCamActions.add(act);
    // Give a crisp initial impulse so single taps also move smoothly
    applyCameraPadStep(act, 0.14);
  });
  const release = () => heldCamActions.delete(act);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointerleave', release);
  btn.addEventListener('pointercancel', release);
});
window.addEventListener('pointerup', () => heldCamActions.clear());

let padVisible = true;
btnPadToggle.addEventListener('click', ev => {
  ev.stopPropagation();
  padVisible = !padVisible;
  camPad.classList.toggle('hidden', !padVisible);
  btnPadToggle.textContent = padVisible ? '🎮 カメラ操作' : '🎮 操作を表示';
});

btnProj.addEventListener('click', () => {
  projEnabled = !projEnabled;
  btnProj.textContent = projEnabled ? 'マッピング: ON' : 'マッピング: OFF';
});

btnCam.addEventListener('click', () => {
  flyAnim = null;
  freeCam = !freeCam;
  if (!freeCam) activeWardId = null;
  controls.enabled = freeCam;
  btnCam.textContent = freeCam ? '自由ドローン' : 'シネマ自動';
  updateShotUI(getShotAt(filmTime).idx);
});

renderer.domElement.addEventListener('pointerdown', () => {
  flyAnim = null; // Immediately yield control to user drag
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
      a.download = 'sapporo-snow-festival-plateau-3d.webm';
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
  plateauCity.handleResize();
}
new ResizeObserver(handleResize).observe(wrap);
handleResize();

// ==================== MAIN ANIMATION LOOP ====================
let lastTs = performance.now();
let fpsSmooth = 60;
let projTick = 0;
let hudTick = 0;
const prevCamPos = new THREE.Vector3();

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

  prevCamPos.copy(camera.position);

  // Apply any held on-screen camera pad controls smoothly each frame
  if (heldCamActions.size > 0) {
    for (const act of heldCamActions) {
      applyCameraPadStep(act, dt);
    }
  }

  // Camera update
  if (flyAnim) {
    flyAnim.t = Math.min(1, flyAnim.t + dt / flyAnim.dur);
    const e = 1 - Math.pow(1 - flyAnim.t, 3); // Ease-out cubic
    camera.position.lerpVectors(flyAnim.startPos, flyAnim.endPos, e);
    controls.target.lerpVectors(flyAnim.startTgt, flyAnim.endTgt, e);
    camera.lookAt(controls.target);
    if (flyAnim.t >= 1) flyAnim = null;
  } else if (freeCam) {
    controls.update();
  } else {
    const sh = getShotAt(filmTime);
    if (sh.idx !== lastShotIdx) {
      if (lastShotIdx !== -1) triggerCutFlash();
      lastShotIdx = sh.idx;
      updateShotUI(sh.idx);
    }
    const cam = PLATEAU_SHOTS[sh.idx].eval(sh.u);
    camera.position.set(...cam.eye);
    camera.lookAt(...cam.tgt);
    controls.target.set(...cam.tgt);
    if (Math.abs(camera.fov - cam.fov) > 0.05) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
  }

  // Keep directional shadow map centered on the currently viewed ward/area
  updateSunShadowAnchor(controls.target);

  // Stream & refine PLATEAU 3D Tiles + real GSI road/DEM ground tiles around current view
  const camSpeed = dt > 0 ? camera.position.distanceTo(prevCamPos) / dt : 0;
  plateauCity.update(camera.position, camSpeed);
  mapGround.update(controls.target);

  // Animate 3D Current Location Beacon when visible
  if (locMarker.visible) {
    locPin.position.y = 28 + Math.sin(clockTime * 3.0) * 3.2;
    locPin.rotation.y = clockTime * 1.4;
    const pulse = (clockTime * 0.75) % 1;
    const s = 1 + pulse * 3.6;
    locRing.scale.set(s, s, 1);
    locRingMat.opacity = (1 - pulse) * 0.85;
  }

  // Update dynamic subsystems
  const env = TIME_PRESETS[timeIdx];
  skyUniforms.uTime.value = clockTime;
  skyDome.position.copy(camera.position);
  winterUniforms.uTime.value = clockTime;

  projTick += dt;
  if (projTick >= 0.033) {
    projTick = 0;
    projMapping.update(clockTime, projEnabled);
  }

  festivalOverlay.update(clockTime, env.night, env.clock, projEnabled);
  updatePrecipitation(dt, clockTime, camera.position, snowAmount, activeWeather, activeSeason);

  // HUD updates (~5Hz for tile telemetry, every frame for timeline)
  timeline.value = String(Math.round((filmTime / TOTAL_DUR) * 1000));
  const secNow = Math.floor(filmTime);
  timecode.textContent = `${String(Math.floor(secNow / 60)).padStart(2, '0')}:${String(secNow % 60).padStart(2, '0')}`;
  fpsReadout.textContent = `${Math.round(fpsSmooth)} FPS · PLATEAU`;

  hudTick += dt;
  if (hudTick >= 0.2) {
    hudTick = 0;
    const st = plateauCity.getStats();
    const prefix = `札幌全${st.wardCount}区 ${st.mode.toUpperCase()}`;
    if (st.downloading > 0) {
      tileReadout.textContent = `${prefix} · 表示 ${st.visibleTiles} (読込中 ${st.downloading})`;
      tileProgressWrap.style.opacity = '1';
      tileProgressBar.style.width = `${Math.max(12, Math.round(st.progress * 100))}%`;
    } else if (st.errors > 0 && st.loadedModels === 0) {
      tileReadout.textContent = `PLATEAU 接続エラー (${st.errors})`;
      tileProgressWrap.style.opacity = '0';
    } else {
      tileReadout.textContent = `${prefix} · 表示 ${st.visibleTiles} タイル`;
      tileProgressBar.style.width = '100%';
      tileProgressWrap.style.opacity = '0';
    }
  }

  composer.render();
}

updateShotUI(0);
requestAnimationFrame(animate);
