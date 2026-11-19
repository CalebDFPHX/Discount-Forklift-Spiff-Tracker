import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('client keeps repository imports type-only and production HTML references emitted assets', async () => {
  for (const relativePath of [
    'src/App.tsx',
    'src/components/AdminRequestDetailModal.tsx',
  ]) {
    const filePath = path.join(root, relativePath);
    const source = fs.readFileSync(filePath, 'utf8');
    const repositoryImports =
      source.match(/\bimport\s+[^;]*?\s+from\s+['"][^'"]*repository[^'"]*['"]/g) || [];
    assert.ok(repositoryImports.length > 0);
    assert.ok(
      repositoryImports.every((statement) => /^import\s+type\b/.test(statement)),
      `${relativePath} must not import repository runtime values`
    );
  }

  const result = await build({
    configFile: path.join(root, 'vite.config.ts'),
    root,
    logLevel: 'silent',
    build: {
      write: false,
      emptyOutDir: false,
    },
  });
  if (!('output' in result)) throw new Error('Expected a non-watch Vite build result.');
  const outputs = result.output;
  const htmlAsset = outputs.find(
    (output) => output.type === 'asset' && output.fileName === 'index.html'
  );
  assert.ok(htmlAsset && htmlAsset.type === 'asset');

  const html =
    typeof htmlAsset.source === 'string'
      ? htmlAsset.source
      : new TextDecoder().decode(htmlAsset.source);
  const referencedAssets = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+)"/g)].map(
    (match) => match[1]
  );
  assert.ok(referencedAssets.length > 0, 'expected index.html to reference built assets');
  for (const asset of referencedAssets) {
    assert.ok(
      outputs.some((output) => output.fileName === asset),
      `index.html references missing build output ${asset}`
    );
  }

});
