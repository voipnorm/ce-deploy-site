import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { CE_DEPLOY_VERSION, CE_DEPLOY_RELEASE_URL } from '../src/config/release.mjs';

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
}

test('current release has one version and a matching tagged download URL', () => {
  assert.match(CE_DEPLOY_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(CE_DEPLOY_RELEASE_URL, `https://github.com/voipnorm/CE-Deploy/releases/tag/v${CE_DEPLOY_VERSION}`);
});

test('site content cannot introduce independent current versions or release URLs', () => {
  for (const file of [...files('src'), ...files('public')]) {
    if (!/\.(astro|html|[cm]?js|ts|json|md)$/.test(file)) continue;
    if (file === 'src/config/release.mjs') continue;
    // Dated editorial posts preserve historical versions, like release notes.
    if (file.startsWith('src/content/blog/') && file.endsWith('.md')) continue;
    let source = readFileSync(file, 'utf8');
    // Only dated release articles are historical; the rest of this page follows the same rule.
    if (file === 'src/pages/whats-new.astro') {
      source = source.replace(/<article class="release"><time\b[\s\S]*?<\/article>/g, '');
    }
    assert.doesNotMatch(source, /\b\d+\.\d+\.\d+\b/, `${file}: import the release constant instead`);
    assert.doesNotMatch(source, /github\.com\/voipnorm\/CE-Deploy\/releases\/(?:latest|tag\/)/, `${file}: use CE_DEPLOY_RELEASE_URL`);
  }
});
