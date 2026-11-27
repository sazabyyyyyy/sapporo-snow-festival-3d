import * as THREE from 'three';
import { ODORI_ROT_Y, SAPPORO_POINTS } from './geo.js';
import { createWinterRoadTextures } from '../textures.js';

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

const SEASON_GROUND_COLORS = {
  winter: { ground: 0xb8cae0, park: 0xc4d5ea, rough: 0.80 },
  spring: { ground: 0x5c7352, park: 0x5f9653, rough: 0.88 },
  summer: { ground: 0x3f663a, park: 0x3b8440, rough: 0.86 },
  autumn: { ground: 0x6e604a, park: 0x867146, rough: 0.90 },
};

/**
 * Builds real-scale (1 unit = 1 meter) Sapporo terrain with:
 * - Contoured alluvial-fan city ground (drops smoothly toward northern/eastern/western Ishikari lowlands
 *   so low-elevation buildings in Kita-ku, Higashi-ku, Shiroishi-ku, and Teine-ku are NEVER buried!)
 * - Odori Park boulevard, roads & reflective Sosei River
 * - Real-scale surrounding mountains (Mt. Moiwa 531m, Mt. Okura 307m, Mt. Teine 1023m)
 * - Dynamic seasonal palette (spring / summer / autumn / winter) + wet-weather specular reflection!
 */
