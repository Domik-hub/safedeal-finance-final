const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../app-server.cjs');
let app, token, dealId;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safedeal-app-test-'));
async function state() { return (await fetch(`${app.url}/api/state`)).json(); }
async function post(route, role, body = {}, status = 200) {
  const res = await fetch(`${app.url}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SafeDeal-Token': token }, body: JSON.stringify({ ...body, role }) });
  const data = await res.json(); assert.equal(res.status, status, data.error); return data;
}
before(async () => { app = await createApp({ dataDir, port: 0 }); token = (await state()).token; });
after(async () => { await app.close(); });

test('HTTP boundary rejects cross-origin, missing-token and wrong-role requests', async () => {
  const noToken = await fetch(`${app.url}/api/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'admin' }) });
  assert.equal(noToken.status, 403);
  const origin = await fetch(`${app.url}/api/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SafeDeal-Token': token, Origin: 'https://untrusted.example' }, body: JSON.stringify({ role: 'admin' }) });
  assert.equal(origin.status, 403);
  await post('/api/deploy', 'client', {}, 403);
  await post('/api/deploy', 'admin');
  assert.equal((await state()).network.deployed, true);
});
test('HTTP forms reject invalid amounts and invalid calendar dates before creating a milestone', async () => {
  const body = { title: 'Test milestone', description: 'A test delivery.', dueDate: '2026-11-30', amount: 120000 };
  await post('/api/deals', 'client', { ...body, amount: -1 }, 400);
  await post('/api/deals', 'client', { ...body, dueDate: '2026-02-31' }, 400);
  assert.equal((await state()).deals.length, 0);
  const result = await post('/api/deals', 'client', body); dealId = result.selectedId;
});
test('a saved delivery and attachment follow the complete client and freelancer workflow', async () => {
  await post(`/api/deals/${dealId}/reserve`, 'client', { reference: 'RES-TEST-1' }, 403);
  await post(`/api/deals/${dealId}/reserve`, 'adapter', { reference: 'RES-TEST-1' });
  await post(`/api/deals/${dealId}/submit`, 'freelancer', { message: 'Complete fictional deliverable.', file: { name: 'delivery.txt', base64: Buffer.from('SafeDeal test file').toString('base64') } });
  const download = await fetch(`${app.url}/api/deals/${dealId}/attachment`);
  assert.equal(await download.text(), 'SafeDeal test file');
  assert.ok(download.headers.get('content-disposition').includes('attachment'));
  await post(`/api/deals/${dealId}/approve`, 'client');
  assert.equal((await state()).deals[0].released, 0);
  await post(`/api/deals/${dealId}/settle`, 'adapter', { reference: 'SET-TEST-1' });
  const d = (await state()).deals[0];
  assert.equal(d.released, 120000); assert.equal(d.refunded, 0); assert.equal(d.state, 'Settled');
  await post(`/api/deals/${dealId}/settle`, 'adapter', { reference: 'SET-TEST-2' }, 400);
});
test('the dispute endpoint records reasons, arbiter split and a conserved final settlement', async () => {
  const result = await post('/api/deals', 'client', { title: 'Disputed project', description: 'Three deliverables.', dueDate: '2026-12-01', amount: 120000 });
  const id = result.selectedId;
  await post(`/api/deals/${id}/reserve`, 'adapter', { reference: 'RES-TEST-1' }, 400);
  await post(`/api/deals/${id}/reserve`, 'adapter', { reference: 'RES-TEST-2' });
  await post(`/api/deals/${id}/submit`, 'freelancer', { message: 'Partial delivery.' });
  await post(`/api/deals/${id}/dispute`, 'client', { reason: 'One deliverable was missing.' });
  await post(`/api/deals/${id}/resolve`, 'admin', { releasePercent: 60, reason: 'Test' }, 403);
  await post(`/api/deals/${id}/resolve`, 'arbiter', { releasePercent: 101, reason: 'Test' }, 400);
  await post(`/api/deals/${id}/resolve`, 'arbiter', { releasePercent: 60, reason: 'Evidence supports 60 percent of the scope.' });
  await post(`/api/deals/${id}/settle`, 'adapter', { reference: 'SET-TEST-3' });
  const d = (await state()).deals.find(d => d.id === id);
  assert.equal(d.released, 72000); assert.equal(d.refunded, 48000); assert.equal(d.released + d.refunded, d.amount);
  assert.equal(d.resolution.releasePercent, 60); assert.ok(d.dispute.reason);
});
test('pause and resume are enforced on the API and the contract', async () => {
  await post('/api/pause', 'client', { paused: true }, 403);
  await post('/api/pause', 'admin', { paused: true });
  await post('/api/deals', 'client', { title: 'Blocked', description: 'Blocked while paused.', dueDate: '2026-12-01', amount: 1 }, 400);
  await post('/api/pause', 'admin', { paused: false });
});
test('contract state, off-chain descriptions and attachments survive a server restart', async () => {
  const previous = await state();
  await app.close(); app = await createApp({ dataDir, port: 0 }); token = (await state()).token;
  const restored = await state();
  assert.equal(restored.network.address, previous.network.address);
  assert.deepEqual(restored.deals, previous.deals);
  assert.deepEqual(restored.activity, previous.activity);
  const download = await fetch(`${app.url}/api/deals/${dealId}/attachment`);
  assert.equal(await download.text(), 'SafeDeal test file');
});
