const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { compile, localChain, deploy, send, createMilestone, submitted, hash } = require('../lib.cjs');
let chain, artifact, f;
before(async () => { artifact = compile(); chain = await localChain(); });
beforeEach(async () => { f = await deploy(chain, artifact); });
after(async () => { if (chain) await chain.close(); });

test('normal flow releases the full fictional milestone only after adapter confirmation', async () => {
  const n = await submitted(f);
  await send(f.contract.connect(f.client).approve(n));
  assert.equal((await f.contract.milestones(n)).released, 0n);
  await send(f.contract.connect(f.adapter).confirmSettlement(n, hash('settlement')));
  const m = await f.contract.milestones(n);
  assert.equal(m.state, 6n); assert.equal(m.released, 120000n); assert.equal(m.refunded, 0n);
});
test('an outsider cannot confirm a reservation', async () => {
  const n = await createMilestone(f);
  await assert.rejects(f.contract.connect(f.outsider).reserve(n, hash('r')));
});
test('an unreserved milestone cannot be submitted or approved', async () => {
  const n = await createMilestone(f);
  await assert.rejects(f.contract.connect(f.freelancer).submit(n, hash('e')));
  await assert.rejects(f.contract.connect(f.client).approve(n));
});
test('only the agreed freelancer may submit evidence', async () => {
  const n = await createMilestone(f);
  await send(f.contract.connect(f.adapter).reserve(n, hash('r')));
  await assert.rejects(f.contract.connect(f.outsider).submit(n, hash('e')));
});
test('only the client may approve submitted work', async () => {
  const n = await submitted(f);
  await assert.rejects(f.contract.connect(f.freelancer).approve(n));
  await assert.rejects(f.contract.connect(f.admin).approve(n));
});
test('a disputed milestone cannot settle before an arbiter decision', async () => {
  const n = await submitted(f);
  await send(f.contract.connect(f.client).dispute(n));
  await assert.rejects(f.contract.connect(f.adapter).confirmSettlement(n, hash('s')));
});
test('only the arbiter may decide a dispute', async () => {
  const n = await submitted(f);
  await send(f.contract.connect(f.client).dispute(n));
  await assert.rejects(f.contract.connect(f.admin).resolve(n, 5000));
});
test('a split decision conserves the complete fictional amount', async () => {
  const n = await submitted(f);
  await send(f.contract.connect(f.freelancer).dispute(n));
  await send(f.contract.connect(f.arbiter).resolve(n, 6000));
  await send(f.contract.connect(f.adapter).confirmSettlement(n, hash('split')));
  const m = await f.contract.milestones(n);
  assert.equal(m.released, 72000n); assert.equal(m.refunded, 48000n);
  assert.equal(m.released + m.refunded, m.amount);
});
test('a full refund releases zero to the freelancer', async () => {
  const n = await submitted(f);
  await send(f.contract.connect(f.client).dispute(n));
  await send(f.contract.connect(f.arbiter).resolve(n, 0));
  await send(f.contract.connect(f.adapter).confirmSettlement(n, hash('refund')));
  const m = await f.contract.milestones(n);
  assert.equal(m.released, 0n); assert.equal(m.refunded, 120000n);
});
test('duplicate confirmation cannot release the amount twice', async () => {
  const n = await submitted(f);
  await send(f.contract.connect(f.client).approve(n));
  await send(f.contract.connect(f.adapter).confirmSettlement(n, hash('s')));
  await assert.rejects(f.contract.connect(f.adapter).confirmSettlement(n, hash('another')));
  assert.equal((await f.contract.milestones(n)).released, 120000n);
});
test('a settlement reference cannot be replayed on another milestone', async () => {
  for (const suffix of ['a', 'b']) {
    const n = await submitted(f, suffix);
    await send(f.contract.connect(f.client).approve(n));
    if (suffix === 'a') await send(f.contract.connect(f.adapter).confirmSettlement(n, hash('shared')));
    else await assert.rejects(f.contract.connect(f.adapter).confirmSettlement(n, hash('shared')));
  }
});
test('missing adapter confirmation leaves an approved milestone unsettled', async () => {
  const n = await submitted(f);
  await send(f.contract.connect(f.client).approve(n));
  const m = await f.contract.milestones(n);
  assert.equal(m.state, 5n); assert.equal(m.released, 0n); assert.equal(m.refunded, 0n);
});
test('pause blocks actions and only the admin can change pause status', async () => {
  await assert.rejects(f.contract.connect(f.outsider).setPaused(true));
  await send(f.contract.connect(f.admin).setPaused(true));
  await assert.rejects(f.contract.connect(f.client).create(await f.freelancer.getAddress(), 120000n, hash('t')));
  await send(f.contract.connect(f.admin).setPaused(false));
  const n = await createMilestone(f); assert.ok(n > 0n);
});
test('invalid amounts, self-contracting and empty evidence are rejected', async () => {
  await assert.rejects(f.contract.connect(f.client).create(await f.client.getAddress(), 120000n, hash('t')));
  await assert.rejects(f.contract.connect(f.client).create(await f.freelancer.getAddress(), 0n, hash('t')));
  const n = await createMilestone(f);
  await send(f.contract.connect(f.adapter).reserve(n, hash('r')));
  await assert.rejects(f.contract.connect(f.freelancer).submit(n, '0x' + '0'.repeat(64)));
});
test('splits above 100 percent are rejected', async () => {
  const n = await submitted(f);
  await send(f.contract.connect(f.client).dispute(n));
  await assert.rejects(f.contract.connect(f.arbiter).resolve(n, 10001));
});
test('the contract rejects native asset transfers', async () => {
  await assert.rejects(f.client.sendTransaction({ to: await f.contract.getAddress(), value: 1n }));
  assert.equal(await f.provider.getBalance(await f.contract.getAddress()), 0n);
});
