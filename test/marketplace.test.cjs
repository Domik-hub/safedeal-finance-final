const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createApp } = require('../app-server.cjs');
let app, token, jobId, proposalId, dealId, changeId, original;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safedeal-market-test-'));
const getState = async () => (await fetch(`${app.url}/api/state`)).json();
async function post(route, role, body = {}, expected = 200, profileId = 'alex') {
  const res = await fetch(app.url + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SafeDeal-Token': token }, body: JSON.stringify({ ...body, role, profileId }) });
  const data = await res.json(); assert.equal(res.status, expected, data.error); return data;
}
before(async () => { app = await createApp({ dataDir, port: 0 }); token = (await getState()).token; await post('/api/deploy', 'admin'); });
after(async () => { await app?.close(); });

test('project publication validates role, complete scope, amount and date', async () => {
  const body = { title: 'Build a fictional studio page', description: 'Deliver one responsive page.', category: 'Web development', budget: 180000, dueDate: '2030-12-01', skills: ['JavaScript'], criteria: ['Responsive at 390 px', 'Source files included'] };
  await post('/api/market/jobs', 'freelancer', body, 403);
  await post('/api/market/jobs', 'client', { ...body, criteria: [] }, 400);
  await post('/api/market/jobs', 'client', { ...body, budget: -1 }, 400);
  await post('/api/market/jobs', 'client', { ...body, dueDate: '2030-02-31' }, 400);
  const result = await post('/api/market/jobs', 'client', body); jobId = result.selectedJobId;
  assert.equal(result.marketplace.jobs.find(j => j.id === jobId).status, 'Open');
});
test('proposals require the freelancer own portfolio and explicit acceptance of the brief', async () => {
  const body = { amount: 170000, dueDate: '2030-12-01', message: 'I will deliver a responsive build and a source handover.', portfolioIds: ['alex-1'], acceptScope: true };
  const route = `/api/market/jobs/${jobId}/apply`;
  await post(route, 'client', body, 403);
  await post(route, 'freelancer', { ...body, acceptScope: false }, 400);
  await post(route, 'freelancer', { ...body, portfolioIds: ['mira-1'] }, 400);
  const result = await post(route, 'freelancer', body);
  proposalId = result.marketplace.proposals.find(p => p.jobId === jobId).id;
  await post(route, 'freelancer', body, 409);
  assert.equal(result.marketplace.proposals.find(p => p.id === proposalId).acceptedCriteria.length, 2);
});
test('hiring creates one real local milestone for the selected freelancer and freezes agreed terms', async () => {
  const route = `/api/market/jobs/${jobId}/hire`;
  await post(route, 'freelancer', { proposalId }, 403);
  const result = await post(route, 'client', { proposalId }); dealId = result.selectedId;
  original = result.deals.find(d => d.id === dealId);
  assert.equal(original.amount, 170000); assert.equal(original.freelancerId, 'alex');
  assert.notEqual(original.freelancer, result.addresses.freelancer);
  assert.equal(original.criteria.length, 2); assert.ok(original.termsHash.startsWith('0x'));
  await post(route, 'client', { proposalId }, 409);
  assert.equal((await getState()).deals.length, 1);
});
test('extra work must be requested, quoted by the hired freelancer and approved by the client', async () => {
  const body = { title: 'Add a catalog', description: 'The original agreement does not include a catalog.', criteria: ['Three product cards'] };
  const result = await post(`/api/market/jobs/${jobId}/changes`, 'client', body);
  changeId = result.marketplace.changes[0].id;
  await post(`/api/market/changes/${changeId}/accept`, 'client', {}, 409);
  const quote = { amount: 30000, dueDate: '2030-12-05', message: 'A separate product section with three cards.' };
  await post(`/api/market/changes/${changeId}/quote`, 'client', quote, 403);
  await post(`/api/market/changes/${changeId}/quote`, 'freelancer', quote, 403, 'mira');
  await post(`/api/market/changes/${changeId}/quote`, 'freelancer', quote);
  await post(`/api/market/changes/${changeId}/accept`, 'freelancer', {}, 403);
  assert.equal((await getState()).deals.length, 1);
  const accepted = await post(`/api/market/changes/${changeId}/accept`, 'client');
  const extra = accepted.deals.find(d => d.id === accepted.selectedId);
  assert.equal(extra.amount, 30000); assert.equal(extra.changeId, changeId); assert.equal(extra.state, 'Created');
  assert.deepEqual(accepted.deals.find(d => d.id === dealId), original);
  assert.equal(accepted.marketplace.jobs.find(j => j.id === jobId).agreedAmount, 170000);
  await post(`/api/market/changes/${changeId}/accept`, 'client', {}, 409);
});
test('declining additional work creates no milestone and leaves the original scope untouched', async () => {
  const result = await post(`/api/market/jobs/${jobId}/changes`, 'client', { title: 'An optional extra', description: 'An extra screen.', criteria: ['One screen'] });
  const id = result.marketplace.changes.at(-1).id;
  await post(`/api/market/changes/${id}/decline`, 'freelancer');
  await post(`/api/market/changes/${id}/quote`, 'freelancer', { amount: 10000, dueDate: '2030-12-01', message: 'A quote' }, 409);
  assert.equal((await getState()).deals.length, 2);
});
test('delivery needs evidence for every check and the client must confirm all checks before approval', async () => {
  await post(`/api/deals/${dealId}/reserve`, 'adapter', { reference: 'MARKET-RES-1' });
  const proof = original.criteria.map(c => ({ id: c.id, note: `Included in studio.txt: ${c.text}.` }));
  const body = { message: 'The fictional page and source files are ready.', criteriaEvidence: proof, file: { name: 'studio.txt', base64: Buffer.from('Fictional source delivery').toString('base64') } };
  await post(`/api/deals/${dealId}/submit`, 'freelancer', body, 403, 'mira');
  await post(`/api/deals/${dealId}/submit`, 'freelancer', { ...body, criteriaEvidence: [] }, 400);
  await post(`/api/deals/${dealId}/submit`, 'freelancer', { ...body, criteriaEvidence: [proof[0], proof[0]] }, 400);
  await post(`/api/deals/${dealId}/submit`, 'freelancer', body);
  await post(`/api/deals/${dealId}/approve`, 'client', {}, 400);
  await post(`/api/deals/${dealId}/approve`, 'client', { checkedCriteriaIds: [proof[0].id] }, 400);
  await post(`/api/deals/${dealId}/approve`, 'client', { checkedCriteriaIds: proof.map(c => c.id) });
  await post(`/api/deals/${dealId}/settle`, 'adapter', { reference: 'MARKET-SET-1' });
  const state = await getState(), d = state.deals.find(d => d.id === dealId);
  assert.equal(d.released, 170000); assert.equal(d.state, 'Settled'); assert.equal(d.acceptanceReview.checkedCriteriaIds.length, 2);
  assert.equal(state.deals.filter(d => d.freelancerId === 'alex' && d.state === 'Settled').length, 1);
});
test('portfolio edits persist and unsafe project links are rejected', async () => {
  const body = { title: 'A fictional handover', description: 'A clear file and explanation of the work.', category: 'Web development', theme: 'blue' };
  await post('/api/market/portfolio', 'client', body, 403);
  await post('/api/market/portfolio', 'freelancer', { ...body, url: 'javascript:alert(1)' }, 400);
  const result = await post('/api/market/portfolio', 'freelancer', body);
  assert.equal(result.marketplace.profiles.find(p => p.id === 'alex').portfolio[0].title, body.title);
  assert.equal(result.marketplace.profiles.find(p => p.id === 'alex').portfolio[0].sample, false);
});
test('downloaded agreement separates original scope and additional milestones without exposing workspace tokens', async () => {
  const res = await fetch(`${app.url}/api/market/jobs/${jobId}/agreement`);
  assert.equal(res.status, 200); assert.ok(res.headers.get('content-disposition').includes('attachment'));
  const value = await res.json(); assert.equal(value.agreement.amount, 170000); assert.equal(value.milestones.length, 2);
  assert.equal(value.milestones[1].amount, 30000); assert.equal(value.token, undefined); assert.equal(value.educational, true);
});
test('projects, proposals, portfolio, scope agreements and change history survive a real server restart', async () => {
  const old = await getState(); await app.close(); app = await createApp({ dataDir, port: 0 }); token = (await getState()).token;
  const restored = await getState(); assert.deepEqual(restored.marketplace, old.marketplace); assert.deepEqual(restored.deals, old.deals);
});
