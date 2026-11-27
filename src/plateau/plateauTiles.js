import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { GLTFExtensionsPlugin } from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { ORIGIN, SAPPORO_WARD_VIEWS, makeEcefToLocalMatrix } from './geo.js';
import { applyWinterStyleToModel } from './winterMaterial.js';

/**
 * Verified live Project PLATEAU 3D Tiles URLs for ALL 10 wards of Sapporo City (01100, FY2020 CityGML v7).
 * - LOD2 (textured) is published for Chuo, Kita, Higashi, and Nishi wards.
 * - LOD1 is published for all 10 wards; in `lod2` mode the remaining 6 wards automatically load LOD1
 *   so the entire city of Sapporo renders seamlessly without missing wards.
 */
const WARDS = [
  {
    code: '01101',
    label: '中央区',
    core: true,
    lod2: 'https://assets.cms.plateau.reearth.io/assets/16/06e56d-a2d4-4fe4-ac91-b2762b96e033/01100_sapporo-shi_city_2020_citygml_7_op_bldg_3dtiles_01101_chuo-ku_lod2/tileset.json',
    lod1: 'https://assets.cms.plateau.reearth.io/assets/a6/031403-b4dc-4d5d-8c2f-50361fedc764/01100_sapporo-shi_city_2020_citygml_7_op_bldg_3dtiles_01101_chuo-ku_lod1/tileset.json',
  },
  {
    code: '01102',
    label: '北区',
    core: true,
    lod2: 'https://assets.cms.plateau.reearth.io/assets/0d/7900b4-4d6c-4720-8edd-2f129b431235/01100_sapporo-shi_city_2020_citygml_7_op_bldg_3dtiles_01102_kita-ku_lod2/tileset.json',
    lod1: 'https://assets.cms.plateau.reearth.io/assets/b6/2fe16c-44c8-4a42-8138-82c971cd0e2c/01100_sapporo-shi_city_2020_citygml_7_op_bldg_3dtiles_01102_kita-ku_lod1/tileset.json',
  },
  {
    code: '01103',
    label: '東区',
    core: false,
    lod2: 'https://assets.cms.plateau.reearth.io/assets/18/cbc248-5c55-4a9e-a20d-78055b72b6d9/01100_sapporo-shi_city_2020_citygml_7_op_bldg_3dtiles_01103_higashi-ku_lod2/tileset.json',
    lod1: 'https://assets.cms.plateau.reearth.io/assets/98/2f5131-ad3c-4551-943a-3607ed6afa3c/01100_sapporo-shi_city_2020_citygml_7_op_bldg_3dtiles_01103_higashi-ku_lod1/tileset.json',
  },
  {
    code: '01104',
    label: '白石区',
    core: false,
    lod1: 'https://assets.cms.plateau.reearth.io/assets/a2/2d4d91-f50a-4fd8-a055-771bf1495095/01100_sapporo-shi_city_2020_citygml_7_op_bldg_3dtiles_01104_shiroishi-ku_lod1/tileset.json',
  },
  {
    code: '01105',
    label: '豊平区',
    core: false,
    lod1: 'https://assets.cms.plateau.reearth.io/assets/02/d7a24f-76db-4295-844e-c667831fea43/01100_sapporo-shi_city_2020_citygml_7_op_bldg_3dtiles_01105_toyohira-ku_lod1/tileset.json',
  },
  {
    code: '01106',
    label: '南区',
    core: false,
    lod1: 'https://assets.cms.plateau.reearth.io/assets/aa/5f71a5-4442-4dcb-80bb-a022adbe409c/01100_sapporo-shi_city_2020_citygml_7_op_bldg_3dtiles_01106_minami-ku_lod1/tileset.json',
  },
  {
    code: '01107',
    label: '西区',
    core: false,
    lod2: 'https://assets.cms.plateau.reearth.io/assets/f0/03f2fd-3a52-4620-97a9-6b55a0e81933/01100_sapporo-shi_city_2020_citygml_7_op_bldg_3dtiles_01107_nishi-ku_lod2/tileset.json',
    lod1: 'https://assets.cms.plateau.reearth.io/assets/e1/e6b234-82bd-4311-b72b-5920b6dfc569/01100_sapporo-shi_city_2020_citygml_7_op_bldg_3dtiles_01107_nishi-ku_lod1/tileset.json',
  },
  {
    code: '01108',
    label: '厚別区',
    core: false,
    lod1: 'https://assets.cms.plateau.reearth.io/assets/26/96d6b5-1c35-40e3-bb79-c5b53f15405a/01100_sapporo-shi_city_2020_citygml_7_op_bldg_3dtiles_01108_atsubetsu-ku_lod1/tileset.json',
  },
  {
    code: '01109',
    label: '手稲区',
    core: false,
    lod1: 'https://assets.cms.plateau.reearth.io/assets/70/811042-e748-47a7-9f3e-420003f445b9/01100_sapporo-shi_city_2020_citygml_7_op_bldg_3dtiles_01109_teine-ku_lod1/tileset.json',
  },
  {
    code: '01110',
    label: '清田区',
    core: false,
    lod1: 'https://assets.cms.plateau.reearth.io/assets/1d/c2a380-16cd-4a40-b860-0889727d752c/01100_sapporo-shi_city_2020_citygml_7_op_bldg_3dtiles_01110_kiyota-ku_lod1/tileset.json',
  },
];

