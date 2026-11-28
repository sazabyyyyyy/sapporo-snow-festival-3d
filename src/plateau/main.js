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
import { createSapporoRailNetwork } from './railNetwork.js';
import { RAIL_VIEWPOINTS, STATION_CATALOG } from './railData.js';
import { createPlateauMoiwaRopeway } from './moiwaRopeway.js';
import { createVisitorLayer } from './visitorLayer.js';
import { createParksLayer } from './parksLayer.js';
import { initTutorial, PLATEAU_TUTORIAL_STEPS } from './tutorial.js';
import { buildLiveAtmosphere } from './realtimeAtmosphere.js';

// ==================== DOM REFS ====================
const wrap = document.getElementById('stage-wrap');
const wardButtons = Array.from(document.querySelectorAll('#ward-bar button[data-ward]'));
const timeButtons = Array.from(document.querySelectorAll('#time-bar button[data-time]'));
const seasonButtons = Array.from(document.querySelectorAll('#season-bar button[data-season]'));
const weatherButtons = Array.from(document.querySelectorAll('#weather-bar button[data-weather]'));
const camPadButtons = Array.from(document.querySelectorAll('#cam-pad button[data-cam-act]'));
const camPad = document.getElementById('cam-pad');
const btnPadToggle = document.getElementById('btn-pad-toggle');
const btnLiveTime = document.getElementById('btn-live-time');
const weatherModeNote = document.getElementById('weather-mode-note');
const lblPrecip = document.getElementById('lbl-precip');
const shotTitle = document.getElementById('shot-title');
const shotSub = document.getElementById('shot-sub');
const tileReadout = document.getElementById('tile-readout');
const fpsReadout = document.getElementById('fps-readout');
const btnLoc = document.getElementById('btn-loc');
const btnLod = document.getElementById('btn-lod');
const btnRail = document.getElementById('btn-rail');
const btnRailPanel = document.getElementById('btn-rail-panel');
const railPanel = document.getElementById('rail-panel');
const btnRailXray = document.getElementById('btn-rail-xray');
const railLineButtons = Array.from(document.querySelectorAll('#rail-line-toggles button[data-rail-line]'));
const railViewButtons = Array.from(document.querySelectorAll('#rail-view-btns button[data-rail-view]'));
const stationFilterButtons = Array.from(document.querySelectorAll('#station-filter-bar button[data-station-filter]'));
const stationListEl = document.getElementById('station-list');
const stationListCountEl = document.getElementById('station-list-count');
const btnVisitorPanel = document.getElementById('btn-visitor-panel');
const visitorPanel = document.getElementById('visitor-panel');
const btnVisitorToggle = document.getElementById('btn-visitor-toggle');
const btnVisitorWinter = document.getElementById('btn-visitor-winter');
const visitorAreaFilter = document.getElementById('visitor-area-filter');
const visitorKindButtons = Array.from(document.querySelectorAll('#visitor-kind-toggles button[data-visitor-kind]'));
const visitorListEl = document.getElementById('visitor-list');
const visitorListCountEl = document.getElementById('visitor-list-count');
const visitorDetailEl = document.getElementById('visitor-detail');
const btnMap = document.getElementById('btn-map');
const btnParks = document.getElementById('btn-parks');
const btnStyle = document.getElementById('btn-style');
const btnProj = document.getElementById('btn-proj');
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
const railNetwork = createSapporoRailNetwork(scene, mapGround);
const moiwaRopeway = createPlateauMoiwaRopeway(scene, mapGround);
const visitorLayer = createVisitorLayer(scene);
const parksLayer = createParksLayer(scene);

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

let activeSeason = 'summer';
let activeWeather = 'clear';

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
    b.className = 'ctrl-btn flex-1' + (!liveTimeMode && i === timeIdx ? ' on' : '');
  });
  seasonButtons.forEach(b => {
    b.className = 'ctrl-btn flex-1' + (b.dataset.season === activeSeason ? ' on' : '');
  });
  weatherButtons.forEach(b => {
    b.className = 'ctrl-btn flex-1' + (b.dataset.weather === activeWeather ? ' on' : '');
  });

  if (btnLiveTime) {
    btnLiveTime.textContent = liveTimeMode
      ? `実時刻 ON · ${env.clock}`
      : '実時刻 OFF';
    btnLiveTime.className = 'ctrl-btn chip w-full text-left mb-1.5' + (liveTimeMode ? ' soft-on' : '');
  }
  if (weatherModeNote) {
    weatherModeNote.textContent = liveTimeMode
      ? '実時刻: 時計・日照は Asia/Tokyo。天候は手動（サンプル）。'
      : '天候は手動（サンプル）。実時刻は時計・日照のみ連動。';
  }
}

// ==================== VIEW / STATE ====================
let timeIdx = 2; // 昼
let liveTimeMode = false;
let liveEnv = null;
let lastLiveClockKey = '';
let projEnabled = false;
let scopeOn = true;
let snowAmount = 0.08;
let whiteModelMode = false;
let clockTime = 0;
let activeWardId = null;
let activeLocationInfo = null;
let flyAnim = null; // Smooth camera fly-to when choosing a ward / station / preset

