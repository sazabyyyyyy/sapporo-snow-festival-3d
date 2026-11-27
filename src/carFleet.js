import * as THREE from 'three';

/**
 * Builds a sleek side-profile sedan/hatchback chassis ExtrudeGeometry oriented along +X (front = +X, up = +Y, width = Z).
 * Unit dimensions: length ~4.45m, width ~1.82m, height ~1.48m (scaled by `scale` parameter).
 */
function createChassisGeometry(scale) {
  const s = new THREE.Shape();
  // Bottom sill (clear of ground for wheels) -> front bumper -> hood -> cowl -> rear trunk -> rear bumper
  s.moveTo(-2.18, 0.24);
  s.lineTo( 2.18, 0.24);
  s.lineTo( 2.24, 0.42);
  s.lineTo( 2.16, 0.72);  // Front nose
  s.lineTo( 1.98, 0.84);  // Front hood corner
  s.lineTo( 0.96, 0.94);  // Base of windshield
  s.lineTo(-1.35, 0.96);  // Rear deck base
  s.lineTo(-2.12, 0.90);  // Trunk edge
  s.lineTo(-2.24, 0.68);  // Rear bumper upper
  s.lineTo(-2.22, 0.36);
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 1.78,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.89);
  geo.scale(scale, scale, scale);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a tapered greenhouse cabin (sloped windshield, roof, C-pillar rear glass) oriented along +X.
 */
function createCabinGeometry(scale) {
  const s = new THREE.Shape();
  s.moveTo(-1.46, 0.88);
  s.lineTo( 1.02, 0.88);
  s.lineTo( 0.46, 1.44);  // Front windshield slope
  s.lineTo(-0.88, 1.44);  // Roofline
  s.lineTo(-1.46, 0.92);  // Rear glass slope
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 1.44,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.72);
  geo.scale(scale, scale, scale);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a thin painted roof panel sitting atop the dark glass cabin so windows wrap cleanly around all 4 sides.
 */
function createRoofCapGeometry(scale) {
  const geo = new THREE.BoxGeometry(1.36 * scale, 0.08 * scale, 1.38 * scale);
  geo.translate(-0.21 * scale, 1.45 * scale, 0);
  return geo;
}

/**
 * Creates a high-performance InstancedMesh fleet of realistic multi-part 3D cars:
 *   - Sculpted metallic body with varied real Hokkaido car colors (pearl white, silver, navy, charcoal, crimson, taxi)
 *   - Glossy dark tinted glass cabin with sloped front & rear windshields
 *   - Painted/snow-dusted roof cap
 *   - 4 separate cylindrical wheels + tires per car
 *   - Twin front LED headlights (left & right) + twin rear crimson taillights (left & right)
 */
