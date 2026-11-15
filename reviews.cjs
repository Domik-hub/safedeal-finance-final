const crypto = require('node:crypto');

// Planning prices, not validated tariffs. No payment is processed by this demo.
const REVIEW_POLICY = Object.freeze({ version: 1, initialFee: 15000, initialExpertPay: 10000, recheckFee: 5000, recheckExpertPay: 5000, appealFee: 15000, appealExpertPay: 10000 });
const EXPERTS = [
  { id: 'nina', name: 'Nina Brooks', initials: 'NB', specialty: 'Website functionality & handover', fictional: true },
  { id: 'owen', name: 'Owen Reed', initials: 'OR', specialty: 'Usability & acceptance testing', fictional: true }
];
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const last = review => review.rounds.at(-1);

function createReviews({ meta, save, log, fail, viewDeal, validateEvidence }) {
  const text = (v, label, max = 2000) => { if (typeof v !== 'string' || !v.trim() || v.trim().length > max) fail(`${label} is required (maximum ${max} characters).`); return v.trim(); };
  function createRound(review, kind, payer, reason = '') {
    const previous = last(review), policy = review.policy;
    const expertId = kind === 'Appeal' ? EXPERTS.find(e => e.id !== previous.expertId).id : (previous?.expertId || 'nina');
    const prefix = { Initial: 'initial', Recheck: 'recheck', Appeal: 'appeal' }[kind];
    const round = { id: crypto.randomUUID(), kind, expertId, payer, reason, fee: policy[`${prefix}Fee`], expertPay: policy[`${prefix}ExpertPay`], status: kind === 'Recheck' ? 'Awaiting revision' : 'Awaiting review', deliveryVersion: review.currentVersion, deliveryHash: review.deliveries.at(-1)?.hash, createdAt: new Date().toISOString() };
    review.rounds.push(round); return round;
  }
  function recordDelivery(extra, evidence) {
    const r = extra.expertReview; if (!r) return;
    const version = r.currentVersion + 1;
    const delivered = { version, evidence: structuredClone(evidence), hash: digest(evidence), at: new Date().toISOString() };
    r.deliveries.push(delivered); r.currentVersion = version;
    if (!r.rounds.length) createRound(r, 'Initial', 'client');
    else { const round = last(r); round.deliveryVersion = version; round.deliveryHash = delivered.hash; round.status = 'Awaiting review'; }
  }
  function assertReport(extra, requirePassed = true) {
    const r = extra.expertReview; if (!r) return;
    const round = last(r);
    if (!round?.report || round.status !== 'Report ready' || round.deliveryVersion !== r.currentVersion) fail('An independent expert must finish the current delivery review before this action.', 409);
    if (requirePassed && round.report.outcome !== 'Passed') fail('The expert found unresolved checks. Request corrections or a second opinion before approval.', 409);
  }
  async function mutate(id, action, body) {
    const d = await viewDeal(id), extra = meta.deals[id];
    if (!d || !extra?.expertReview) fail('This milestone has no agreed expert-review service.', 404);
    if (d.state !== 'Submitted') fail('Expert review actions are available after delivery and before approval or a formal dispute.', 409);
    const r = extra.expertReview, round = last(r);
    if (action === 'report') {
      if (body.role !== 'expert' || body.expertId !== round?.expertId) fail('Only the assigned independent reviewer can publish this report.', 403);
      if (round.status !== 'Awaiting review') fail('This round is not awaiting a report.', 409);
      if (body.noConflict !== true) fail('Confirm that you did not perform this work and have no conflict of interest.');
      if (!Array.isArray(body.checks) || body.checks.length !== extra.criteria.length) fail('Report on every agreed check.');
      const checks = extra.criteria.map(c => {
        const matches = body.checks.filter(x => x.id === c.id);
        if (matches.length !== 1 || !['Passed', 'Needs correction', 'Unable to verify'].includes(matches[0].status)) fail('Give each agreed check exactly one valid result.');
        return { id: c.id, criterion: c.text, status: matches[0].status, note: text(matches[0].note, 'Test evidence and explanation', 1000) };
      });
      const report = { summary: text(body.summary, 'Plain-English summary'), checks, outcome: checks.every(c => c.status === 'Passed') ? 'Passed' : 'Changes requested', noConflict: true, publishedAt: new Date().toISOString() };
      round.report = { ...report, hash: digest({ ...report, deliveryHash: round.deliveryHash, expertId: round.expertId }) }; round.status = 'Report ready';
      // Fixed compensation is recorded for completing a report, not its verdict.
      round.expertPayStatus = 'Earned in simulation';
      log('Independent expert report published', 'expert', id, null, `${EXPERTS.find(e => e.id === round.expertId).name} · ${report.outcome} · fixed compensation ${round.expertPay} KZT (simulated)`);
    } else if (action === 'recheck' || action === 'appeal') {
      const party = body.role === 'client' || (body.role === 'freelancer' && body.profileId === extra.freelancerId);
      if (!party || (action === 'recheck' && body.role !== 'client')) fail(action === 'recheck' ? 'The client must agree to the recheck fee.' : 'Only a party to this milestone can request a second opinion.', 403);
      if (round?.status !== 'Report ready') fail('Wait for the current report before requesting another review.', 409);
      if (action === 'recheck' && round.report.outcome === 'Passed') fail('All agreed checks passed. New requirements belong in a separate extra-work request.', 409);
      if (action === 'appeal' && r.rounds.some(x => x.kind === 'Appeal' && x.deliveryVersion === r.currentVersion)) fail('This delivery already received a second opinion. Correct the work or open a formal dispute.', 409);
      if (body.acceptFee !== true) fail('Confirm the stated fee and who pays before ordering another review.');
      const reason = text(body.reason, action === 'appeal' ? 'Reason for a second opinion' : 'Correction request');
      createRound(r, action === 'appeal' ? 'Appeal' : 'Recheck', body.role, reason);
      log(action === 'appeal' ? 'Second opinion requested' : 'Corrections and recheck requested', body.role, id, null, reason);
    } else if (action === 'revise') {
      if (body.role !== 'freelancer' || body.profileId !== extra.freelancerId) fail('Only the hired freelancer can submit corrections.', 403);
      if (round?.status !== 'Awaiting revision') fail('The client must request corrections and agree to the recheck first.', 409);
      const evidence = validateEvidence(body, extra);
      recordDelivery(extra, evidence); extra.evidence = evidence;
      log('Corrected delivery submitted', 'freelancer', id, null, `Delivery version ${r.currentVersion} · original agreed scope unchanged`);
    } else fail('Review action not found.', 404);
    save(); return { selectedId: id };
  }
  function reportHTML(id) {
    const d = meta.deals[id], r = d?.expertReview;
    if (!r?.rounds.some(x => x.report)) fail('No expert report is available yet.', 404);
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return `<!doctype html><html lang="en"><meta charset="utf-8"><title>SafeDeal expert review</title><style>body{font:16px/1.5 Arial;max-width:900px;margin:40px auto;padding:20px;color:#153b32}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{border:1px solid #ccd8d1;padding:10px;text-align:left;vertical-align:top}small{overflow-wrap:anywhere}section{margin:30px 0;break-inside:avoid}h1,h2{line-height:1.2}@media print{body{margin:0}}</style><h1>Independent expert review</h1><h2>${esc(d.title)}</h2><p>Educational demonstration. Fictional reviewers; no independent real-world inspection or payment took place. Current delivery version: ${r.currentVersion}.</p>${r.rounds.filter(x=>x.report).map(x=>`<section><h2>${esc(x.kind)} · delivery ${x.deliveryVersion} · ${esc(x.report.outcome)}</h2><p>Reviewer: ${esc(EXPERTS.find(e=>e.id===x.expertId).name)}. ${esc(x.report.publishedAt)}</p><p>${esc(x.report.summary)}</p><table><tr><th>Agreed check</th><th>Result</th><th>Evidence / correction needed</th></tr>${x.report.checks.map(c=>`<tr><td>${esc(c.criterion)}</td><td>${esc(c.status)}</td><td>${esc(c.note)}</td></tr>`).join('')}</table><p>Service fee: ${x.fee} KZT. Fixed expert compensation: ${x.expertPay} KZT, independent of outcome. Payer: ${esc(x.payer)}. Planning figures; no payment processed.</p><small>Delivery SHA256: ${esc(x.deliveryHash)}<br>Report SHA256: ${esc(x.report.hash)}</small></section>`).join('')}<p>Fixes to agreed checks are corrections. New deliverables require a separate quote and approval. Review reports are stored off chain. Client approval and simulated settlement remain separate steps.</p></html>`;
  }
  return { recordDelivery, assertReport, mutate, reportHTML, experts: EXPERTS };
}
module.exports = { createReviews, REVIEW_POLICY, EXPERTS };