const WARD_CENTERS = Object.fromEntries(
  SAPPORO_WARD_VIEWS.map(w => [w.name, { x: w.tgt.x, z: w.tgt.z }])
);

export const SAPPORO_TILESETS = {
  lod2: WARDS.map(w => ({
    id: `${w.code}-${w.lod2 ? 'lod2' : 'lod1'}`,
    wardName: w.label,
    label: `${w.label} ${w.lod2 ? 'LOD2' : 'LOD1'}`,
    core: w.core,
    center: WARD_CENTERS[w.label] || { x: 0, z: 0 },
    url: w.lod2 || w.lod1,
  })),
  lod1: WARDS.map(w => ({
    id: `${w.code}-lod1`,
    wardName: w.label,
    label: `${w.label} LOD1`,
    core: w.core,
    center: WARD_CENTERS[w.label] || { x: 0, z: 0 },
    url: w.lod1,
  })),
};

/**
 * Manages multiple PLATEAU 3D Tiles renderers (Chuo-ku + Kita-ku),
 * handles LOD switching, local ENU orientation, ground height calibration,
 * and winter/night shader patching.
 */
export function createPlateauCityManager({ scene, camera, renderer, winterUniforms, onStatus }) {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'PLATEAU_SAPPORO_ROOT';
  scene.add(rootGroup);

  // Shared local Draco decoder (bundled into dist/draco/ by build.mjs)
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('/draco/');
  dracoLoader.preload();

  let activeRenderers = [];
  let currentMode = 'lod1';
  let groundEllipsoidalHeight = ORIGIN.height;
  let loadedModelCount = 0;
  let loadErrorCount = 0;
  let calibrated = false;
  let frameCounter = 0;
  let modeStartMs = performance.now();

  const _box = new THREE.Box3();
  const groundSamples = [];

  function applyTransformToRenderer(tr) {
    const mat = makeEcefToLocalMatrix(groundEllipsoidalHeight);
    mat.decompose(tr.group.position, tr.group.quaternion, tr.group.scale);
    tr.group.updateMatrixWorld(true);
  }

  function setGroundEllipsoidalHeight(h) {
    groundEllipsoidalHeight = h;
    for (const item of activeRenderers) {
      applyTransformToRenderer(item.tr);
    }
  }

  /**
   * Automatically fine-tunes ground height using the lowest building bases near Odori Park
   * so PLATEAU buildings sit flush on the snow ground plane without floating or sinking.
   */
  function sampleGroundFromModel(modelScene) {
    if (calibrated) return;
    modelScene.updateWorldMatrix(true, true);
    _box.setFromObject(modelScene);
    if (_box.isEmpty()) return;

    const cx = (_box.min.x + _box.max.x) * 0.5;
    const cz = (_box.min.z + _box.max.z) * 0.5;
    const dist = Math.hypot(cx, cz);

    // Only calibrate from buildings close to Odori Park / central Sapporo (flat alluvial fan)
    if (dist < 650 && Number.isFinite(_box.min.y) && _box.min.y > -25 && _box.min.y < 25) {
      groundSamples.push(_box.min.y);
      if (groundSamples.length >= 6) {
        groundSamples.sort((a, b) => a - b);
        const p35 = groundSamples[Math.floor(groundSamples.length * 0.35)];
        const deltaY = p35 + 2.2;
        if (Math.abs(deltaY) > 0.35 && Math.abs(deltaY) < 12) {
          groundEllipsoidalHeight += deltaY;
          for (const item of activeRenderers) {
            applyTransformToRenderer(item.tr);
          }
        }
        calibrated = true;
      }
    }
  }

  function clearRenderers() {
    for (const item of activeRenderers) {
      rootGroup.remove(item.tr.group);
      try {
        item.tr.dispose();
      } catch {
        // Ignore cleanup errors on in-flight tiles
      }
    }
    activeRenderers = [];
    loadedModelCount = 0;
    loadErrorCount = 0;
  }

  function loadMode(mode = 'lod2') {
    clearRenderers();
    currentMode = mode;
    modeStartMs = performance.now();
    const specs = SAPPORO_TILESETS[mode] || SAPPORO_TILESETS.lod2;
    const maxAniso = renderer.capabilities?.getMaxAnisotropy?.() || 8;

    for (const spec of specs) {
      const tr = new TilesRenderer(spec.url);
      tr.registerPlugin(new GLTFExtensionsPlugin({
        dracoLoader,
        rtc: true,
        metadata: false,
        autoDispose: false, // Keep shared dracoLoader alive & avoid null ktxLoader dispose bug
      }));

      // Complete & fast 10-ward PLATEAU streaming without missing areas:
      // - loadSiblings = true prevents REPLACE-refinement holes when panning across boundaries
      // - errorFalloff = 0 ensures outer wards & smaller buildings always refine properly
      // - High parallel download/parse queues keep multi-ward streaming snappy
      tr.loadSiblings = true;
      tr.displayActiveTiles = true;
      tr.errorTarget = mode === 'lod2' ? 14 : 16;
      tr.errorFalloff = 0;
      tr.maxDepth = 18;
      tr.maxTilesProcessed = 500;
      tr.fetchOptions = { mode: 'cors' };

      tr.lruCache.minSize = 1800;
      tr.lruCache.maxSize = 3200;
      if (tr.downloadQueue) tr.downloadQueue.maxJobsPerOrigin = 36;
      if (tr.parseQueue) tr.parseQueue.maxJobs = 12;

      tr.setCamera(camera);
      tr.setResolutionFromRenderer(camera, renderer);
      applyTransformToRenderer(tr);

      tr.addEventListener('load-model', ev => {
        loadedModelCount++;
        applyWinterStyleToModel(ev.scene, winterUniforms, maxAniso);
        sampleGroundFromModel(ev.scene);
      });

      tr.addEventListener('load-error', () => {
        loadErrorCount++;
      });

      rootGroup.add(tr.group);
      activeRenderers.push({ tr, spec });
    }

    onStatus?.(getStats());
  }

  let lastRetryMs = performance.now();

  function getStats() {
    let visible = 0;
    let active = 0;
    let progressSum = 0;
    let readyWards = 0;
    for (const { tr } of activeRenderers) {
      visible += tr.visibleTiles?.size || 0;
      active += tr.activeTiles?.size || 0;
      progressSum += tr.loadProgress ?? 0;
      if (tr.root) readyWards++;
    }
    const first = activeRenderers[0]?.tr;
    const downloading = (first?.downloadQueue?.itemsInList || 0) + (first?.parseQueue?.itemsInList || 0);
    const progress = activeRenderers.length ? progressSum / activeRenderers.length : 1;
    return {
      mode: currentMode,
      wardCount: activeRenderers.length,
      readyWards,
      visibleTiles: visible,
      activeTiles: active,
      loadedModels: loadedModelCount,
      downloading,
      errors: loadErrorCount,
      progress,
      groundHeight: groundEllipsoidalHeight,
    };
  }

  /**
   * Updates ALL 10 wards every frame so the shared LRU cache stays consistent and
   * no ward border or distant area is ever hidden or dropped.
   * Uses gentle camera-speed adaptation so fast camera fly-to paints coarse tiles immediately
   * and refines cleanly to crisp detail as soon as the camera slows down.
   */
  function update(camPos = camera.position, camSpeed = 0) {
    camera.updateMatrixWorld();
    frameCounter++;

    const now = performance.now();
    // Periodically retry any transiently failed tile requests
    if (loadErrorCount > 0 && now - lastRetryMs > 4500) {
      lastRetryMs = now;
      for (const { tr } of activeRenderers) {
        tr.resetFailedTiles();
      }
    }

    const elapsedMs = now - modeStartMs;
    const startupBoost = elapsedMs < 900 ? 10 * (1 - elapsedMs / 900) : 0;
    const motionBoost = Math.min(12, camSpeed * 0.06);

    for (let i = 0; i < activeRenderers.length; i++) {
      const { tr, spec } = activeRenderers[i];
      tr.group.visible = true;

      const dx = camPos.x - spec.center.x;
      const dz = camPos.z - spec.center.z;
      const dist = Math.hypot(dx, dz);

      // Keep nearby wards crisp and distant wards lighter without ever stopping refinement
      let baseErr;
      if (currentMode === 'lod2') {
        baseErr = dist < 3600 ? 7.5 : (dist < 7500 ? 12.0 : 18.0);
      } else {
        baseErr = dist < 4200 ? 10.0 : 16.0;
      }
      tr.errorTarget = baseErr + startupBoost + motionBoost;
      tr.update();
    }
  }

  function handleResize() {
    for (const { tr } of activeRenderers) {
      tr.setResolutionFromRenderer(camera, renderer);
    }
  }

  // Start immediately with LOD2
  loadMode('lod1');

  return {
    rootGroup,
    loadMode,
    update,
    handleResize,
    getStats,
    getMode: () => currentMode,
    setGroundEllipsoidalHeight,
    getGroundEllipsoidalHeight: () => groundEllipsoidalHeight,
  };
}
