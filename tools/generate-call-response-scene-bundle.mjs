import { readFile, writeFile } from 'node:fs/promises';

const files = {
  scene: new URL('../assets/msts-neiyi-corridor/neiyi-lookout-full-scene.json', import.meta.url),
  path: new URL('../assets/msts-neiyi/neiyi-5635-trackdb-path.json', import.meta.url),
  terrain: new URL('../assets/msts-neiyi-corridor/neiyi-lookout-terrain-native.json', import.meta.url),
  prefab: new URL('../assets/msts-neiyi-corridor/lookout-source-prefabs.json', import.meta.url),
  repairAsset: new URL('../assets/msts-neiyi-corridor/lookout-repair-assets.json', import.meta.url),
};
const output = new URL('../assets/msts-neiyi-corridor/call-response-scene-bundle.json', import.meta.url);
const bundle = { version: 1 };
for (const [key, url] of Object.entries(files)) {
  bundle[key] = JSON.parse(await readFile(url, 'utf8'));
}
await writeFile(output, JSON.stringify(bundle));
console.log(`generated ${output.pathname}: ${JSON.stringify(bundle).length} bytes`);
