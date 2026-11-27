import * as THREE from 'three';
import { WGS84_ELLIPSOID } from '3d-tiles-renderer/three';

const DEG2RAD = Math.PI / 180;

/**
 * Local ENU-like Three.js coordinate system for PLATEAU Sapporo:
 *   Origin (0, 0, 0) = Odori Park Nishi 4-chome center (real WGS84)
 *   +X = East (meters)
 *   +Y = Up (meters)
 *   +Z = South = -North (meters) -> right-handed basis (East x Up = South)
 *
 * Sapporo's Odori Park grid is rotated +9.7 deg CCW from true East/North:
 *   rotating a local object by rotation.y = ODORI_ROT_Y aligns:
 *     local +X -> Odori Park East (toward TV Tower)
 *     local +Z -> Ekimae-dori South (toward Susukino)
 */
export const ORIGIN = {
  lat: 43.06048,
  lon: 141.35145,
  height: 55.2, // Approximate WGS84 ellipsoidal ground height at Odori Park Nishi 4-chome (~22m elev + ~33m geoid)
};

export const ODORI_ROT_Y = 9.7 * DEG2RAD;

const _east = new THREE.Vector3();
const _north = new THREE.Vector3();
const _up = new THREE.Vector3();
const _south = new THREE.Vector3();
const _originEcef = new THREE.Vector3();

function buildCoordinateFrames(height = ORIGIN.height) {
  const latRad = ORIGIN.lat * DEG2RAD;
  const lonRad = ORIGIN.lon * DEG2RAD;

  WGS84_ELLIPSOID.getEastNorthUpAxes(latRad, lonRad, _east, _north, _up);
  WGS84_ELLIPSOID.getCartographicToPosition(latRad, lonRad, height, _originEcef);
  _south.copy(_north).negate();

  // local (East, Up, South) -> ECEF
  const localToEcef = new THREE.Matrix4()
    .makeBasis(_east, _up, _south)
    .setPosition(_originEcef);

  // ECEF -> local (East, Up, South)
  const ecefToLocal = localToEcef.clone().invert();
  return { localToEcef, ecefToLocal };
}

const frames = buildCoordinateFrames(ORIGIN.height);
export const ECEF_TO_LOCAL = frames.ecefToLocal;
export const LOCAL_TO_ECEF = frames.localToEcef;

export function makeEcefToLocalMatrix(groundEllipsoidalHeight) {
  return buildCoordinateFrames(groundEllipsoidalHeight).ecefToLocal;
}

const _tmpEcef = new THREE.Vector3();

/**
 * Converts WGS84 latitude (deg), longitude (deg), and ellipsoidal height (m)
 * into local Three.js coordinates (meters, +X=East, +Y=Up, +Z=South).
 */
export function latLonHeightToLocal(latDeg, lonDeg, height = ORIGIN.height, target = new THREE.Vector3()) {
  WGS84_ELLIPSOID.getCartographicToPosition(latDeg * DEG2RAD, lonDeg * DEG2RAD, height, _tmpEcef);
  return target.copy(_tmpEcef).applyMatrix4(ECEF_TO_LOCAL);
}

/**
 * Convenience helper for placing objects on the ground plane (y = yOffset) at a real lat/lon.
 */
export function latLonToGround(latDeg, lonDeg, yOffset = 0, target = new THREE.Vector3()) {
  latLonHeightToLocal(latDeg, lonDeg, ORIGIN.height, target);
  target.y = yOffset;
  return target;
}

/**
 * Offset from an anchor point along Sapporo's rotated street grid:
 *   alongOdoriEast > 0 moves East along Odori Park (toward TV Tower)
 *   alongSouth     > 0 moves South along Ekimae-dori (toward Susukino)
 */
export function gridOffset(anchor, alongOdoriEast, alongSouth, y = 0) {
  const c = Math.cos(ODORI_ROT_Y);
  const s = Math.sin(ODORI_ROT_Y);
  return new THREE.Vector3(
    anchor.x + alongOdoriEast * c + alongSouth * s,
    y,
    anchor.z - alongOdoriEast * s + alongSouth * c
  );
}

// ==================== VERIFIED REAL SAPPORO LANDMARK COORDINATES (WGS84) ====================
// Anchored to official Project PLATEAU Sapporo (01100) data
const TV_TOWER_LL = { lat: 43.06110, lon: 141.35643 };
const TV_LOCAL = latLonToGround(TV_TOWER_LL.lat, TV_TOWER_LL.lon, 0);

