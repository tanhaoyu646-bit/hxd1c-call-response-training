import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async (relative) => JSON.parse(await readFile(new URL(relative, import.meta.url), 'utf8'));
const bundle = await readJson('../assets/msts-neiyi-corridor/call-response-scene-bundle.json');
const sources = {
  scene: await readJson('../assets/msts-neiyi-corridor/neiyi-lookout-full-scene.json'),
  path: await readJson('../assets/msts-neiyi/neiyi-5635-trackdb-path.json'),
  terrain: await readJson('../assets/msts-neiyi-corridor/neiyi-lookout-terrain-native.json'),
  prefab: await readJson('../assets/msts-neiyi-corridor/lookout-source-prefabs.json'),
  repairAsset: await readJson('../assets/msts-neiyi-corridor/lookout-repair-assets.json'),
};

assert.equal(bundle.version, 1);
for (const key of Object.keys(sources)) {
  assert.deepEqual(bundle[key], sources[key], `呼唤应答合并资源中的 ${key} 已与源文件不一致`);
}
console.log('call-response scene bundle matches all 5 source JSON files');