const WARD_BY_ID = Object.fromEntries(SAPPORO_WARD_VIEWS.map(w => [w.id, w]));

function getActiveEnv() {
  return liveTimeMode && liveEnv ? liveEnv : TIME_PRESETS[timeIdx];
}

/** Sync sun / night / TV-tower clock from Asia/Tokyo (minute resolution). */
function syncLiveAtmosphere(force = false) {
  const { env, parts, season } = buildLiveAtmosphere(TIME_PRESETS);
  const key = parts.clock;
  if (!force && key === lastLiveClockKey && liveEnv) {
    return false;
  }
  lastLiveClockKey = key;
  liveEnv = env;
  // Align calendar season only when entering live mode; weather stays manual.
  if (force) {
    activeSeason = season;
    if (activeSeason === 'winter' && activeWeather === 'clear') activeWeather = 'snow';
    else if (activeSeason !== 'winter' && activeWeather === 'snow') activeWeather = 'clear';
  }
  applyAtmosphere(liveEnv);
  return true;
}

function setLiveTimeMode(on) {
  liveTimeMode = !!on;
  if (liveTimeMode) {
    syncLiveAtmosphere(true);
  } else {
    liveEnv = null;
    lastLiveClockKey = '';
    applyAtmosphere(TIME_PRESETS[timeIdx]);
  }
}

applyAtmosphere(TIME_PRESETS[timeIdx]);

/**
 * Opening shot: descend from high altitude into a gentle overhead view of
 * Odori Park / TV Tower (matches the default free-drone framing users expect).
 */
const INTRO_LAND_TGT = (() => {
  const t = SAPPORO_POINTS.odoriNishi3.clone();
  t.y = 24;
  return t;
})();
const INTRO_LAND_EYE = new THREE.Vector3(
  SAPPORO_POINTS.tvTower.x + 60,
  520,
  SAPPORO_POINTS.tvTower.z + 640
);
const INTRO_SKY_EYE = new THREE.Vector3(
  INTRO_LAND_EYE.x - 180,
  2600,
  INTRO_LAND_EYE.z + 120
);
const INTRO_SKY_TGT = INTRO_LAND_TGT.clone().setY(180);

let introActive = true;
let onIntroComplete = null;

{
  camera.position.copy(INTRO_SKY_EYE);
  controls.target.copy(INTRO_SKY_TGT);
  camera.lookAt(controls.target);
  controls.enabled = false;
  updateHudTitle();

  flyAnim = {
    startPos: INTRO_SKY_EYE.clone(),
    startTgt: INTRO_SKY_TGT.clone(),
    endPos: INTRO_LAND_EYE.clone(),
    endTgt: INTRO_LAND_TGT.clone(),
    t: 0,
    dur: 3.2,
    ease: 'inOut',
    unlockControls: true,
    isIntro: true,
  };
}

function updateWardUI() {
  wardButtons.forEach(b => {
    b.className = 'ctrl-btn chip' + (b.dataset.ward === activeWardId ? ' on' : '');
  });
}

function updateHudTitle() {
  if (activeLocationInfo) {
    shotTitle.textContent = activeLocationInfo.title;
    shotSub.textContent = activeLocationInfo.sub;
    return;
  }
  const w = activeWardId ? WARD_BY_ID[activeWardId] : null;
  if (w) {
    shotTitle.textContent = `SAPPORO WARD · ${w.name}`;
    shotSub.textContent = `${w.area} — ドラッグ回転・ホイールズーム・右ドラッグ移動`;
    return;
  }
  shotTitle.textContent = 'FREE DRONE CAMERA · PLATEAU SAPPORO';
  shotSub.textContent = '実寸PLATEAU札幌市街を自由飛行 — ドラッグ回転・ホイールズーム・右ドラッグ移動';
}

function refreshChromeUI() {
  updateWardUI();
  updateHudTitle();
}

function flyToWard(wardId) {
  const w = WARD_BY_ID[wardId];
  if (!w) return;
  activeLocationInfo = null;
  activeWardId = wardId;
  setUiChromeOpen?.(false);
  controls.enabled = true;
  flyAnim = {
    startPos: camera.position.clone(),
    startTgt: controls.target.clone(),
    endPos: w.eye.clone(),
    endTgt: w.tgt.clone(),
    t: 0,
    dur: 1.05,
  };
  refreshChromeUI();
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
      const { latitude: lat, longitude: lon } = pos.coords;

      if (!isInsideSapporo(lat, lon)) {
        activeLocationInfo = {
          title: 'CURRENT LOCATION · 札幌市外',
          sub: '現在地は札幌市の表示範囲外です — 札幌10区ボタンから地域を選べます',
        };
        controls.enabled = true;
        refreshChromeUI();
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
        sub: 'カメラを現在地付近へ移動しました — ドラッグ回転・ズーム可能',
      };
      controls.enabled = true;
      flyAnim = {
        startPos: camera.position.clone(),
        startTgt: controls.target.clone(),
        endPos: eye,
        endTgt: tgt,
        t: 0,
        dur: 1.1,
      };
      refreshChromeUI();
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
      controls.enabled = true;
      refreshChromeUI();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

function triggerCutFlash() {
  cutFade.style.opacity = '0.45';
  setTimeout(() => { cutFade.style.opacity = '0'; }, 90);
}


btnLoc.addEventListener('click', requestCurrentLocation);

wardButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    flyToWard(btn.dataset.ward);
  });
});

