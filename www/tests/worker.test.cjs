const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

// These filenames were verified against the published v0.0.18 release.
const releaseTag = 'v0.0.18';
const releaseBase = `https://github.com/yuler/ear/releases/download/${releaseTag}`;
const filenames = {
  mac: 'Ear-0.0.18-macos-aarch64.zip',
  windows: 'Ear-0.0.18-windows-x86_64.zip',
  linux: 'Ear-0.0.18-linux-x86_64.tar.gz',
};
const source = fs.readFileSync(path.join(__dirname, '../worker.js'), 'utf8');
let instance = 0;
async function worker() {
  // A distinct module instance gives each case a fresh in-memory release cache.
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${instance++}`)).default;
}
const failures = {
  network: async () => { throw new Error('Network unavailable'); },
  'HTTP 503': async () => new Response('Unavailable', { status: 503 }),
  'invalid JSON': async () => new Response('not JSON'),
};

for (const [failure, fetch] of Object.entries(failures)) {
  for (const platform of Object.keys(filenames)) {
    test(`${platform} download falls back to an existing release asset on ${failure}`, async (t) => {
      t.mock.method(globalThis, 'fetch', fetch);
      t.mock.method(console, 'error', () => {});
      const app = await worker();
      const res = await app.fetch(new Request(`https://ear.example/download/${platform}`), {}, {});
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('Location'), `${releaseBase}/${filenames[platform]}`);
    });
  }
}

test('API fallback metadata and all platform links agree on tag and version', async (t) => {
  t.mock.method(globalThis, 'fetch', failures.network);
  t.mock.method(console, 'error', () => {});
  const app = await worker();
  const res = await app.fetch(new Request('https://ear.example/api/latest'), {}, {});
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.tag, releaseTag);
  assert.equal(payload.version, '0.0.18');
  for (const [platform, filename] of Object.entries(filenames)) {
    assert.equal(payload.assets[platform], `${releaseBase}/${filename}`);
  }
});

test('smart download routing uses verified fallback assets for each desktop UA', async (t) => {
  t.mock.method(globalThis, 'fetch', failures.network);
  t.mock.method(console, 'error', () => {});
  const app = await worker();
  for (const [platform, ua] of Object.entries({ mac: 'Macintosh', windows: 'Windows', linux: 'Linux' })) {
    const request = new Request('https://ear.example/download', { headers: { 'user-agent': ua } });
    const res = await app.fetch(request, {}, {});
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('Location'), `${releaseBase}/${filenames[platform]}`);
  }
});

test('a successful API response after failure uses current assets, not the pinned fallback', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    if (++calls === 1) throw new Error('Transient failure');
    return Response.json({
      tag_name: 'v9.9.9',
      assets: [{ name: 'Ear-9.9.9-linux-x86_64.tar.gz', browser_download_url: 'https://example.com/current-linux.tar.gz' }],
    });
  });
  t.mock.method(console, 'error', () => {});
  const app = await worker();
  const request = new Request('https://ear.example/download/linux');
  const fallback = await app.fetch(request, {}, {});
  assert.equal(fallback.headers.get('Location'), `${releaseBase}/${filenames.linux}`);
  const recovered = await app.fetch(request, {}, {});
  assert.equal(recovered.headers.get('Location'), 'https://example.com/current-linux.tar.gz');
  assert.equal(calls, 2);
});