export function createDetailedCarFleet(parentGroup, cars, scale = 1.0) {
  const count = cars.length;
  const bodyGeo = createChassisGeometry(scale);
  const cabinGeo = createCabinGeometry(scale);
  const roofGeo = createRoofCapGeometry(scale);

  // Wheel cylinder rotated so axle runs along Z (left/right of car when car faces +X)
  const wheelGeo = new THREE.CylinderGeometry(0.34 * scale, 0.34 * scale, 0.24 * scale, 10);
  wheelGeo.rotateX(Math.PI / 2);

  const lampGeo = new THREE.BoxGeometry(0.14 * scale, 0.16 * scale, 0.34 * scale);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.62,
    roughness: 0.26,
  });
  const cabinMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b1220,
    metalness: 0.25,
    roughness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xe2ecf8, // Slightly snow-dusted winter car roof
    metalness: 0.25,
    roughness: 0.58,
  });
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x161920,
    metalness: 0.28,
    roughness: 0.78,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e2,
    emissive: 0xffebb8,
    emissiveIntensity: 4.5,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff2a20,
    emissive: 0xff1a14,
    emissiveIntensity: 4.0,
  });

  const bodyIM = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
  const cabinIM = new THREE.InstancedMesh(cabinGeo, cabinMat, count);
  const roofIM = new THREE.InstancedMesh(roofGeo, roofMat, count);
  const wheelIM = new THREE.InstancedMesh(wheelGeo, wheelMat, count * 4);
  const headIM = new THREE.InstancedMesh(lampGeo, headMat, count * 2);
  const tailIM = new THREE.InstancedMesh(lampGeo, tailMat, count * 2);

  bodyIM.castShadow = true;
  bodyIM.receiveShadow = true;
  cabinIM.castShadow = true;

  // Assign realistic varied car paint colors
  const palette = [
    0xe8eef5, // Pearl white (very common in Hokkaido!)
    0xb4becb, // Metallic silver
    0x273244, // Deep navy
    0x373c46, // Charcoal grey
    0x1b1e24, // Gloss black / Sapporo taxi
    0x982a2a, // Crimson metallic
    0x3c5268, // Slate blue
    0xdad5cc, // Warm pearl beige
  ];
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    col.setHex(palette[(i * 7 + 3) % palette.length]);
    bodyIM.setColorAt(i, col);
  }
  if (bodyIM.instanceColor) bodyIM.instanceColor.needsUpdate = true;

  parentGroup.add(bodyIM, cabinIM, roofIM, wheelIM, headIM, tailIM);

  const carMat4 = new THREE.Matrix4();
  const partMat4 = new THREE.Matrix4();
  const finalMat4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);

  // Local offsets (in unscaled car space where front = +X, up = +Y, right = +Z)
  const wheelOffsets = [
    [ 1.36 * scale, 0.34 * scale,  0.86 * scale],
    [ 1.36 * scale, 0.34 * scale, -0.86 * scale],
    [-1.32 * scale, 0.34 * scale,  0.86 * scale],
    [-1.32 * scale, 0.34 * scale, -0.86 * scale],
  ];
  const headOffsets = [
    [ 2.20 * scale, 0.64 * scale,  0.62 * scale],
    [ 2.20 * scale, 0.64 * scale, -0.62 * scale],
  ];
  const tailOffsets = [
    [-2.22 * scale, 0.68 * scale,  0.64 * scale],
    [-2.22 * scale, 0.68 * scale, -0.64 * scale],
  ];

  // Pre-build local translation matrices for wheels & lamps
  const wheelLocals = wheelOffsets.map(([x, y, z]) => new THREE.Matrix4().makeTranslation(x, y, z));
  const headLocals = headOffsets.map(([x, y, z]) => new THREE.Matrix4().makeTranslation(x, y, z));
  const tailLocals = tailOffsets.map(([x, y, z]) => new THREE.Matrix4().makeTranslation(x, y, z));

  return {
    update(time, nightFactor = 0.85) {
      // Tone headlights & taillights smoothly between daytime and nighttime
      headMat.emissiveIntensity = 1.4 + 3.4 * Math.min(1.2, nightFactor);
      tailMat.emissiveIntensity = 1.2 + 3.0 * Math.min(1.2, nightFactor);

      for (let i = 0; i < count; i++) {
        const c = cars[i];
        const u = ((c.t + time * c.speed * c.dir) % 1 + 1) % 1;
        const coord = c.min + (c.max - c.min) * u;
        const x = c.axis === 'x' ? coord : c.pos;
        const z = c.axis === 'z' ? coord : c.pos;

        // Heading so local +X points in travel direction:
        //   +X -> yaw = 0, -X -> yaw = PI
        //   +Z -> yaw = -PI/2, -Z -> yaw = +PI/2
        let yaw = 0;
        if (c.axis === 'x') yaw = c.dir > 0 ? 0 : Math.PI;
        else yaw = c.dir > 0 ? -Math.PI / 2 : Math.PI / 2;

        pos.set(x, c.y || 0.05, z);
        quat.setFromAxisAngle(yAxis, yaw);
        carMat4.compose(pos, quat, one);

        bodyIM.setMatrixAt(i, carMat4);
        cabinIM.setMatrixAt(i, carMat4);
        roofIM.setMatrixAt(i, carMat4);

        const wBase = i * 4;
        for (let w = 0; w < 4; w++) {
          finalMat4.multiplyMatrices(carMat4, wheelLocals[w]);
          wheelIM.setMatrixAt(wBase + w, finalMat4);
        }

        const lBase = i * 2;
        for (let l = 0; l < 2; l++) {
          finalMat4.multiplyMatrices(carMat4, headLocals[l]);
          headIM.setMatrixAt(lBase + l, finalMat4);

          partMat4.multiplyMatrices(carMat4, tailLocals[l]);
          tailIM.setMatrixAt(lBase + l, partMat4);
        }
      }

      bodyIM.instanceMatrix.needsUpdate = true;
      cabinIM.instanceMatrix.needsUpdate = true;
      roofIM.instanceMatrix.needsUpdate = true;
      wheelIM.instanceMatrix.needsUpdate = true;
      headIM.instanceMatrix.needsUpdate = true;
      tailIM.instanceMatrix.needsUpdate = true;
    },
  };
}