btnLod.addEventListener('click', () => {
  const next = plateauCity.getMode() === 'lod2' ? 'lod1' : 'lod2';
  plateauCity.loadMode(next);
  btnLod.textContent = next === 'lod2' ? 'LOD2 · 全市' : 'LOD1 · 全市';
});

// ==================== SAPPORO SUBWAY & JR RAIL NETWORK CONTROLS ====================
const RAIL_VIEW_BY_ID = Object.fromEntries(RAIL_VIEWPOINTS.map(v => [v.id, v]));
const RAIL_LINE_STYLES = {
  namboku: 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100',
  tozai:   'border-amber-400/50 bg-amber-500/20 text-amber-100',
  toho:    'border-sky-400/50 bg-sky-500/20 text-sky-100',
  jr:      'border-green-400/50 bg-green-500/20 text-green-100',
  tram:    'col-span-2 justify-center border-lime-400/50 bg-lime-500/20 text-lime-100',
};

function applyRailMode(mode) {
  railNetwork.setMode(mode);
  const isXray = mode === 'xray';
  mapGround.setUndergroundXray(isXray);
  terrain.setUndergroundXray(isXray);
  controls.maxPolarAngle = isXray ? Math.PI * 0.56 : Math.PI * 0.49;

  if (mode === 'on') {
    btnRail.textContent = '🚇 鉄道 ON';
    btnRail.className = 'ctrl-btn chip soft-on text-left';
  } else if (mode === 'xray') {
    btnRail.textContent = '🚇 透視';
    btnRail.className = 'ctrl-btn chip on text-left';
  } else {
    btnRail.textContent = '🚇 鉄道 OFF';
    btnRail.className = 'ctrl-btn chip text-left';
  }

  btnRailXray.textContent = isXray ? '透視 ON' : '透視 OFF';
  btnRailXray.className = 'ctrl-btn chip text-[10px]' + (isXray ? ' on' : '');
}

const RAIL_MODE_ORDER = ['on', 'xray', 'off'];
btnRail.addEventListener('click', () => {
  const cur = railNetwork.getMode();
  const next = RAIL_MODE_ORDER[(RAIL_MODE_ORDER.indexOf(cur) + 1) % RAIL_MODE_ORDER.length];
  applyRailMode(next);
});

btnRailXray.addEventListener('click', ev => {
  ev.stopPropagation();
  const next = railNetwork.getMode() === 'xray' ? 'on' : 'xray';
  applyRailMode(next);
});

let railPanelVisible = false;
function setRailPanelOpen(open) {
  railPanelVisible = Boolean(open);
  railPanel?.classList.toggle('hidden', !railPanelVisible);
  btnRailPanel?.classList.toggle('soft-on', railPanelVisible);
  if (btnRailPanel) btnRailPanel.textContent = '🚆 路線';
  if (railPanelVisible) {
    closeAllMenus();
    if (visitorPanelVisible) setVisitorPanelOpen(false);
  }
}
btnRailPanel.addEventListener('click', ev => {
  ev.stopPropagation();
  setRailPanelOpen(!railPanelVisible);
});

railLineButtons.forEach(btn => {
  const key = btn.dataset.railLine;
  btn.addEventListener('click', ev => {
    ev.stopPropagation();
    const state = railNetwork.getLineEnabled();
    const next = !state[key];
    railNetwork.setLineEnabled(key, next);
    if (railNetwork.getMode() === 'off' && next) {
      applyRailMode('on');
    }
    const baseCls = key === 'tram'
      ? 'ctrl-btn col-span-2 flex items-center justify-center gap-1.5 px-1.5 py-1 rounded border text-[10px] '
      : 'ctrl-btn flex items-center gap-1 px-1.5 py-1 rounded border text-left text-[10px] ';
    btn.className = baseCls + (
      next
        ? RAIL_LINE_STYLES[key]
        : 'border-white/10 bg-slate-900/70 text-slate-500 opacity-60'
    );
  });
});

