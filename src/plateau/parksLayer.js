import * as THREE from 'three';
import { latLonToGround } from './geo.js';
import parksGeo from './data/centralParks.json';

const FILL_Y = 0.55;
const LINE_Y = 0.85;

const FILL_COLOR = 0x3f8f5a;
const FILL_ODORI = 0x5cb87a;
const LINE_COLOR = 0xa7f3c0;
const LINE_ODORI = 0xd9f99d;

function iterPolygons(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function ringToShape(ring) {
  if (!ring || ring.length < 4) return null;
  const shape = new THREE.Shape();
  let started = false;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon, lat] = ring[i];
    const p = latLonToGround(lat, lon, 0);
    if (!started) {
      shape.moveTo(p.x, -p.z);
      started = true;
    } else {
      shape.lineTo(p.x, -p.z);
    }
  }
  if (!started) return null;
  shape.closePath();
  return shape;
}

function buildFillMesh(polygons, isOdori) {
  const shapes = [];
  for (const poly of polygons) {
    const exterior = ringToShape(poly[0]);
    if (!exterior) continue;
    for (let h = 1; h < poly.length; h++) {
      const hole = ringToShape(poly[h]);
      if (hole) exterior.holes.push(hole);
    }
    shapes.push(exterior);
  }
  if (!shapes.length) return null;

  const geo = new THREE.ShapeGeometry(shapes, 3);
  // Shape is in (x, -z) plane → rotate to XZ ground
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: isOdori ? FILL_ODORI : FILL_COLOR,
    transparent: true,
    opacity: isOdori ? 0.38 : 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = FILL_Y;
  mesh.renderOrder = 2;
  return mesh;
}

function buildOutline(polygons, isOdori) {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({
    color: isOdori ? LINE_ODORI : LINE_COLOR,
    transparent: true,
    opacity: isOdori ? 0.95 : 0.72,
    depthWrite: false,
  });

  for (const poly of polygons) {
    for (const ring of poly) {
      if (!ring || ring.length < 2) continue;
      const positions = [];
      for (const [lon, lat] of ring) {
        const p = latLonToGround(lat, lon, LINE_Y);
        positions.push(p.x, p.y, p.z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const line = new THREE.LineLoop(geo, mat);
      line.renderOrder = 3;
      group.add(line);
    }
  }
  return group.children.length ? group : null;
}

/**
 * Parks / green-spaces polygon layer from Sapporo open data (central Odori vicinity).
 */
export function createParksLayer(scene) {
  const root = new THREE.Group();
  root.name = 'parks-layer';
  scene.add(root);

  let layerVisible = false;
  let showFill = true;
  let showOutline = true;

  const entries = [];

  for (const feature of parksGeo.features || []) {
    const props = feature.properties || {};
    const polygons = iterPolygons(feature.geometry);
    if (!polygons.length) continue;
    const isOdori = props.name === '大通公園';
    const entryGroup = new THREE.Group();
    entryGroup.name = props.id || props.name || 'park';

    const fill = buildFillMesh(polygons, isOdori);
    const outline = buildOutline(polygons, isOdori);
    if (fill) entryGroup.add(fill);
    if (outline) entryGroup.add(outline);
    if (!entryGroup.children.length) continue;

    root.add(entryGroup);
    entries.push({
      props,
      group: entryGroup,
      fill,
      outline,
      isOdori,
    });
  }

  function syncVisibility() {
    root.visible = layerVisible;
    if (!layerVisible) return;
    for (const entry of entries) {
      if (entry.fill) entry.fill.visible = showFill;
      if (entry.outline) entry.outline.visible = showOutline;
    }
  }

  function setVisible(on) {
    layerVisible = Boolean(on);
    syncVisibility();
  }

  function setShowFill(on) {
    showFill = Boolean(on);
    syncVisibility();
  }

  function setShowOutline(on) {
    showOutline = Boolean(on);
    syncVisibility();
  }

  syncVisibility();

  return {
    source: parksGeo.source,
    featureCount: entries.length,
    setVisible,
    isVisible: () => layerVisible,
    setShowFill,
    getShowFill: () => showFill,
    setShowOutline,
    getShowOutline: () => showOutline,
  };
}
