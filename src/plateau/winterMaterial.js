import * as THREE from 'three';

/**
 * Shared shader uniforms updated every frame/preset for all PLATEAU building materials.
 * Enhances both textured LOD2 and untextured LOD1 buildings with:
 *   - Ground contact Ambient Occlusion (eliminates "pasted-on" look)
 *   - Real-time glossy glass detection & sky reflection (roughness/metalness modulation)
 *   - Procedural architectural curtain-wall / concrete facade detailing for untextured LOD1 buildings
 *   - Natural wind-drifted snow accumulation on rooftops & flat ledges
 *   - Crisp daytime color contrast restoration & rich twilight/night illuminated windows
 */
export function createWinterUniforms() {
  return {
    uNightFactor: { value: 0.88 },       // 0.0 (bright day) .. 0.14 (morning) .. 0.88 (twilight) .. 1.15 (night)
    uSnowCover: { value: 0.90 },         // Roof snow accumulation strength
    uWindowGlow: { value: 0.92 },        // Procedural lit windows on vertical facades at night
    uWhiteModel: { value: 0.0 },         // 0 = photorealistic enhanced, 1 = clean white architectural model
    uTime: { value: 0.0 },
    uSnowColor: { value: new THREE.Color(0xc8d8ee) },
    uTintColor: { value: new THREE.Color(0x52658a) },
  };
}

/**
 * Patches loaded PLATEAU b3dm/glTF materials with high-realism architectural PBR shaders.
 */