railViewButtons.forEach(btn => {
  btn.addEventListener('click', ev => {
    ev.stopPropagation();
    const v = RAIL_VIEW_BY_ID[btn.dataset.railView];
    if (!v) return;
    if (railNetwork.getMode() === 'off') applyRailMode('on');
    if (v.suggestXray) applyRailMode('xray');
    else if (railNetwork.getMode() === 'xray') applyRailMode('on');

    activeWardId = null;
    activeLocationInfo = { title: v.title, sub: v.sub };
    controls.enabled = true;

    // Prefer live ropeway midpoint (post-DEM) when jumping to the aerial tram overlook
    let endPos = v.eye.clone();
    let endTgt = v.tgt.clone();
    if (btn.dataset.railView === 'moiwa-ropeway' && moiwaRopeway?.getViewpoint) {
      const vp = moiwaRopeway.getViewpoint();
      endPos = vp.eye.clone();
      endTgt = vp.tgt.clone();
    }

    // Cancel intro / any in-flight camera move so the overlook always wins
    if (flyAnim?.isIntro) {
      introActive = false;
      onIntroComplete?.();
      onIntroComplete = null;
    }

    flyAnim = {
      startPos: camera.position.clone(),
      startTgt: controls.target.clone(),
      endPos,
      endTgt,
      t: 0,
      dur: 1.35,
      unlockControls: true,
    };
    refreshChromeUI();
  });
});

// ==================== STATION LIST (rail panel) ====================
const STATION_FILTER_STYLES = {
  all: 'soft-on',
  namboku: 'soft-on',
  tozai: 'soft-on',
  toho: 'soft-on',
  jr: 'soft-on',
  tram: 'soft-on',
};

let stationFilter = 'all';
let selectedStationName = null;

function hexToCss(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}

function renderStationList() {
  const items = STATION_CATALOG[stationFilter] || STATION_CATALOG.all;
  if (stationListCountEl) {
    stationListCountEl.textContent = `${items.length}駅`;
  }
  if (!stationListEl) return;

  stationListEl.replaceChildren();
  for (const st of items) {
    const btn = document.createElement('button');
    const active = st.name === selectedStationName;
    btn.type = 'button';
    btn.className = 'station-item ctrl-btn flex items-center gap-1.5 w-full px-1.5 py-1 rounded border text-left ' + (
      active
        ? 'active border-sky-400/60 bg-sky-500/20 text-sky-50'
        : 'border-white/10 bg-slate-900/70 text-slate-200'
    );
    btn.dataset.stationName = st.name;

    const dot = document.createElement('span');
    dot.className = 'inline-block w-2 h-2 rounded-full shrink-0';
    dot.style.background = hexToCss(st.colorHex);

    const code = document.createElement('span');
    code.className = 'font-mono text-[9px] text-slate-400 w-7 shrink-0';
    code.textContent = st.code || (st.isSubway ? '—' : (st.isTram ? 'SC' : 'JR'));

    const name = document.createElement('span');
    name.className = 'flex-1 truncate text-[10px] font-medium';
    name.textContent = st.name;

    const line = document.createElement('span');
    line.className = 'text-[9px] text-slate-500 shrink-0';
    line.textContent = st.shortName || '';

    btn.append(dot, code, name, line);
    btn.addEventListener('click', ev => {
      ev.stopPropagation();
      flyToStationMeta(st);
    });
    stationListEl.appendChild(btn);
  }

  stationFilterButtons.forEach(btn => {
    const key = btn.dataset.stationFilter;
    const on = key === stationFilter;
    btn.className = 'ctrl-btn chip text-[9px] px-1 py-0.5' + (on ? ` ${STATION_FILTER_STYLES[key]}` : '');
  });
}

stationFilterButtons.forEach(btn => {
  btn.addEventListener('click', ev => {
    ev.stopPropagation();
    stationFilter = btn.dataset.stationFilter || 'all';
    renderStationList();
  });
});

renderStationList();

// ==================== VISITOR POI (tourism / toilet / Wi-Fi) ====================
const VISITOR_KIND_STYLES = {
  tourism: 'border-amber-400/50 bg-amber-500/20 text-amber-100',
  toilet: 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100',
  wifi: 'border-sky-400/50 bg-sky-500/20 text-sky-100',
  porocle: 'border-rose-400/50 bg-rose-500/20 text-rose-100',
};

let visitorPanelVisible = false;
let hoveredVisitorId = null;

function setVisitorPanelOpen(open) {
  visitorPanelVisible = Boolean(open);
  visitorPanel?.classList.toggle('hidden', !visitorPanelVisible);
  btnVisitorPanel?.classList.toggle('soft-on', visitorPanelVisible);
  if (btnVisitorPanel) btnVisitorPanel.textContent = '📍 案内';
  if (visitorPanelVisible) {
    closeAllMenus();
    if (railPanelVisible) setRailPanelOpen(false);
    if (!visitorLayer.isVisible()) {
      visitorLayer.setVisible(true);
      syncVisitorToggleBtn();
    }
    renderVisitorList();
  }
}

function syncVisitorToggleBtn() {
  const on = visitorLayer.isVisible();
  if (!btnVisitorToggle) return;
  btnVisitorToggle.textContent = on ? '表示 ON' : '表示 OFF';
  btnVisitorToggle.className = 'ctrl-btn chip text-[10px]' + (on ? ' on' : '');
}

function syncVisitorKindButtons() {
  const state = visitorLayer.getKindEnabled();
  visitorKindButtons.forEach(btn => {
    const kind = btn.dataset.visitorKind;
    const on = Boolean(state[kind]);
    btn.className = 'ctrl-btn flex items-center gap-1 px-1.5 py-1 rounded border text-left text-[10px] ' + (
      on
        ? VISITOR_KIND_STYLES[kind]
        : 'border-white/10 bg-slate-900/70 text-slate-500 opacity-60'
    );
  });
}

