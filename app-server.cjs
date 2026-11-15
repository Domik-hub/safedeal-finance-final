const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { Contract } = require('ethers');
const { compile, localChain, deploy, send, hash } = require('./lib.cjs');
const { createMarketplace } = require('./marketplace.cjs');
const { createReviews } = require('./reviews.cjs');

const STATES = ['Empty', 'Created', 'Reserved', 'Submitted', 'Disputed', 'Approved', 'Settled'];
const ROLES = ['client', 'freelancer', 'adapter', 'arbiter', 'admin', 'expert'];
const ROLE_NAMES = { client: 'Demo Client', freelancer: 'Demo Freelancer', adapter: 'Payment adapter', arbiter: 'Demo Arbiter', admin: 'Workspace Admin', expert: 'Independent expert' };
const ACTION_ROLES = { create: ['client'], reserve: ['adapter'], submit: ['freelancer'], approve: ['client'], dispute: ['client', 'freelancer'], resolve: ['arbiter'], settle: ['adapter'], pause: ['admin'], deploy: ['admin'] };

function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function required(value, label, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${label} is required (maximum ${max} characters).`);
  return value.trim();
}
function amountOf(value) { if (!Number.isSafeInteger(value) || value < 1 || value > 1000000000) fail('Enter a whole KZT amount between 1 and 1,000,000,000.'); return value; }
function cleanError(e) {
  const reason = e.reason || e.info?.error?.data?.reason || e.info?.error?.message;
  if (reason) return String(reason).replace(/^.*revert\s*/i, '');
  return e.code === 'CALL_EXCEPTION' ? 'The contract rejected this action. Refresh the deal and check its status and your role.' : e.message;
}
function runContractTests() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', '--test-concurrency=1', 'test/workflow.test.cjs'], { cwd: __dirname, windowsHide: true });
    let stdout = '';
    child.stdout.on('data', b => stdout += b);
    child.stderr.on('data', () => {});
    child.on('error', reject);
    child.on('close', exitCode => {
      const cases = [...stdout.matchAll(/^(ok|not ok) \d+ - (.+)$/gm)].map(m => ({ passed: m[1] === 'ok', name: m[2] }));
      const passed = Number(stdout.match(/# pass (\d+)/)?.[1] || 0);
      const failed = Number(stdout.match(/# fail (\d+)/)?.[1] || 0);
      resolve({ status: exitCode === 0 && cases.length === 16 ? 'passed' : 'failed', passed, failed, exitCode, cases, finishedAt: new Date().toISOString(), stdout });
    });
  });
}

async function createApp({ dataDir = process.env.SAFEDEAL_DATA_DIR || path.join(__dirname, 'data'), port = Number(process.env.PORT || 4173) } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const metaPath = path.join(dataDir, 'workspace.json');
  let meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : { address: null, deals: {}, log: [], tests: { status: 'idle', cases: [] } };
  if (meta.tests.status === 'running') meta.tests = { status: 'idle', cases: [] };
  const artifact = compile();
  const chain = await localChain({ dbPath: path.join(dataDir, 'chain') });
  const [admin, client, freelancer, arbiter, adapter] = chain.signers;
  let f = { ...chain, admin, client, freelancer, arbiter, adapter, contract: null };
  if (meta.address) {
    if (await chain.provider.getCode(meta.address) === '0x') throw new Error('Saved contract is missing from the local chain. Use a new SAFEDEAL_DATA_DIR.');
    f.contract = new Contract(meta.address, artifact.abi, admin);
  }
  let busy = false;
  let testsPromise;
  const token = crypto.randomBytes(32).toString('hex');
  const save = () => { const temp = `${metaPath}.tmp`; fs.writeFileSync(temp, JSON.stringify(meta, null, 2)); fs.renameSync(temp, metaPath); };
  const log = (title, role, id, receipt, details = '') => {
    meta.log.push({ id: crypto.randomUUID(), dealId: id || null, title, role, details, at: new Date().toISOString(), block: receipt?.blockNumber || null, tx: receipt?.hash || null });
  };
  const addresses = Object.fromEntries(await Promise.all(ROLES.filter(role => role !== 'expert').map(async role => [role, await f[role].getAddress()])));
  const market = createMarketplace({ meta, getFixture: () => f, save, log, send, hash, fail });
  const viewDeal = async id => {
    const m = await f.contract.milestones(id);
    if (!Number(m.state)) return null;
    const extra = meta.deals[id] || { title: `Milestone ${id}`, description: 'Recovered on-chain milestone', dueDate: '', createdAt: '' };
    const { file, ...evidence } = extra.evidence || {};
    return { ...extra, id: Number(id), evidence: extra.evidence ? { ...evidence, file: file ? { name: file.name, size: Buffer.from(file.base64, 'base64').length, sha256: file.sha256 } : null } : null,
      amount: Number(m.amount), state: STATES[Number(m.state)], client: m.client, freelancer: m.freelancer, termsHash: m.termsHash, evidenceHash: m.evidenceHash,
      releaseBps: Number(m.releaseBps), released: Number(m.released), refunded: Number(m.refunded) };
  };
  function validateEvidence(body, extra) {
const message = required(body.message, 'Delivery notes', 3000);
let url = (body.url || '').trim();
if (url) { try { const u = new URL(url); if (!['https:', 'http:'].includes(u.protocol)) fail('Use an HTTP or HTTPS delivery link.'); } catch { fail('Use a valid HTTP or HTTPS delivery link.'); } }
let file = null;
if (body.file) {
  const name = required(body.file.name, 'File name', 120).replace(/[\r\n"\\/]/g, '_');
  if (typeof body.file.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.file.base64)) fail('Invalid attachment.');
  const bytes = Buffer.from(body.file.base64, 'base64');
  if (!bytes.length || bytes.length > 300000) fail('Attach a non-empty file up to 300 KB.');
  file = { name, base64: bytes.toString('base64'), sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
let criteriaEvidence = [];
if (extra.criteria?.length) {
  if (!Array.isArray(body.criteriaEvidence) || body.criteriaEvidence.length !== extra.criteria.length) fail('Explain how the delivery meets every agreed acceptance check.');
  criteriaEvidence = extra.criteria.map(check => {
    const entries = body.criteriaEvidence.filter(e => e.id === check.id);
    if (entries.length !== 1) fail('Include each acceptance check exactly once.');
    return { id: check.id, note: required(entries[0].note, 'Evidence for acceptance check', 600) };
  });
}
const evidence = { message, url, file, criteriaEvidence, submittedAt: new Date().toISOString() };
    return evidence;
  }
  const reviews = createReviews({ meta, save, log, fail, viewDeal, validateEvidence });
  const snapshot = async () => {
    const ids = f.contract ? Array.from({ length: Number(await f.contract.nextId()) - 1 }, (_, i) => i + 1) : [];
    return { token, roles: ROLE_NAMES, addresses, network: { name: 'Ganache local EVM', chainId: 1337, deployed: Boolean(f.contract), address: meta.address, paused: f.contract ? await f.contract.paused() : false,
      block: Number(await chain.provider.send('eth_blockNumber', [])), educational: true }, deals: await Promise.all(ids.map(viewDeal)), marketplace: market.snapshot(), experts: reviews.experts, activity: meta.log, tests: meta.tests };
  };
  async function mutate(action, body, id) {
    if (!ACTION_ROLES[action]?.includes(body.role)) fail('This action is not available to the selected role.', 403);
    if (busy) fail('Another transaction is being confirmed. Please try again.', 409);
    busy = true;
    try {
      if (action === 'deploy') {
        if (f.contract) fail('The workspace contract is already deployed.', 409);
        f = await deploy(chain, artifact);
        meta.address = await f.contract.getAddress();
        log('Workspace contract deployed', body.role, null, await f.contract.deploymentTransaction().wait(), 'Solidity 0.8.30 · local chain 1337');
      } else {
        if (!f.contract) fail('Deploy the workspace contract in Network & tests first.', 409);
        let c = f.contract.connect(f[body.role]);
        if (action === 'create') {
          const title = required(body.title, 'Milestone title', 100);
          const description = required(body.description, 'Scope and acceptance criteria', 3000);
          const dueDate = required(body.dueDate, 'Due date', 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(`${dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== dueDate) fail('Enter a valid due date.');
          const amount = amountOf(body.amount);
          id = Number(await c.nextId());
          const terms = { title, description, dueDate, amount, freelancer: addresses.freelancer };
          const receipt = await send(c.create(addresses.freelancer, amount, hash(JSON.stringify(terms))));
          meta.deals[id] = { title, description, dueDate, createdAt: new Date().toISOString() };
          log('Milestone created', body.role, id, receipt, `${amount.toLocaleString('en-US')} KZT · ${title}`);
        } else if (action === 'pause') {
          if (typeof body.paused !== 'boolean') fail('A pause value is required.');
          const receipt = await send(c.setPaused(body.paused));
          log(body.paused ? 'Workspace paused' : 'Workspace resumed', body.role, null, receipt);
        } else {
          if (!Number.isSafeInteger(id) || id < 1 || !(await viewDeal(id))) fail('Milestone not found.', 404);
          const extra = meta.deals[id] ||= {};
          market.assertFreelancer(body, extra);
          if (body.role === 'freelancer' && extra.freelancerId) c = f.contract.connect(market.signer(extra.freelancerId));
          if (action === 'reserve' || action === 'settle') {
            if (action === 'settle') reviews.assertReport(extra, !extra.resolution);
            const reference = required(body.reference, 'Confirmation reference', 100);
            const receipt = await send(action === 'reserve' ? c.reserve(id, hash(reference)) : c.confirmSettlement(id, hash(reference)));
            extra[action === 'reserve' ? 'reservationReference' : 'settlementReference'] = reference;
            log(action === 'reserve' ? 'Reservation confirmed' : 'Settlement confirmed', body.role, id, receipt, `Simulated provider reference: ${reference}`);
          } else if (action === 'submit') {
            const evidence = validateEvidence(body, extra);
            const { message, url, file, criteriaEvidence } = evidence;
            const receipt = await send(c.submit(id, hash(JSON.stringify({ message, url, fileHash: file?.sha256 || '', criteriaEvidence }))));
            extra.evidence = evidence;
            reviews.recordDelivery(extra, evidence);
            log('Work submitted for review', body.role, id, receipt, file ? `Attachment: ${file.name}` : 'Delivery notes recorded');
          } else if (action === 'approve') {
            reviews.assertReport(extra);
            if (extra.criteria?.length && (!Array.isArray(body.checkedCriteriaIds) || !extra.criteria.every(check => body.checkedCriteriaIds.includes(check.id)))) fail('Review and confirm every agreed acceptance check before approving.');
            const receipt = await send(c.approve(id));
            if (extra.criteria?.length) extra.acceptanceReview = { checkedCriteriaIds: extra.criteria.map(c => c.id), reviewedAt: new Date().toISOString() };
            log('Work approved by client', body.role, id, receipt, '100% release authorized; adapter confirmation still required.');
          } else if (action === 'dispute') {
            reviews.assertReport(extra, false);
            const reason = required(body.reason, 'Dispute reason', 2000);
            const receipt = await send(c.dispute(id));
            extra.dispute = { reason, openedBy: body.role, openedAt: new Date().toISOString() };
            log('Dispute opened', body.role, id, receipt, reason);
          } else if (action === 'resolve') {
            reviews.assertReport(extra, false);
            if (!Number.isInteger(body.releasePercent) || body.releasePercent < 0 || body.releasePercent > 100) fail('Enter a whole release percentage from 0 to 100.');
            const reason = required(body.reason, 'Decision explanation', 2000);
            const receipt = await send(c.resolve(id, body.releasePercent * 100));
            extra.resolution = { reason, releasePercent: body.releasePercent, decidedAt: new Date().toISOString() };
            log('Dispute resolved by arbiter', body.role, id, receipt, `${body.releasePercent}% release / ${100 - body.releasePercent}% refund. ${reason}`);
          }
        }
      }
      save();
      return { ...(await snapshot()), selectedId: id || null };
    } finally { busy = false; }
  }
  const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
  async function bodyOf(req) { let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 500000) fail('The request is too large.', 413); } try { return JSON.parse(raw || '{}'); } catch { fail('Invalid JSON request.'); } }
  const server = http.createServer(async (req, res) => {
    const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'same-origin');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      const expectedHost = `127.0.0.1:${server.address()?.port}`;
      if (req.headers.host !== expectedHost && req.headers.host !== `localhost:${server.address()?.port}`) fail('Invalid local host.', 403);
      const url = new URL(req.url, `http://${expectedHost}`);
      if (req.method === 'GET' && url.pathname === '/api/state') return json(await snapshot());
      const reportDownload = url.pathname.match(/^\/api\/reviews\/(\d+)\/report$/);
      if (req.method === 'GET' && reportDownload) {
        const html = reviews.reportHTML(Number(reportDownload[1]));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': 'attachment; filename="safedeal-expert-report.html"', 'Cache-Control': 'no-store' });
        return res.end(html);
      }
      const agreement = url.pathname.match(/^\/api\/market\/jobs\/([^/]+)\/agreement$/);
      if (req.method === 'GET' && agreement) {
        const project = market.snapshot().jobs.find(j => j.id === agreement[1]);
        if (!project?.agreement) fail('An accepted scope agreement is not available for this project.', 404);
        const state = await snapshot();
        const records = state.deals.filter(d => d.projectId === project.id).map(d => ({ id: d.id, title: d.title, amount: d.amount, dueDate: d.dueDate, criteria: d.criteria, termsHash: d.termsHash, state: d.state, changeId: d.changeId }));
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="safedeal-scope-agreement.json"', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ educational: true, project: project.title, agreement: project.agreement, milestones: records, notice: 'Local educational record. Fictional identities and amounts. No real payment or legal signature.' }, null, 2));
      }
      if (req.method === 'GET' && /^\/api\/deals\/\d+\/attachment$/.test(url.pathname)) {
        const id = Number(url.pathname.split('/')[3]); const file = meta.deals[id]?.evidence?.file;
        if (!file) fail('Attachment not found.', 404);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`, 'Cache-Control': 'no-store' }); return res.end(Buffer.from(file.base64, 'base64'));
      }
      if (req.method === 'GET' && url.pathname === '/api/export') {
        const state = await snapshot(); delete state.token;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="safedeal-workspace.json"', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(state, null, 2));
      }
      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        if (req.headers.origin && ![`http://${expectedHost}`, `http://localhost:${server.address()?.port}`].includes(req.headers.origin)) fail('Cross-origin actions are blocked.', 403);
        if (req.headers['x-safedeal-token'] !== token) fail('Reload this workspace before continuing.', 403);
        if (!req.headers['content-type']?.includes('application/json')) fail('JSON is required.', 415);
        const body = await bodyOf(req);
        if (!ROLES.includes(body.role)) fail('Select a valid workspace role.', 403);
        const reviewAction = url.pathname.match(/^\/api\/reviews\/(\d+)\/(report|recheck|appeal|revise)$/);
        if (reviewAction) {
          if (busy) fail('Another action is being confirmed. Please try again.', 409);
          if (f.contract && await f.contract.paused()) fail('The workspace is paused.', 409);
          busy = true;
          try { const selection = await reviews.mutate(Number(reviewAction[1]), reviewAction[2], body); return json({ ...(await snapshot()), ...selection }); }
          finally { busy = false; }
        }
        if (url.pathname.startsWith('/api/market/')) {
          if (busy) fail('Another action is being confirmed. Please try again.', 409);
          busy = true;
          try { const selection = await market.mutate(url.pathname, body); return json({ ...(await snapshot()), ...selection }); }
          finally { busy = false; }
        }
        if (url.pathname === '/api/tests') {
          if (body.role !== 'admin') fail('Only the workspace admin can run tests.', 403);
          if (meta.tests.status === 'running') fail('Tests are already running.', 409);
          meta.tests = { status: 'running', cases: [], startedAt: new Date().toISOString() }; save();
          testsPromise = runContractTests().then(result => {
            const { stdout, ...summary } = result; meta.tests = summary;
            fs.mkdirSync(path.join(__dirname, 'artifacts'), { recursive: true });
            fs.writeFileSync(path.join(__dirname, 'artifacts', 'test-results.tap'), stdout);
            fs.writeFileSync(path.join(__dirname, 'artifacts', 'test-results.json'), JSON.stringify(summary, null, 2));
            log(`${result.passed} contract tests passed`, 'admin', null, null, `${result.failed} failed · exit code ${result.exitCode}`); save();
          }).catch(() => { meta.tests = { status: 'failed', cases: [], error: 'Test process could not finish. Run npm test in the project folder.' }; save(); });
          return json(await snapshot(), 202);
        }
        if (url.pathname === '/api/deploy') return json(await mutate('deploy', body));
        if (url.pathname === '/api/pause') return json(await mutate('pause', body));
        if (url.pathname === '/api/deals') return json(await mutate('create', body));
        const match = url.pathname.match(/^\/api\/deals\/(\d+)\/(reserve|submit|approve|dispute|resolve|settle)$/);
        if (match) return json(await mutate(match[2], body, Number(match[1])));
        fail('Action not found.', 404);
      }
      if (req.method === 'GET') {
        const allowed = { '/': 'index.html', '/app.js': 'app.js', '/marketplace.js': 'marketplace.js', '/marketplace.css': 'marketplace.css', '/reviews.js': 'reviews.js', '/reviews.css': 'reviews.css', '/style.css': 'style.css', '/favicon.svg': 'favicon.svg' };
        const asset = allowed[url.pathname];
        if (!asset) fail('Page not found.', 404);
        const filename = path.join(__dirname, 'public', asset);
        res.writeHead(200, { 'Content-Type': mime[path.extname(filename)], 'Cache-Control': 'no-cache' }); return res.end(fs.readFileSync(filename));
      }
      fail('Method not allowed.', 405);
    } catch (e) { if (!res.headersSent) json({ error: cleanError(e) }, e.status || 400); else res.end(); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}`, close: async () => { await testsPromise; await new Promise(resolve => server.close(resolve)); save(); await chain.close(); } };
}
module.exports = { createApp };
if (require.main === module) createApp().then(app => {
  console.log(`SafeDeal workspace: ${app.url}`);
  let closing = false;
  const stop = async () => { if (closing) return; closing = true; await app.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}).catch(e => { console.error(e.message); process.exit(1); });
