import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname);
const distDir = path.join(root, 'dist');
fs.mkdirSync(distDir, { recursive: true });

async function buildPage(entryRel, templateRel, outName) {
  const result = await esbuild.build({
    entryPoints: [path.join(root, entryRel)],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2022'],
    write: false,
  });

  const js = result.outputFiles[0].text.replace(/<\/script>/gi, '<\\/script>');
  const tpl = fs.readFileSync(path.join(root, templateRel), 'utf8');
  const html = tpl.replace('<!--__BUNDLE__-->', () => `<script>${js}</script>`);

  fs.writeFileSync(path.join(distDir, outName), html, 'utf8');
  console.log(`Built dist/${outName}:`, (html.length / 1024).toFixed(1), 'KB');
}

// Serve Tailwind from dist/ (no third-party CDN / SRI gap)
const tailwindSrc = path.join(root, 'vendor/tailwindcss.min.js');
if (fs.existsSync(tailwindSrc)) {
  fs.copyFileSync(tailwindSrc, path.join(distDir, 'tailwindcss.min.js'));
}

// Copy Draco glTF decoder assets locally so PLATEAU 3D Tiles decode reliably without external CDN
const dracoSrc = path.join(root, 'node_modules/three/examples/jsm/libs/draco/gltf');
const dracoDst = path.join(distDir, 'draco');
fs.mkdirSync(dracoDst, { recursive: true });
for (const file of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) {
  const srcFile = path.join(dracoSrc, file);
  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, path.join(dracoDst, file));
  }
}

await buildPage('src/main.js', 'template.html', 'index.html');
if (fs.existsSync(path.join(root, 'src/plateau/main.js'))) {
  await buildPage('src/plateau/main.js', 'template-plateau.html', 'plateau.html');
}