function syncVisitorWinterBtn() {
  if (!btnVisitorWinter) return;
  const on = visitorLayer.getWinterOnly();
  btnVisitorWinter.className = 'ctrl-btn chip text-[9px] px-1 py-0.5' + (on ? ' soft-on' : '');
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderVisitorDetail(item) {
  if (!visitorDetailEl) return;
  if (!item) {
    visitorDetailEl.classList.remove('open');
    visitorDetailEl.replaceChildren();
    return;
  }
  const kindLabel = visitorLayer.KIND_META[item.kind]?.label || item.kind;
  const bits = [`<div class="text-[9px] text-slate-400 mb-0.5">${escapeHtml(kindLabel)}</div>`];
  bits.push(`<div class="font-semibold text-[11px] text-slate-50">${escapeHtml(item.name)}</div>`);
  if (item.nameEn) bits.push(`<div class="text-[9px] text-slate-400 mb-1">${escapeHtml(item.nameEn)}</div>`);

  if (item.kind === 'tourism') {
    if (item.area) bits.push(`<div>エリア: ${escapeHtml(item.area)}</div>`);
    if (item.category) bits.push(`<div>分類: ${escapeHtml(item.category)}</div>`);
    if (item.hours) bits.push(`<div>時間: ${escapeHtml(item.hours)}</div>`);
    if (item.desc) bits.push(`<div class="mt-1 text-slate-300">${escapeHtml(item.desc)}</div>`);
    if (item.url) bits.push(`<div class="mt-1"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">公式サイト</a></div>`);
  } else if (item.kind === 'wifi') {
    if (item.ssid) bits.push(`<div>SSID: ${escapeHtml(item.ssid)}</div>`);
    if (item.address) bits.push(`<div>${escapeHtml(item.address)}</div>`);
  } else if (item.kind === 'toilet') {
    if (item.address) bits.push(`<div>${escapeHtml(item.address)}</div>`);
    bits.push(`<div>冬季利用: ${item.winter ? '可' : '不可／不明'}</div>`);
    bits.push(`<div>多目的: ${item.accessible ? 'あり' : 'なし'} / 温水洗浄便座: ${item.washlet ? 'あり' : 'なし'}</div>`);
  } else if (item.kind === 'porocle') {
    if (item.portNo) bits.push(`<div>ポート番号: ${escapeHtml(item.portNo)}</div>`);
    if (item.address) bits.push(`<div>${escapeHtml(item.address)}</div>`);
    bits.push('<div class="mt-1 text-slate-400">シェアサイクル ポロクル</div>');
  }

  visitorDetailEl.innerHTML = bits.join('');
  visitorDetailEl.classList.add('open');
}

function renderVisitorList() {
  const items = visitorLayer.listFiltered();
  if (visitorListCountEl) visitorListCountEl.textContent = `${items.length}件`;
  if (!visitorListEl) return;
  visitorListEl.replaceChildren();
  const selected = visitorLayer.getSelectedId();

  for (const item of items) {
    const btn = document.createElement('button');
    const active = item.id === selected;
    btn.type = 'button';
    btn.className = 'visitor-item ctrl-btn flex items-center gap-1.5 w-full px-1.5 py-1 rounded border text-left ' + (
      active
        ? 'active border-sky-400/60 bg-sky-500/20 text-sky-50'
        : 'border-white/10 bg-slate-900/70 text-slate-200'
    );
    btn.dataset.visitorId = item.id;

    const meta = visitorLayer.KIND_META[item.kind];
    const dot = document.createElement('span');
    dot.className = 'inline-block w-2 h-2 rounded-full shrink-0';
    dot.style.background = meta?.css || '#94a3b8';

    const kind = document.createElement('span');
    kind.className = 'text-[9px] text-slate-400 w-10 shrink-0';
    kind.textContent = meta?.label || '';

    const name = document.createElement('span');
    name.className = 'flex-1 truncate text-[10px] font-medium';
    name.textContent = item.name;

    const tag = document.createElement('span');
    tag.className = 'text-[9px] text-slate-500 shrink-0';
    if (item.kind === 'tourism') tag.textContent = item.area || '';
    else if (item.kind === 'toilet') tag.textContent = item.winter ? '冬◎' : '';
    else if (item.kind === 'wifi') tag.textContent = 'Wi-Fi';
    else if (item.kind === 'porocle') tag.textContent = item.portNo ? `#${item.portNo}` : 'ポロクル';

    btn.append(dot, kind, name, tag);
    btn.addEventListener('click', ev => {
      ev.stopPropagation();
      flyToVisitor(item);
    });
    visitorListEl.appendChild(btn);
  }

  renderVisitorDetail(selected ? visitorLayer.getItem(selected) : null);
  syncVisitorKindButtons();
  syncVisitorWinterBtn();
  syncVisitorToggleBtn();
}

function flyToVisitor(item) {
  if (!item) return;
  const view = visitorLayer.getCameraView(item.id);
  if (!view) return;

  if (!visitorLayer.isVisible()) {
    visitorLayer.setVisible(true);
    syncVisitorToggleBtn();
  }
  visitorLayer.setSelected(item.id);
  selectedStationName = null;
  renderStationList();
  renderVisitorList();

  activeWardId = null;
  const kindLabel = visitorLayer.KIND_META[item.kind]?.label || '';
  activeLocationInfo = {
    title: `${kindLabel} · ${item.name}`,
    sub: item.kind === 'tourism'
      ? `${item.area || '都心'} — ${item.category || '観光スポット'}（札幌市オープンデータ）`
      : item.kind === 'wifi'
        ? `${item.ssid || 'Sapporo City Wi-Fi'} — 公衆無線LAN`
        : item.kind === 'porocle'
          ? `${item.address || '札幌市内'} — シェアサイクル ポロクル`
          : `${item.winter ? '冬季利用可' : '冬季利用注意'} — 中央区公園トイレ`,
  };
  controls.enabled = true;
  flyAnim = {
    startPos: camera.position.clone(),
    startTgt: controls.target.clone(),
    endPos: view.eye.clone(),
    endTgt: view.tgt.clone(),
    t: 0,
    dur: 1.1,
  };
  refreshChromeUI();
  cutFade.style.opacity = '0.3';
  setTimeout(() => { cutFade.style.opacity = '0'; }, 90);
}

if (visitorAreaFilter) {
  for (const area of visitorLayer.areas) {
    const opt = document.createElement('option');
    opt.value = area;
    opt.textContent = area;
    visitorAreaFilter.appendChild(opt);
  }
}

btnVisitorPanel?.addEventListener('click', ev => {
  ev.stopPropagation();
  setVisitorPanelOpen(!visitorPanelVisible);
});

btnVisitorToggle?.addEventListener('click', ev => {
  ev.stopPropagation();
  visitorLayer.setVisible(!visitorLayer.isVisible());
  syncVisitorToggleBtn();
  renderVisitorList();
});

visitorKindButtons.forEach(btn => {
  btn.addEventListener('click', ev => {
    ev.stopPropagation();
    const kind = btn.dataset.visitorKind;
    const state = visitorLayer.getKindEnabled();
    visitorLayer.setKindEnabled(kind, !state[kind]);
    if (!visitorLayer.isVisible()) {
      visitorLayer.setVisible(true);
    }
    renderVisitorList();
  });
});

btnVisitorWinter?.addEventListener('click', ev => {
  ev.stopPropagation();
  visitorLayer.setWinterOnly(!visitorLayer.getWinterOnly());
  if (!visitorLayer.isVisible()) visitorLayer.setVisible(true);
  renderVisitorList();
});

visitorAreaFilter?.addEventListener('change', ev => {
  ev.stopPropagation();
  visitorLayer.setAreaFilter(visitorAreaFilter.value || 'all');
  if (!visitorLayer.isVisible()) visitorLayer.setVisible(true);
  renderVisitorList();
});

renderVisitorList();

const MAP_STYLE_ORDER = ['std', 'photo', 'pale'];
btnMap.addEventListener('click', () => {
  const idx = (MAP_STYLE_ORDER.indexOf(mapGround.getStyle()) + 1) % MAP_STYLE_ORDER.length;
  const next = MAP_STYLE_ORDER[idx];
  mapGround.setStyle(next);
  btnMap.textContent = MAP_STYLES[next].label;
  mapGround.update(controls.target);
});

function syncParksToggleBtn() {
  if (!btnParks) return;
  const on = parksLayer.isVisible();
  btnParks.textContent = on ? '🌳 公園緑地 ON' : '🌳 公園緑地 OFF';
  btnParks.className = 'ctrl-btn chip text-left' + (on ? ' soft-on' : '');
}

btnParks?.addEventListener('click', () => {
  parksLayer.setVisible(!parksLayer.isVisible());
  syncParksToggleBtn();
  if (parksLayer.isVisible()) {
    const src = parksLayer.source;
    shotTitle.textContent = 'PARKS · 公園緑地';
    shotSub.textContent = src
      ? `${src.name}（${parksLayer.featureCount}件・都心）— ${src.provider}`
      : `公園緑地ポリゴン ${parksLayer.featureCount}件（札幌市オープンデータ）`;
  }
});
syncParksToggleBtn();

btnStyle.addEventListener('click', () => {
  whiteModelMode = !whiteModelMode;
  winterUniforms.uWhiteModel.value = whiteModelMode ? 1.0 : 0.0;
  btnStyle.textContent = whiteModelMode ? 'ホワイト模型' : 'リアル質感';
});

btnLiveTime?.addEventListener('click', () => {
  setLiveTimeMode(!liveTimeMode);
});

timeButtons.forEach((btn, idx) => {
  btn.addEventListener('click', () => {
    timeIdx = idx;
    // Manual preset exits live clock/sun sync
    if (liveTimeMode) {
      liveTimeMode = false;
      liveEnv = null;
      lastLiveClockKey = '';
    }
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
    applyAtmosphere(getActiveEnv());
  });
});

weatherButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const nextWeather = btn.dataset.weather;
    if (!nextWeather) return;
    activeWeather = nextWeather;
    applyAtmosphere(getActiveEnv());
  });
});