export function applyWinterStyleToModel(modelScene, winterUniforms, maxAnisotropy = 8) {
  modelScene.traverse(obj => {
    if (!obj.isMesh || !obj.material) return;

    if (obj.geometry && !obj.geometry.attributes.normal) {
      obj.geometry.computeVertexNormals();
    }

    obj.castShadow = true;
    obj.receiveShadow = true;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const patched = mats.map(origMat => {
      let mat = origMat;
      if (!mat.isMeshStandardMaterial) {
        const next = new THREE.MeshStandardMaterial({
          color: mat.color ? mat.color.clone() : new THREE.Color(0xb8c2d0),
          map: mat.map || null,
          roughness: 0.78,
          metalness: 0.10,
          side: mat.side,
        });
        mat.dispose();
        mat = next;
      } else {
        mat.roughness = Math.max(0.42, mat.roughness ?? 0.78);
        mat.metalness = Math.min(0.32, mat.metalness ?? 0.10);
      }

      if (mat.map) {
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.map.anisotropy = Math.min(16, maxAnisotropy);
        mat.map.minFilter = THREE.LinearMipmapLinearFilter;
        mat.map.magFilter = THREE.LinearFilter;
      }

      if (mat.userData.__winterPatched) return mat;
      mat.userData.__winterPatched = true;

      const hasTexture = Boolean(mat.map);

      mat.onBeforeCompile = shader => {
        shader.uniforms.uNightFactor = winterUniforms.uNightFactor;
        shader.uniforms.uSnowCover = winterUniforms.uSnowCover;
        shader.uniforms.uWindowGlow = winterUniforms.uWindowGlow;
        shader.uniforms.uWhiteModel = winterUniforms.uWhiteModel;
        shader.uniforms.uSnowColor = winterUniforms.uSnowColor;
        shader.uniforms.uTintColor = winterUniforms.uTintColor;
        shader.uniforms.uHasTex = { value: hasTexture ? 1.0 : 0.0 };

        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
            varying vec3 vWinterWorldPos;
            varying vec3 vWinterWorldNormal;`
          )
          .replace(
            '#include <worldpos_vertex>',
            `#include <worldpos_vertex>
            vec4 winterWP = modelMatrix * vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
              winterWP = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
            #endif
            vWinterWorldPos = winterWP.xyz;
            vWinterWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
            uniform float uNightFactor;
            uniform float uSnowCover;
            uniform float uWindowGlow;
            uniform float uWhiteModel;
            uniform float uHasTex;
            uniform vec3 uSnowColor;
            uniform vec3 uTintColor;
            varying vec3 vWinterWorldPos;
            varying vec3 vWinterWorldNormal;

            float wHash(vec2 p) {
              return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }
            float wNoise(vec2 p) {
              vec2 i = floor(p);
              vec2 f = fract(p);
              f = f * f * (3.0 - 2.0 * f);
              return mix(
                mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x),
                mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x),
                f.y
              );
            }`
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            vec3 wNorm = normalize(cross(dFdx(vWinterWorldPos), dFdy(vWinterWorldPos)));
            if (dot(wNorm, vWinterWorldNormal) < 0.0) wNorm = -wNorm;
            float roofMask = smoothstep(0.68, 0.88, wNorm.y);
            float isWallF = 1.0 - smoothstep(0.20, 0.48, abs(wNorm.y));
            float wGlassFactor = 0.0;

            // Ground-level ambient occlusion & subtle vertical facade depth gradient
            float groundAO = mix(0.66, 1.0, smoothstep(-1.0, 9.5, vWinterWorldPos.y));
            // Directional micro-contrast between East/West and North/South faces for crisp architectural volume
            float dirShade = 0.90 + 0.10 * abs(wNorm.x);

            float horizF = abs(wNorm.x) > abs(wNorm.z) ? vWinterWorldPos.z : vWinterWorldPos.x;
            float bldgSeed = wHash(floor(vWinterWorldPos.xz / 22.0));
            vec2 bayUV = fract(vec2(horizF / 2.8, vWinterWorldPos.y / 3.6));
            float procWinMask = step(0.16, bayUV.x) * step(bayUV.x, 0.84) * step(0.22, bayUV.y) * step(bayUV.y, 0.80) * step(2.4, vWinterWorldPos.y);
            float floorLedge = 1.0 - step(0.12, bayUV.y);

            vec3 whiteArch = mix(vec3(0.76, 0.81, 0.88), vec3(0.86, 0.90, 0.95), roofMask);

            if (uHasTex < 0.5) {
              // Untextured LOD1 buildings: synthesize realistic Japanese urban concrete, stone & glass facades!
              vec3 wallPal;
              if (bldgSeed < 0.25) wallPal = vec3(0.56, 0.54, 0.51);       // Warm Hokkaido stone/tile
              else if (bldgSeed < 0.52) wallPal = vec3(0.46, 0.49, 0.54);  // Modern cool concrete
              else if (bldgSeed < 0.78) wallPal = vec3(0.32, 0.39, 0.48);  // Glass curtain wall tower
              else wallPal = vec3(0.58, 0.49, 0.44);                       // Terracotta / warm office

              // Subtle concrete/tile micro-grain
              float micro = (wNoise(vec2(horizF * 0.9, vWinterWorldPos.y * 0.9)) - 0.5) * 0.08;
              vec3 wallCol = wallPal + micro;
              // Recessed concrete floor slab lines & dark reflective window panes
              wallCol *= mix(1.0, 0.76, floorLedge * isWallF);
              vec3 glassTint = mix(vec3(0.08, 0.14, 0.24), vec3(0.14, 0.24, 0.38), 1.0 - clamp(uNightFactor, 0.0, 1.0));
              wallCol = mix(wallCol, glassTint, procWinMask * isWallF * 0.86);

              // Rooftop mechanical/concrete tone before snow layer
              vec3 roofCol = vec3(0.34, 0.37, 0.42);
              vec3 synth = mix(wallCol, roofCol, roofMask);

              // Day vs twilight/night luminance balance
              float nightScale = mix(1.02, 0.56, clamp(uNightFactor * 0.82, 0.0, 1.0));
              diffuseColor.rgb = mix(synth * nightScale * groundAO * dirShade, whiteArch * groundAO, uWhiteModel);
              wGlassFactor = procWinMask * isWallF * (1.0 - uWhiteModel);
            } else {
              // Textured LOD2 buildings: enhance daytime clarity & detect real glass panes for glossy reflections!
              vec3 rawTex = diffuseColor.rgb;
              float luma = dot(rawTex, vec3(0.299, 0.587, 0.114));

              // De-haze and slightly enrich aerial photogrammetry textures so brick/concrete/glass pop realistically
              vec3 crispTex = mix(vec3(luma), rawTex, 1.18);
              crispTex = clamp((crispTex - 0.04) * 1.12, 0.0, 1.0);

              // Identify glass windows in real LOD2 textures (darker or cool-tinted wall regions)
              float darkCool = smoothstep(0.42, 0.14, luma) * (0.65 + 0.35 * step(rawTex.r, rawTex.b + 0.04));
              wGlassFactor = clamp((darkCool * 0.75 + procWinMask * 0.28) * isWallF, 0.0, 1.0) * (1.0 - uWhiteModel);

              // Smoothly adapt real daytime texture across Bright Day -> Morning -> Twilight -> Deep Night
              float nightMix = clamp(uNightFactor * 0.85, 0.0, 1.0);
              float dayDim = mix(1.04, 0.36, nightMix);
              vec3 nightTint = mix(vec3(1.0), uTintColor * 1.48, clamp(uNightFactor * 0.55, 0.0, 0.62));
              vec3 realLook = crispTex * dayDim * nightTint * groundAO * dirShade;
              diffuseColor.rgb = mix(realLook, whiteArch * groundAO, uWhiteModel);
            }

            // Natural wind-drifted winter snow accumulation on roofs & horizontal ledges
            float drift = wNoise(vWinterWorldPos.xz * 0.14) * 0.65 + wNoise(vWinterWorldPos.xz * 0.55) * 0.35;
            float snowAmt = clamp(roofMask * uSnowCover * smoothstep(0.18, 0.72, drift + 0.38), 0.0, 1.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor * (0.94 + 0.08 * drift), snowAmt);`
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
            // Glossy reflective glass windows vs matte concrete/brick walls & crisp snow rooftops
            roughnessFactor = mix(roughnessFactor, 0.16, wGlassFactor * 0.88);
            roughnessFactor = mix(roughnessFactor, 0.82, snowAmt * 0.85);`
          )
          .replace(
            '#include <metalnessmap_fragment>',
            `#include <metalnessmap_fragment>
            metalnessFactor = mix(metalnessFactor, 0.42, wGlassFactor * 0.85);
            metalnessFactor = mix(metalnessFactor, 0.02, snowAmt);`
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            {
              // Only illuminate office/shop windows in twilight & night (uNightFactor > 0.08)
              float nightVis = smoothstep(0.06, 0.42, uNightFactor);
              if (nightVis > 0.005) {
                vec3 wN = normalize(cross(dFdx(vWinterWorldPos), dFdy(vWinterWorldPos)));
                if (dot(wN, vWinterWorldNormal) < 0.0) wN = -wN;
                float isWall = 1.0 - smoothstep(0.20, 0.48, abs(wN.y));
                float horiz = abs(wN.x) > abs(wN.z) ? vWinterWorldPos.z : vWinterWorldPos.x;
                float bldgId = floor(vWinterWorldPos.x / 24.0) * 19.0 + floor(vWinterWorldPos.z / 24.0) * 37.0;

                float col = horiz / 2.8;
                float row = vWinterWorldPos.y / 3.6;
                vec2 cell = floor(vec2(col, row));
                vec2 f = fract(vec2(col, row));

                float winBox = step(0.18, f.x) * step(f.x, 0.82) * step(0.24, f.y) * step(f.y, 0.78);
                float aboveGround = step(2.6, vWinterWorldPos.y);

                float floorRand = wHash(vec2(cell.y, bldgId));
                float cellRand = wHash(cell + vec2(bldgId * 0.13, bldgId * 0.29));
                float isGroundShop = step(vWinterWorldPos.y, 6.2) * step(1.2, vWinterWorldPos.y);
                float litProb = mix(0.26 + 0.36 * floorRand, 0.68, isGroundShop);
                float isLit = step(1.0 - litProb, cellRand);

                // Subtle curtain/interior gradient inside each lit window
                float roomGrad = mix(0.55, 1.05, f.y);

                float temp = wHash(cell * 1.7 + vec2(4.2, 9.1));
                vec3 warmCol = vec3(1.0, 0.76, 0.42);
                vec3 coolCol = vec3(0.76, 0.88, 1.0);
                vec3 winCol = temp < 0.62 ? warmCol : coolCol;
                if (isGroundShop > 0.5) winCol = vec3(1.0, 0.82, 0.50);

                float susukinoMask = smoothstep(280.0, 440.0, vWinterWorldPos.z) * smoothstep(380.0, 120.0, abs(vWinterWorldPos.x - 160.0));
                if (susukinoMask > 0.2 && temp > 0.82 && vWinterWorldPos.y < 32.0) {
                  winCol = mix(winCol, vec3(1.0, 0.32, 0.72), susukinoMask * 0.75);
                }

                float glowIntensity = isWall * winBox * aboveGround * isLit * uWindowGlow * nightVis * clamp(uNightFactor, 0.0, 1.25);
                float texBalance = mix(0.95, 0.68, uHasTex * (1.0 - uWhiteModel));
                totalEmissiveRadiance += winCol * glowIntensity * texBalance * roomGrad * (0.65 + 0.45 * cellRand);
              }
            }`
          );
      };

      mat.customProgramCacheKey = () => `plateau-winter-v2-${hasTexture ? 'tex' : 'notex'}`;
      mat.needsUpdate = true;
      return mat;
    });

    obj.material = Array.isArray(obj.material) ? patched : patched[0];
  });
}