// Odori Park block centers (each chome block is ~128.5m along the park's ENE-WSW axis)
export const SAPPORO_POINTS = {
  tvTower:        TV_LOCAL.clone(),
  odoriNishi2:    gridOffset(TV_LOCAL, -135, 0, 0),
  odoriNishi3:    gridOffset(TV_LOCAL, -264, 0, 0),
  odoriNishi4:    gridOffset(TV_LOCAL, -393, 0, 0), // Giant Snow Castle (白雪の大城郭)
  odoriNishi5:    gridOffset(TV_LOCAL, -522, 0, 0), // Gothic Snow Cathedral (氷雪の大聖堂)
  odoriNishi6:    gridOffset(TV_LOCAL, -650, 0, 0), // Citizen sculptures & Yatai
  odoriNishi7:    gridOffset(TV_LOCAL, -778, 0, 0), // Winged Snow Dragon (白龍と氷晶)
  odoriNishi8:    gridOffset(TV_LOCAL, -905, 0, 0),

  // Major Sapporo landmarks (exact WGS84 -> local meters)
  clockTower:     latLonToGround(43.06257, 141.35351, 0),
  akarenga:       latLonToGround(43.06401, 141.34789, 0),
  jrTower:        latLonToGround(43.06808, 141.35225, 0),
  sapporoStation: latLonToGround(43.06861, 141.35078, 0),
  susukinoCross:  latLonToGround(43.05548, 141.35340, 0),
  minami1Ekimae:  latLonToGround(43.05870, 141.35265, 0), // Minami 1-jo Streetcar corridor
  soseiOdori:     latLonToGround(43.06132, 141.35785, 0), // Sosei River east of TV Tower

  // Surrounding mountains (real distances & heights in meters)
  mtMoiwa:        latLonToGround(43.0226, 141.3220, 0),   // 531m elevation (~4.8 km SW)
  mtOkura:        latLonToGround(43.0510, 141.2870, 0),   // 307m elevation (~5.3 km W)
  mtTeine:        latLonToGround(43.0764, 141.1932, 0),   // 1023m elevation (~12.9 km WNW)
};

// ==================== ALL 10 SAPPORO WARDS QUICK-JUMP VIEWPOINTS ====================
function makeWardView(id, name, area, lat, lon, groundY, eyeDx, eyeDy, eyeDz) {
  const tgt = latLonToGround(lat, lon, groundY + 26);
  const eye = new THREE.Vector3(tgt.x + eyeDx, groundY + eyeDy, tgt.z + eyeDz);
  return { id, name, area, lat, lon, groundY, eye, tgt };
}

export const SAPPORO_WARD_VIEWS = [
  makeWardView('chuo',      '中央区', '大通公園・すすきの・札幌都心 (LOD2)',     43.0605, 141.3515,  0,  310, 155,  240),
  makeWardView('kita',      '北区',   '札幌駅北口・北海道大学周辺 (LOD2)',       43.0745, 141.3475, -6,  340, 165,  280),
  makeWardView('higashi',   '東区',   'サッポロビール園・元町周辺 (LOD2)',       43.0740, 141.3705, -7,  360, 175,  310),
  makeWardView('shiroishi', '白石区', '東札幌・白石駅周辺エリア (LOD1)',         43.0545, 141.4045, -4,  380, 185,  320),
  makeWardView('toyohira',  '豊平区', '平岸・豊平公園・中の島エリア (LOD1)',     43.0385, 141.3745,  8,  380, 190,  320),
  makeWardView('minami',    '南区',   '真駒内・藻岩山麓エリア (LOD1)',           42.9925, 141.3525, 36,  420, 210,  340),
  makeWardView('nishi',     '西区',   '琴似・二十四軒エリア (LOD2)',             43.0760, 141.3045,  6,  350, 175,  300),
  makeWardView('atsubetsu', '厚別区', '新札幌・サンピアザ周辺 (LOD1)',           43.0388, 141.4728, 16,  380, 185,  310),
  makeWardView('teine',     '手稲区', '手稲駅・前田エリア (LOD1)',               43.1205, 141.2435,  2,  390, 190,  320),
  makeWardView('kiyota',    '清田区', '清田・平岡エリア (LOD1)',                 43.0015, 141.4410, 44,  410, 200,  340),
];

export const SAPPORO_BOUNDS = {
  minLat: 42.86,
  maxLat: 43.22,
  minLon: 141.10,
  maxLon: 141.58,
};

export function isInsideSapporo(lat, lon) {
  return (
    lat >= SAPPORO_BOUNDS.minLat &&
    lat <= SAPPORO_BOUNDS.maxLat &&
    lon >= SAPPORO_BOUNDS.minLon &&
    lon <= SAPPORO_BOUNDS.maxLon
  );
}

export function findNearestWard(lat, lon) {
  let best = SAPPORO_WARD_VIEWS[0];
  let bestD2 = Infinity;
  for (const w of SAPPORO_WARD_VIEWS) {
    const dLat = w.lat - lat;
    const dLon = (w.lon - lon) * 0.73; // cos(43 deg) longitude scaling
    const d2 = dLat * dLat + dLon * dLon;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = w;
    }
  }
  return best;
}