// ==================== ON-SCREEN CAMERA CONTROL PAD (HOLD OR TAP) ====================
const heldCamActions = new Set();
const _camFwd = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camOffset = new THREE.Vector3();
const _camSph = new THREE.Spherical();

function ensureFreeCamForPad() {
  if (flyAnim?.isIntro) {
    introActive = false;
    onIntroComplete?.();
    onIntroComplete = null;
  }
  flyAnim = null;
  controls.enabled = true;
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

let padVisible = false;
btnPadToggle.addEventListener('click', ev => {
  ev.stopPropagation();
  padVisible = !padVisible;
  camPad.classList.toggle('hidden', !padVisible);
  btnPadToggle.classList.toggle('soft-on', padVisible);
  btnPadToggle.textContent = '🎮';
  if (padVisible) closeAllMenus();
});

// ==================== COMPACT OVERLAY MENUS ====================
const btnUiToggle = document.getElementById('btn-ui-toggle');
const uiChrome = document.getElementById('ui-chrome');
let uiChromeOpen = false;

function closeAllMenus() {
  document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
}

function setUiChromeOpen(open) {
  uiChromeOpen = open;
  uiChrome?.classList.toggle('open', open);
  btnUiToggle?.classList.toggle('open', open);
  btnUiToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (!open) closeAllMenus();
}

btnUiToggle?.addEventListener('click', ev => {
  ev.stopPropagation();
  setUiChromeOpen(!uiChromeOpen);
});

document.querySelectorAll('[data-menu-toggle]').forEach(btn => {
  btn.addEventListener('click', ev => {
    ev.stopPropagation();
    const panel = btn.parentElement?.querySelector('.menu-panel');
    if (!panel) return;
    const willOpen = !panel.classList.contains('open');
    closeAllMenus();
    if (willOpen) panel.classList.add('open');
  });
});

document.addEventListener('click', ev => {
  if (ev.target.closest('#tutorial-root')) return;
  if (ev.target.closest('#ui-chrome') || ev.target.closest('#btn-ui-toggle')) return;
  if (ev.target.closest('#rail-panel') || ev.target.closest('#visitor-panel') || ev.target.closest('#cam-pad')) return;
  setUiChromeOpen(false);
});

const tutorial = initTutorial({
  steps: PLATEAU_TUTORIAL_STEPS,
  storageKey: 'plateau-tutorial-v2-done',
  setUiChromeOpen,
  openRailPanel: setRailPanelOpen,
  openVisitorPanel: setVisitorPanelOpen,
  deferAutoStart: true,
});

document.getElementById('btn-guide')?.addEventListener('click', ev => {
  ev.stopPropagation();
  setUiChromeOpen(false);
  tutorial.open();
});

// Begin the guide after the opening sky-descent (or immediately if already skipped)
onIntroComplete = () => tutorial.startIfNeeded(450);
if (!introActive) tutorial.startIfNeeded(450);

// Choosing a ward should tuck menus away for a larger map
wardButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    closeAllMenus();
    setUiChromeOpen(false);
  });
});
if (btnLoc) {
  btnLoc.addEventListener('click', () => {
    closeAllMenus();
    setUiChromeOpen(false);
  }, true);
}