export function createRealScaleTerrain(scene, snowBumpMap) {
  const group = new THREE.Group();
  group.name = 'SAPPORO_REAL_TERRAIN';

  const groundBump = snowBumpMap.clone();
  groundBump.needsUpdate = true;
  groundBump.repeat.set(220, 220);

  const groundMat = new THREE.MeshStandardMaterial({
    color: SEASON_GROUND_COLORS.winter.ground,
    roughness: 0.80,
    metalness: 0.02,
    bumpMap: groundBump,
    bumpScale: 0.22,
  });

  // 1. Deep Fallback Horizon Base (sits cleanly below the real GSI map/DEM tiles so only distant horizon beyond 25km shows it)
  const groundGeo = new THREE.PlaneGeometry(60000, 60000, 16, 16);
  groundGeo.rotateX(-Math.PI / 2);
  const cityGround = new THREE.Mesh(groundGeo, groundMat);
  cityGround.position.y = -32;
  cityGround.receiveShadow = false;
  group.add(cityGround);

  // 2. Odori Park Boulevard + Flanking Roads (aligned to Sapporo's +9.7 deg grid)
  const gridGroup = new THREE.Group();
  gridGroup.position.copy(SAPPORO_POINTS.tvTower);
  gridGroup.rotation.y = ODORI_ROT_Y;
  group.add(gridGroup);

  const parkMat = new THREE.MeshStandardMaterial({
    color: SEASON_GROUND_COLORS.winter.park,
    roughness: 0.78,
    metalness: 0.02,
    bumpMap: snowBumpMap,
    bumpScale: 0.16,
  });
  const parkBase = new THREE.Mesh(new THREE.BoxGeometry(1520, 0.35, 64), parkMat);
  parkBase.position.set(-700, 0.08, 0);
  parkBase.receiveShadow = true;
  gridGroup.add(parkBase);

  const roadTex = createWinterRoadTextures();
  const roadMats = [];
  const winterRoadsGroup = new THREE.Group();
  gridGroup.add(winterRoadsGroup);
  function addGridRoad(x, z, width, length, horizontal) {
    const map = roadTex.map.clone();
    const rMap = roadTex.roughnessMap.clone();
    map.needsUpdate = rMap.needsUpdate = true;
    const rep = length / 38;
    map.repeat.set(1, rep);
    rMap.repeat.set(1, rep);
    const mat = new THREE.MeshStandardMaterial({
      map,
      roughnessMap: rMap,
      roughness: 0.88,
      metalness: 0.16,
    });
    roadMats.push(mat);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(horizontal ? length : width, horizontal ? width : length), mat);
    m.rotation.x = -Math.PI / 2;
    if (horizontal) m.rotation.z = Math.PI / 2;
    m.position.set(x, 0.04, z);
    m.receiveShadow = true;
    winterRoadsGroup.add(m);
  }

  addGridRoad(-700, -42, 18, 1750, true);
  addGridRoad(-700,  42, 18, 1750, true);
  addGridRoad(-500,  190, 18, 1600, true);
  addGridRoad(-500,  585, 24, 1600, true);
  addGridRoad(-500, -180, 18, 1600, true);

  addGridRoad(-328, 120, 26, 2200, false);
  for (const cx of [-68, -198, -458, -586, -714, -842]) {
    addGridRoad(cx, 60, 14, 1400, false);
  }

  const riverMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a1c38,
    roughness: 0.10,
    metalness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.07,
  });
  const soseiRiver = new THREE.Mesh(new THREE.PlaneGeometry(24, 2400), riverMat);
  soseiRiver.rotation.x = -Math.PI / 2;
  soseiRiver.position.set(112, 0.06, 60);
  soseiRiver.receiveShadow = true;
  gridGroup.add(soseiRiver);

  addGridRoad(88, 60, 14, 2200, false);
  addGridRoad(136, 60, 14, 2200, false);

  // 3. Real-Scale Surrounding Sapporo Mountains (Mt. Moiwa 531m, Mt. Okura 307m, Mt. Teine 1023m)
  const mtnSize = 36000;
  const mtnSegs = 160;
  const mtnGeo = new THREE.PlaneGeometry(mtnSize, mtnSize, mtnSegs, mtnSegs);
  mtnGeo.rotateX(-Math.PI / 2);

  const moiwa = SAPPORO_POINTS.mtMoiwa;
  const okura = SAPPORO_POINTS.mtOkura;
  const teine = SAPPORO_POINTS.mtTeine;

  function evalMountainY(x, z) {
    // Keep mountain mesh completely submerged inside the 25km real GSI DEM map zone (only rises for distant silhouettes)
    const cityDist = Math.hypot(x * 0.9, z * 0.9);
    const basin = Math.max(0, Math.min(1, (cityDist - 6200) / 2200));
    const smoothBasin = basin * basin * (3 - 2 * basin);
    if (smoothBasin <= 0.001) return -40.0;

    const swSector = Math.max(0, Math.min(1, (-x - 3600) / 3200 + Math.max(0, (z - 4200) / 5500) * 0.65));
    if (swSector <= 0.001) return -40.0;

    const pMoiwa = Math.exp(-(((x - moiwa.x) ** 2) / (1550 ** 2) + ((z - moiwa.z) ** 2) / (1450 ** 2))) * 515;
    const pOkura = Math.exp(-(((x - okura.x) ** 2) / (1350 ** 2) + ((z - okura.z) ** 2) / (1350 ** 2))) * 295;
    const pTeine = Math.exp(-(((x - teine.x) ** 2) / (3200 ** 2) + ((z - teine.z) ** 2) / (2800 ** 2))) * 960;

    const westMask = Math.max(0, Math.min(1, (-x - 5800) / 4800)) * Math.max(0, Math.min(1, (z + 4500) / 5000));
    const swMask = Math.max(0, Math.min(1, (z - 6400) / 4800)) * Math.max(0, Math.min(1, (-x - 1200) / 4000));
    const wSmooth = westMask * westMask * (3 - 2 * westMask);
    const sSmooth = swMask * swMask * (3 - 2 * swMask);

    const ridge = Math.max(
      wSmooth * (160 + 480 * fbm2(x * 0.00024 + 3.1, z * 0.00024 + 1.7)),
      sSmooth * (140 + 420 * fbm2(x * 0.00024 + 7.2, z * 0.00024 + 4.4))
    );

    let h = Math.max(ridge, pMoiwa, pOkura, pTeine) + pMoiwa * 0.32 + pOkura * 0.22 + pTeine * 0.25;
    if (h > 10) {
      h += (fbm2(x * 0.0010, z * 0.0010) - 0.46) * Math.min(h * 0.30, 125);
    }
    return Math.max(-40.0, h * smoothBasin - 40.0);
  }

  const pos = mtnGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) - 6500;
    const z = pos.getZ(i) + 3200;
    pos.setXYZ(i, x, evalMountainY(x, z), z);
  }
  mtnGeo.computeVertexNormals();

  const norm = mtnGeo.attributes.normal;
  const colorAttr = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
  mtnGeo.setAttribute('color', colorAttr);

  function recolorMountains(season) {
    const tmp = new THREE.Color();
    const colSnow = new THREE.Color(0xe2ecf8);
    const colRock = new THREE.Color(0x343c48);

    const colPineW = new THREE.Color(0x162230);
    const colSpringLow = new THREE.Color(0x3f7539);
    const colSpringHigh = new THREE.Color(0x6b9e54);
    const colSummerLow = new THREE.Color(0x1e4d26);
    const colSummerHigh = new THREE.Color(0x2f6b36);
    const colAutumnA = new THREE.Color(0xb8431e);
    const colAutumnB = new THREE.Color(0xd88e24);
    const colAutumnPine = new THREE.Color(0x2d4224);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const ny = norm.getY(i);

      if (season === 'winter') {
        if (y < 8) {
          tmp.copy(colSnow);
        } else {
          const snowMix = Math.max(0, Math.min(1, (y - 40) / 310 + (ny - 0.54) * 1.5));
          tmp.copy(ny < 0.62 ? colRock : colPineW).lerp(colSnow, snowMix);
        }
      } else if (season === 'spring') {
        tmp.copy(colSpringLow).lerp(colSpringHigh, Math.max(0, Math.min(1, y / 420)));
        if (ny < 0.60) tmp.lerp(colRock, 0.45);
        // Lingering spring snow on high peaks (> 480m, like Mt. Teine)
        const patch = Math.max(0, Math.min(1, (y - 450) / 260 + (ny - 0.65) * 0.8));
        tmp.lerp(colSnow, patch * 0.85);
      } else if (season === 'summer') {
        tmp.copy(colSummerLow).lerp(colSummerHigh, Math.max(0, Math.min(1, y / 520)));
        if (ny < 0.56) tmp.lerp(colRock, 0.45);
      } else {
        // Autumn Hokkaido foliage patchwork (crimson, amber, deep pine)
        const n = fbm2(x * 0.0012, z * 0.0012);
        tmp.copy(n < 0.44 ? colAutumnPine : n < 0.66 ? colAutumnB : colAutumnA);
        if (ny < 0.58) tmp.lerp(colRock, 0.40);
      }
      colorAttr.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    colorAttr.needsUpdate = true;
  }
  recolorMountains('winter');

  const mtnMesh = new THREE.Mesh(
    mtnGeo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.02,
    })
  );
  mtnMesh.receiveShadow = true;
  group.add(mtnMesh);

  // Mt. Moiwa Summit Observatory
  const moiwaY = evalMountainY(moiwa.x, moiwa.z);
  const summitObs = new THREE.Mesh(
    new THREE.BoxGeometry(34, 18, 34),
    new THREE.MeshStandardMaterial({
      color: 0xffe8b0,
      emissive: 0xffb848,
      emissiveIntensity: 3.0,
    })
  );
  summitObs.position.set(moiwa.x, moiwaY + 10, moiwa.z);
  const summitBeacon = new THREE.Mesh(
    new THREE.SphereGeometry(6, 10, 10),
    new THREE.MeshStandardMaterial({
      color: 0xff3020,
      emissive: 0xff2418,
      emissiveIntensity: 5.0,
    })
  );
  summitBeacon.position.set(moiwa.x, moiwaY + 34, moiwa.z);
  group.add(summitObs, summitBeacon);

  scene.add(group);

  let lastSeason = 'winter';
  let undergroundXray = false;

  function setUndergroundXray(enabled) {
    undergroundXray = Boolean(enabled);
    cityGround.visible = !undergroundXray;
    parkMat.transparent = undergroundXray;
    parkMat.opacity = undergroundXray ? 0.30 : 1.0;
    parkMat.depthWrite = !undergroundXray;
    parkMat.needsUpdate = true;

    riverMat.transparent = undergroundXray;
    riverMat.opacity = undergroundXray ? 0.35 : 1.0;
    riverMat.depthWrite = !undergroundXray;
    riverMat.needsUpdate = true;

    for (const rm of roadMats) {
      rm.transparent = undergroundXray;
      rm.opacity = undergroundXray ? 0.25 : 1.0;
      rm.depthWrite = !undergroundXray;
      rm.needsUpdate = true;
    }
  }

  function setSeasonAndWeather(season, weather) {
    const pal = SEASON_GROUND_COLORS[season] || SEASON_GROUND_COLORS.winter;
    const isSnowWeather = weather === 'snow';
    const isRainWeather = weather === 'rain';

    // Blend a snowy tint onto ground if user turns on Snow weather during non-winter seasons
    const gCol = new THREE.Color(pal.ground);
    const pCol = new THREE.Color(pal.park);
    if (isSnowWeather && season !== 'winter') {
      gCol.lerp(new THREE.Color(0xc2d2e8), 0.55);
      pCol.lerp(new THREE.Color(0xcbdaf0), 0.60);
    } else if (isRainWeather) {
      gCol.multiplyScalar(0.76);
      pCol.multiplyScalar(0.80);
    }

    groundMat.color.copy(gCol);
    groundMat.roughness = isRainWeather ? 0.34 : pal.rough;
    parkMat.color.copy(pCol);
    parkMat.roughness = isRainWeather ? 0.38 : pal.rough;
    // Show snowy Odori winter road overlays in winter; let crisp GSI road maps shine directly in spring/summer/autumn
    winterRoadsGroup.visible = season === 'winter';

    for (const rm of roadMats) {
      rm.roughness = isRainWeather ? 0.24 : (season === 'winter' ? 0.62 : 0.86);
      rm.metalness = isRainWeather ? 0.35 : 0.15;
    }

    if (season !== lastSeason) {
      lastSeason = season;
      recolorMountains(season);
    }
  }

  return {
    group,
    snowMat: groundMat,
    moiwaPeak: new THREE.Vector3(moiwa.x, moiwaY, moiwa.z),
    setSeasonAndWeather,
    setUndergroundXray,
  };
}
