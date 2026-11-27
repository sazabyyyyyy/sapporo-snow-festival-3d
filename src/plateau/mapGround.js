import * as THREE from 'three';
import { ORIGIN, latLonToGround } from './geo.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// Odori Park Nishi 4-chome orthometric elevation (~22.0m TP) maps to local y = 0
const ODORI_BASE_ELEVATION = 22.0;

export const MAP_STYLES = {
  std: {
    id: 'std',
    label: '🗺 道路地図',
    url: (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/std/${z}/${x}/${y}.png`,
  },
  photo: {
    id: 'photo',
    label: '🛰 航空写真',
    url: (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${z}/${x}/${y}.jpg`,
  },
  pale: {
    id: 'pale',
    label: '🗺 淡色地図',
    url: (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/pale/${z}/${x}/${y}.png`,
  },
};

function lon2tileX(lon, z) {
  return ((lon + 180) / 360) * (1 << z);
}
function lat2tileY(lat, z) {
  const rad = lat * DEG2RAD;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * (1 << z);
}
function tileX2lon(x, z) {
  return (x / (1 << z)) * 360 - 180;
}
function tileY2lat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / (1 << z);
  return Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))) * RAD2DEG;
}

/**
 * Approximate inverse of local (x=East, z=South) back to WGS84 (lat, lon) around ORIGIN.
 * Accurate to within ~1m across Sapporo City (sufficient for choosing slippy map tiles!).
 */
function localXZToLatLon(x, z) {
  const metersPerDegLat = 111100;
  const metersPerDegLon = 111320 * Math.cos(ORIGIN.lat * DEG2RAD);
  return {
    lat: ORIGIN.lat - z / metersPerDegLat,
    lon: ORIGIN.lon + x / metersPerDegLon,
  };
}

/**
 * Fetches & decodes a GSI dem_png elevation tile (256x256 -> Float32Array of orthometric heights in meters).
 */
const demCache = new Map();
const demPending = new Map();

function loadDemTile(z, tx, ty) {
  const key = `${z}/${tx}/${ty}`;
  if (demCache.has(key)) return Promise.resolve(demCache.get(key));
  if (demPending.has(key)) return demPending.get(key);

  const p = new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 256;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, 256, 256).data;
        const heights = new Float32Array(256 * 256);
        for (let i = 0; i < 256 * 256; i++) {
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          if (r === 128 && g === 0 && b === 0) {
            heights[i] = 0; // NoData (water/sea)
          } else {
            const v = (r << 16) + (g << 8) + b;
            heights[i] = (v < 8388608 ? v : v - 16777216) * 0.01;
          }
        }
        demCache.set(key, heights);
        resolve(heights);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `https://cyberjapandata.gsi.go.jp/xyz/dem_png/${z}/${tx}/${ty}.png`;
  }).finally(() => {
    demPending.delete(key);
  });

  demPending.set(key, p);
  return p;
}

function sampleDemHeight(heights, zDem, demTx, demTy, lat, lon) {
  if (!heights) return ODORI_BASE_ELEVATION;
  const fx = (lon2tileX(lon, zDem) - demTx) * 255;
  const fy = (lat2tileY(lat, zDem) - demTy) * 255;
  const x0 = Math.max(0, Math.min(255, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(255, Math.floor(fy)));
  const x1 = Math.min(255, x0 + 1);
  const y1 = Math.min(255, y0 + 1);
  const tx = Math.max(0, Math.min(1, fx - x0));
  const ty = Math.max(0, Math.min(1, fy - y0));

  const h00 = heights[y0 * 256 + x0];
  const h10 = heights[y0 * 256 + x1];
  const h01 = heights[y1 * 256 + x0];
  const h11 = heights[y1 * 256 + x1];
  const h0 = h00 + (h10 - h00) * tx;
  const h1 = h01 + (h11 - h01) * tx;
  return h0 + (h1 - h0) * ty;
}

/**
 * Streams real GSI map/aerial road tiles draped onto real GSI DEM 3D topography
 * across ALL 10 Sapporo wards, centered dynamically around the active camera target!
 *   - Inner ring (z = 16, 7x7 tiles = ~3.1km x 3.1km): sharp street-level roads & landmarks
 *   - Outer ring (z = 13, 7x7 tiles = ~25km x 25km): city-wide roads & topography to horizon
 */
export function createMapGroundLayer(scene, renderer) {
  const group = new THREE.Group();
  group.name = 'SAPPORO_GSI_MAP_GROUND';
  scene.add(group);

  const innerGroup = new THREE.Group();
  const outerGroup = new THREE.Group();
  group.add(outerGroup, innerGroup);

  const maxAniso = Math.min(16, renderer.capabilities?.getMaxAnisotropy?.() || 8);
  const texLoader = new THREE.TextureLoader();
  texLoader.setCrossOrigin('anonymous');

  let currentStyle = 'std'; // Default: clear Japanese road map (roads, intersections, rivers, railways, parks)
  let currentNight = 0.88;
  let currentSeason = 'winter';
  let currentWeather = 'snow';

  const sharedTint = new THREE.Color(0xffffff);
  let sharedRoughness = 0.86;
  let sharedMetalness = 0.06;

  // Map<key, { mesh, mat, geo, tex, disposed }>
  const innerTiles = new Map();
  const outerTiles = new Map();

  let lastInnerCenter = '';
  let lastOuterCenter = '';

  function computeVisualParams() {
    // Smoothly darken bright daytime map/aerial tiles for twilight & night while keeping roads legible
    const nightMix = Math.max(0, Math.min(1, currentNight * 0.85));
    const bright = 1.0 - nightMix * 0.62;
    sharedTint.setRGB(bright, bright, bright);

    if (currentNight > 0.35) {
      sharedTint.lerp(new THREE.Color(0x3a4d74), Math.min(0.55, currentNight * 0.42));
    }
    if (currentSeason === 'winter' && currentWeather === 'snow') {
      // Crisp cool snow-toned ground in winter while preserving dark asphalt roads
      sharedTint.lerp(new THREE.Color(0xc8daf0), currentNight > 0.4 ? 0.14 : 0.24);
    } else if (currentSeason === 'autumn') {
      sharedTint.lerp(new THREE.Color(0xe8d5ba), 0.14);
    } else if (currentWeather === 'rain') {
      sharedTint.multiplyScalar(0.84);
    }

    sharedRoughness = currentWeather === 'rain' ? 0.26 : (currentStyle === 'photo' ? 0.84 : 0.90);
    sharedMetalness = currentWeather === 'rain' ? 0.28 : 0.04;

    for (const map of [innerTiles, outerTiles]) {
      for (const entry of map.values()) {
        entry.mat.color.copy(sharedTint);
        entry.mat.roughness = sharedRoughness;
        entry.mat.metalness = sharedMetalness;
      }
    }
  }

  function buildTileMesh(z, tx, ty, isOuter) {
    const segs = isOuter ? 14 : 16;
    const geo = new THREE.PlaneGeometry(1, 1, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const vTmp = new THREE.Vector3();

    // Store lat/lon per vertex so we can displace Y cleanly once DEM arrives
    const lats = new Float32Array(pos.count);
    const lons = new Float32Array(pos.count);
    const yBias = isOuter ? -2.4 : -0.35; // Slight depression so buildings & Odori snow sculptures never z-fight

    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i);
      const vNS = 1.0 - uv.getY(i); // uv.y=1 -> North edge (ty), uv.y=0 -> South edge (ty+1)
      const lon = tileX2lon(tx + u, z);
      const lat = tileY2lat(ty + vNS, z);
      lats[i] = lat;
      lons[i] = lon;

      latLonToGround(lat, lon, yBias, vTmp);
      pos.setXYZ(i, vTmp.x, vTmp.y, vTmp.z);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: sharedTint.clone(),
      roughness: sharedRoughness,
      metalness: sharedMetalness,
      polygonOffset: true,
      polygonOffsetFactor: isOuter ? 4 : 2,
      polygonOffsetUnits: isOuter ? 4 : 2,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = !isOuter;
    mesh.renderOrder = isOuter ? -2 : -1;

    const entry = { mesh, mat, geo, tex: null, disposed: false };
    const styleDef = MAP_STYLES[currentStyle] || MAP_STYLES.std;
    const imgUrl = styleDef.url(z, tx, ty);

    texLoader.load(
      imgUrl,
      tex => {
        if (entry.disposed) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAniso;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        entry.tex = tex;
        mat.map = tex;
        mat.needsUpdate = true;
      },
      undefined,
      () => {
        // Silently ignore missing far-sea tiles
      }
    );

    // Fetch matching GSI DEM tile (z=14 for inner z=16, z=13 for outer z=13) and displace vertices to exact topography!
    const zDem = isOuter ? 13 : 14;
    const scaleShift = z - zDem;
    const demTx = tx >> scaleShift;
    const demTy = ty >> scaleShift;

    loadDemTile(zDem, demTx, demTy).then(heights => {
      if (entry.disposed || !heights) return;
      for (let i = 0; i < pos.count; i++) {
        const elev = sampleDemHeight(heights, zDem, demTx, demTy, lats[i], lons[i]);
        let localY = (elev - ODORI_BASE_ELEVATION) + yBias;

        // Keep central Odori Park Snow Festival pad flush around y = -0.35m so snow sculptures sit evenly
        const vx = pos.getX(i);
        const vz = pos.getZ(i);
        const dOdori = Math.hypot((vx + 180) / 850, vz / 240);
        if (dOdori < 1.3) {
          const blend = Math.max(0, Math.min(1, (dOdori - 0.75) / 0.55));
          const sm = blend * blend * (3 - 2 * blend);
          localY = yBias + (localY - yBias) * sm;
        }
        pos.setY(i, localY);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    });

    return entry;
  }

  function disposeEntry(entry) {
    entry.disposed = true;
    entry.geo.dispose();
    entry.mat.dispose();
    if (entry.tex) entry.tex.dispose();
  }

  function syncRing(tileMap, parentGroup, z, centerTx, centerTy, radius, isOuter) {
    const needed = new Set();
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = centerTx + dx;
        const ty = centerTy + dy;
        const key = `${currentStyle}:${z}/${tx}/${ty}`;
        needed.add(key);
        if (!tileMap.has(key)) {
          const entry = buildTileMesh(z, tx, ty, isOuter);
          tileMap.set(key, entry);
          parentGroup.add(entry.mesh);
        }
      }
    }

    for (const [key, entry] of tileMap.entries()) {
      if (!needed.has(key)) {
        parentGroup.remove(entry.mesh);
        disposeEntry(entry);
        tileMap.delete(key);
      }
    }
  }

  function update(focusPos) {
    const { lat, lon } = localXZToLatLon(focusPos.x, focusPos.z);

    // Inner sharp street-level ring (z = 16, 7x7 tiles = ~3.1km x 3.1km)
    const tx16 = Math.floor(lon2tileX(lon, 16));
    const ty16 = Math.floor(lat2tileY(lat, 16));
    const innerKey = `${currentStyle}:${tx16},${ty16}`;
    if (innerKey !== lastInnerCenter) {
      lastInnerCenter = innerKey;
      syncRing(innerTiles, innerGroup, 16, tx16, ty16, 3, false);
    }

    // Outer city-wide horizon ring (z = 13, 7x7 tiles = ~25km x 25km)
    const tx13 = Math.floor(lon2tileX(lon, 13));
    const ty13 = Math.floor(lat2tileY(lat, 13));
    const outerKey = `${currentStyle}:${tx13},${ty13}`;
    if (outerKey !== lastOuterCenter) {
      lastOuterCenter = outerKey;
      syncRing(outerTiles, outerGroup, 13, tx13, ty13, 3, true);
    }
  }

  function setStyle(styleId) {
    if (!MAP_STYLES[styleId] || styleId === currentStyle) return;
    currentStyle = styleId;
    lastInnerCenter = '';
    lastOuterCenter = '';
    computeVisualParams();
  }

  function setAtmosphere(nightFactor, season, weather) {
    currentNight = nightFactor;
    currentSeason = season;
    currentWeather = weather;
    computeVisualParams();
  }

  /**
   * Async real-elevation lookup (in local Three.js Y meters) for exact placement
   * of the Current Location beacon or ward targets anywhere in Sapporo!
   */
  async function getLocalElevationAt(lat, lon) {
    const zDem = 14;
    const tx = Math.floor(lon2tileX(lon, zDem));
    const ty = Math.floor(lat2tileY(lat, zDem));
    const heights = await loadDemTile(zDem, tx, ty);
    if (!heights) return null;
    const elev = sampleDemHeight(heights, zDem, tx, ty, lat, lon);
    return elev - ODORI_BASE_ELEVATION;
  }

  computeVisualParams();

  return {
    group,
    update,
    setStyle,
    getStyle: () => currentStyle,
    setAtmosphere,
    getLocalElevationAt,
  };
}