btnProj.addEventListener('click', () => {
  projEnabled = !projEnabled;
  btnProj.textContent = projEnabled ? 'マッピング ON' : 'マッピング OFF';
});

// ==================== STATION BADGE CLICK → FLY TO STATION ====================
let ptrGesture = null;
let hoveredStationName = null;

function eventToNdc(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((ev.clientY - rect.top) / rect.height) * 2 + 1,
  };
}

function flyToStationView(view) {
  if (!view) return;

  if (railNetwork.getMode() === 'off') applyRailMode('on');
  if (view.suggestXray) applyRailMode('xray');
  else if (railNetwork.getMode() === 'xray' && !view.suggestXray) applyRailMode('on');

  activeWardId = null;
  activeLocationInfo = { title: view.title, sub: view.sub };
  controls.enabled = true;
  flyAnim = {
    startPos: camera.position.clone(),
    startTgt: controls.target.clone(),
    endPos: view.eye.clone(),
    endTgt: view.tgt.clone(),
    t: 0,
    dur: 1.15,
  };
  refreshChromeUI();

  cutFade.style.opacity = '0.35';
  setTimeout(() => { cutFade.style.opacity = '0'; }, 90);
}

function flyToStationInfo(info) {
  flyToStationView(railNetwork.getStationCameraView(info));
}

function flyToStationMeta(meta) {
  selectedStationName = meta.name;
  renderStationList();
  flyToStationView(railNetwork.resolveStationCameraView(meta.name, meta));
}

