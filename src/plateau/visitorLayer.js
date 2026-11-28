import * as THREE from 'three';
import { latLonToGround } from './geo.js';
import { VISITOR_DATA } from './visitorData.js';

const KIND_META = {
  tourism: {
    label: '観光',
    short: '観',
    colorHex: 0xf59e0b,
    css: '#f59e0b',
    fadeStart: 4200,
    fadeEnd: 7800,
    baseW: 58,
    baseH: 18,
  },
  wifi: {
    label: 'Wi-Fi',
    short: 'Wi',
    colorHex: 0x38bdf8,
    css: '#38bdf8',
    fadeStart: 3800,
    fadeEnd: 7000,
    baseW: 52,
    baseH: 17,
  },
  toilet: {
    label: 'トイレ',
    short: 'トイレ',
    colorHex: 0x34d399,
    css: '#34d399',
    fadeStart: 3600,
    fadeEnd: 6800,
    baseW: 54,
    baseH: 17,
  },
};

function createPinTexture(title, kind) {
  const meta = KIND_META[kind] || KIND_META.tourism;
  const c = document.createElement('canvas');
  const wide = kind === 'toilet' || title.length >= 8;
  c.width = wide ? 248 : 220;
  c.height = 64;
  const ctx = c.getContext('2d');
  const pad = 5;
  const barW = kind === 'toilet' ? 48 : 36;

  ctx.fillStyle = 'rgba(9, 14, 28, 0.82)';
  ctx.strokeStyle = meta.css;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(pad, pad, c.width - pad * 2, c.height - pad * 2, 11);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = meta.css;
  ctx.beginPath();
  ctx.roundRect(pad + 6, pad + 7, barW, c.height - pad * 2 - 14, 7);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.font = `bold ${kind === 'toilet' ? 11 : 13}px -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(meta.short, pad + 6 + barW * 0.5, c.height * 0.5);

  const shortTitle = title.length > 12 ? `${title.slice(0, 11)}…` : title;
  const nameSize = shortTitle.length >= 10 ? 14 : shortTitle.length >= 7 ? 16 : 18;
  ctx.fillStyle = '#f8fafc';
  ctx.font = `bold ${nameSize}px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(shortTitle, pad + 6 + barW + 8, c.height * 0.5);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function cameraViewFor(pos) {
  const eye = new THREE.Vector3(pos.x + 55, 42, pos.z + 95);
  const tgt = pos.clone();
  tgt.y = 8;
  return { eye, tgt };
}

/**
 * Open-data visitor POI layer (tourism / Wi-Fi / park toilets) for the PLATEAU scene.
 */
export function createVisitorLayer(scene) {
  const root = new THREE.Group();
  root.name = 'visitor-layer';
  scene.add(root);

  const kindEnabled = { tourism: true, wifi: true, toilet: true };
  let winterOnly = false;
  let areaFilter = 'all';
  let layerVisible = false;
  let selectedId = null;

  /** @type {Map<string, any>} */
  const entries = new Map();
  const _pickRaycaster = new THREE.Raycaster();
  _pickRaycaster.params.Sprite = { threshold: 0.35 };
  const _ndc = new THREE.Vector2();

  for (const item of VISITOR_DATA.items) {
    const meta = KIND_META[item.kind];
    if (!meta) continue;
    const pos = latLonToGround(item.lat, item.lon, 0);
    const badgeY = 18;
    const tex = createPinTexture(item.name, item.kind);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.92,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(pos.x, badgeY, pos.z);
    sprite.scale.set(meta.baseW, meta.baseH, 1);
    sprite.userData = {
      visitorId: item.id,
      kind: item.kind,
      baseW: meta.baseW,
      baseH: meta.baseH,
      fadeStart: meta.fadeStart,
      fadeEnd: meta.fadeEnd,
      peakOpacity: 0.92,
      hovered: false,
    };

    const stemH = badgeY - 1.2;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, stemH, 6),
      new THREE.MeshBasicMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
    );
    stem.position.set(pos.x, stemH * 0.5, pos.z);
    stem.userData.visitorId = item.id;

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 16),
      new THREE.MeshBasicMaterial({
        color: meta.colorHex,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(pos.x, 0.35, pos.z);
    disc.userData.visitorId = item.id;

    root.add(stem, disc, sprite);
    entries.set(item.id, {
      item,
      pos,
      sprite,
      stem,
      disc,
      view: cameraViewFor(pos),
    });
  }

  function itemMatchesFilters(item) {
    if (!kindEnabled[item.kind]) return false;
    if (item.kind === 'toilet' && winterOnly && !item.winter) return false;
    if (item.kind === 'tourism' && areaFilter !== 'all' && item.area !== areaFilter) return false;
    return true;
  }

  function syncVisibility() {
    root.visible = layerVisible;
    if (!layerVisible) return;
    for (const entry of entries.values()) {
      const on = itemMatchesFilters(entry.item);
      entry.sprite.visible = on;
      entry.stem.visible = on;
      entry.disc.visible = on;
      if (!on && selectedId === entry.item.id) selectedId = null;
    }
  }

  function setVisible(on) {
    layerVisible = Boolean(on);
    syncVisibility();
  }

  function setKindEnabled(kind, on) {
    if (!(kind in kindEnabled)) return;
    kindEnabled[kind] = Boolean(on);
    syncVisibility();
  }

  function setWinterOnly(on) {
    winterOnly = Boolean(on);
    syncVisibility();
  }

  function setAreaFilter(area) {
    areaFilter = area || 'all';
    syncVisibility();
  }

  function listFiltered() {
    return VISITOR_DATA.items.filter(itemMatchesFilters);
  }

  function getItem(id) {
    return entries.get(id)?.item || null;
  }

  function getCameraView(id) {
    return entries.get(id)?.view || null;
  }

  function setSelected(id) {
    selectedId = id || null;
    for (const entry of entries.values()) {
      const selected = entry.item.id === selectedId;
      entry.sprite.userData.hovered = selected;
      entry.disc.material.opacity = selected ? 0.9 : 0.55;
      entry.stem.material.opacity = selected ? 0.75 : 0.45;
    }
  }

  function setHover(id) {
    for (const entry of entries.values()) {
      if (entry.item.id === selectedId) continue;
      entry.sprite.userData.hovered = entry.item.id === id;
    }
  }

  function pick(ndcX, ndcY, camera) {
    if (!layerVisible) return null;
    _ndc.set(ndcX, ndcY);
    _pickRaycaster.setFromCamera(_ndc, camera);
    const sprites = [];
    for (const entry of entries.values()) {
      if (!entry.sprite.visible) continue;
      sprites.push(entry.sprite);
    }
    const hits = _pickRaycaster.intersectObjects(sprites, false);
    if (!hits.length) return null;
    const id = hits[0].object.userData.visitorId;
    return getItem(id);
  }

  function update(cameraPos) {
    if (!layerVisible || !cameraPos) return;
    for (const entry of entries.values()) {
      if (!entry.sprite.visible) continue;
      const ch = entry.sprite;
      const d = cameraPos.distanceTo(ch.position);
      const s = Math.max(0.65, Math.min(2.0, Math.sqrt(d / 360))) * (ch.userData.hovered ? 1.1 : 1);
      ch.scale.set(ch.userData.baseW * s, ch.userData.baseH * s, 1);
      const peak = ch.userData.peakOpacity;
      const fadeStart = ch.userData.fadeStart;
      const fadeEnd = ch.userData.fadeEnd;
      const baseOpacity = d < fadeStart
        ? peak
        : Math.max(0, peak * (1 - (d - fadeStart) / Math.max(1, fadeEnd - fadeStart)));
      ch.material.opacity = Math.min(1, baseOpacity * (ch.userData.hovered ? 1.08 : 1));
      const show = ch.material.opacity > 0.05;
      ch.visible = show;
      entry.stem.visible = show;
      entry.disc.visible = show;
    }
  }

  syncVisibility();

  return {
    KIND_META,
    areas: VISITOR_DATA.areas,
    datasets: VISITOR_DATA.datasets,
    source: VISITOR_DATA.source,
    setVisible,
    isVisible: () => layerVisible,
    setKindEnabled,
    getKindEnabled: () => ({ ...kindEnabled }),
    setWinterOnly,
    getWinterOnly: () => winterOnly,
    setAreaFilter,
    getAreaFilter: () => areaFilter,
    listFiltered,
    getItem,
    getCameraView,
    setSelected,
    getSelectedId: () => selectedId,
    setHover,
    pick,
    update,
  };
}