renderer.domElement.addEventListener('pointerdown', ev => {
  ptrGesture = { x: ev.clientX, y: ev.clientY, t: performance.now() };
  // Skip / take over the opening descent if the user grabs the camera
  if (flyAnim?.isIntro) {
    introActive = false;
    onIntroComplete?.();
    onIntroComplete = null;
  }
  flyAnim = null;
  controls.enabled = true;
});

renderer.domElement.addEventListener('pointermove', ev => {
  // Skip hover while dragging the camera
  if (ptrGesture) {
    const dx = ev.clientX - ptrGesture.x;
    const dy = ev.clientY - ptrGesture.y;
    if (dx * dx + dy * dy > 16) return;
  }
  const ndc = eventToNdc(ev);

  let cursor = '';
  if (visitorLayer.isVisible()) {
    const vHit = visitorLayer.pick(ndc.x, ndc.y, camera);
    const vid = vHit?.id || null;
    if (vid !== hoveredVisitorId) {
      hoveredVisitorId = vid;
      visitorLayer.setHover(vid);
    }
    if (vid) cursor = 'pointer';
  } else if (hoveredVisitorId) {
    hoveredVisitorId = null;
    visitorLayer.setHover(null);
  }

  if (railNetwork.getMode() !== 'off') {
    const hit = railNetwork.pickStation(ndc.x, ndc.y, camera);
    const name = hit?.name || null;
    if (name !== hoveredStationName) {
      hoveredStationName = name;
      railNetwork.setStationHover(name);
    }
    if (name) cursor = 'pointer';
  } else if (hoveredStationName) {
    hoveredStationName = null;
    railNetwork.setStationHover(null);
  }

  renderer.domElement.style.cursor = cursor;
});

renderer.domElement.addEventListener('pointerup', ev => {
  const g = ptrGesture;
  ptrGesture = null;
  if (!g) return;
  const dx = ev.clientX - g.x;
  const dy = ev.clientY - g.y;
  const dt = performance.now() - g.t;
  // Treat as click only when almost no drag (avoid fighting OrbitControls)
  if (dx * dx + dy * dy > 36 || dt > 700) return;

  const ndc = eventToNdc(ev);

  if (visitorLayer.isVisible()) {
    const vHit = visitorLayer.pick(ndc.x, ndc.y, camera);
    if (vHit) {
      flyToVisitor(vHit);
      return;
    }
  }

  if (railNetwork.getMode() === 'off') return;
  const hit = railNetwork.pickStation(ndc.x, ndc.y, camera);
  if (hit) {
    selectedStationName = hit.name;
    renderStationList();
    flyToStationInfo(hit);
  }
});

renderer.domElement.addEventListener('pointerleave', () => {
  ptrGesture = null;
  if (hoveredStationName) {
    hoveredStationName = null;
    railNetwork.setStationHover(null);
    renderer.domElement.style.cursor = '';
  }
});

controls.enabled = true;

slSnow.addEventListener('input', () => {
  snowAmount = Number(slSnow.value) / 100;
});

btnScope.addEventListener('click', () => {
  scopeOn = !scopeOn;
  barTop.style.height = scopeOn ? '20px' : '0px';
  barBot.style.height = scopeOn ? '20px' : '0px';
  btnScope.textContent = scopeOn ? '2.39' : '16:9';
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

  // Camera update (always interactive free-drone; optional fly-to animation)
  if (flyAnim) {
    flyAnim.t = Math.min(1, flyAnim.t + dt / flyAnim.dur);
    const u = flyAnim.t;
    const e = flyAnim.ease === 'inOut'
      ? (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2) // ease-in-out cubic
      : 1 - Math.pow(1 - u, 3); // ease-out cubic
    camera.position.lerpVectors(flyAnim.startPos, flyAnim.endPos, e);
    controls.target.lerpVectors(flyAnim.startTgt, flyAnim.endTgt, e);
    camera.lookAt(controls.target);
    if (flyAnim.t >= 1) {
      const finished = flyAnim;
      flyAnim = null;
      if (finished.unlockControls) controls.enabled = true;
      if (finished.isIntro) {
        introActive = false;
        onIntroComplete?.();
        onIntroComplete = null;
      }
    }
  } else {
    controls.update();
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

  // Live Asia/Tokyo clock + sun (minute resolution)
  if (liveTimeMode) syncLiveAtmosphere(false);

  // Update dynamic subsystems
  const env = getActiveEnv();
  skyUniforms.uTime.value = clockTime;
  skyDome.position.copy(camera.position);
  winterUniforms.uTime.value = clockTime;

  projTick += dt;
  if (projTick >= 0.033) {
    projTick = 0;
    projMapping.update(clockTime, projEnabled);
  }

  festivalOverlay.update(clockTime, env.night, env.clock, projEnabled);
  railNetwork.update(clockTime, env.night, camera.position);
  moiwaRopeway.update(clockTime, env.night);
  visitorLayer.update(camera.position);
  updatePrecipitation(dt, clockTime, camera.position, snowAmount, activeWeather, activeSeason);

  // HUD updates (~5Hz for tile telemetry)
  fpsReadout.textContent = `${Math.round(fpsSmooth)} FPS`;

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

refreshChromeUI();
requestAnimationFrame(animate);
