'use strict';
let activeExpertId = localStorage.getItem('safedeal-expert') || 'nina';
const reviewRound = d => d.expertReview?.rounds.at(-1);
const expertName = id => state.experts.find(e => e.id === id)?.name || id;
const reviewButton = (label, action, id, css='') => `<button type="button" class="btn ${css}" data-review="${action}" data-id="${id}">${label}</button>`;
function expertPicker() {
  return role === 'expert' ? `<label class="profile-picker"><span>Reviewer profile</span><select id="expert-select" aria-label="Reviewer profile">${state.experts.map(e=>`<option value="${e.id}" ${e.id===activeExpertId?'selected':''}>${esc(e.name)}</option>`).join('')}</select></label>` : '';
}
function reviewTerms(policy, consentName='') {
  if (!policy) return '';
  return `<div class="review-terms"><strong>${icon('shield',17)} Independent acceptance review</strong><p>A specialist checks each agreed deliverable before client approval. Their fixed compensation does not depend on the verdict.</p><div class="review-price-row"><span>First review · paid by client</span><b>${money(policy.initialFee)} KZT</b></div><div class="review-price-row"><span>Correction recheck · client orders separately</span><b>${money(policy.recheckFee)} KZT</b></div><div class="review-price-row"><span>Second opinion · paid by requester</span><b>${money(policy.appealFee)} KZT</b></div><small>Unvalidated pilot prices, before any applicable review taxes. No real charge. Fixing agreed scope does not add to the freelancer's price; a recheck is a separate service. Extra deliverables require a new quote.</small>${consentName?`<label class="check-option"><input type="checkbox" name="${consentName}" required><span>${consentName==='acceptReview'?'I agree to specialist review of the agreed checks and the correction process.':'I agree to the first review fee and the separate recheck / second-opinion terms above.'}</span></label>`:''}</div>`;
}
function expertReviewPanel(d) {
  const r=d.expertReview; if(!r) return '';
  const round=reviewRound(d), isParty=role==='client'||(role==='freelancer'&&activeProfileId===d.freelancerId), editable=d.state==='Submitted';
  const latestReport=round?.report;
  let action='';
  if(editable&&round?.status==='Awaiting review'&&role==='expert'&&activeExpertId===round.expertId) action=reviewButton('Write expert report','report',d.id,'primary');
  if(editable&&round?.status==='Awaiting revision'&&role==='freelancer'&&activeProfileId===d.freelancerId) action=reviewButton('Submit corrections','revise',d.id,'primary');
  if(editable&&latestReport&&role==='client'&&latestReport.outcome!=='Passed') action+=reviewButton('Request corrections & recheck','recheck',d.id,'primary');
  if(editable&&latestReport&&isParty&&!r.rounds.some(x=>x.kind==='Appeal'&&x.deliveryVersion===r.currentVersion)) action+=reviewButton('Request a second opinion','appeal',d.id);
  return `<section class="panel expert-panel"><div class="panel-head"><div><span class="eyebrow">THE SAFEDEAL DIFFERENCE</span><h2>Independent expert review</h2></div><span class="review-badge ${latestReport?.outcome==='Passed'?'passed':''}">${esc(latestReport?.outcome||round?.status||'Waiting for delivery')}</span></div><div class="panel-inner"><p>A clear answer to “is this ready?” A specialist reviews the agreed checks before the client approves the work.</p>${!round?reviewTerms(r.policy):`<div class="expert-assignment"><span class="talent-avatar blue">${state.experts.find(e=>e.id===round.expertId)?.initials}</span><div><strong>${esc(expertName(round.expertId))}</strong><small>${esc(round.kind)} · delivery version ${round.deliveryVersion} · fictional reviewer</small></div><div class="expert-fee"><b>${money(round.fee)} KZT</b><small>Review service · ${esc(round.payer)} pays</small></div></div><p class="review-compensation">Fixed expert compensation: ${money(round.expertPay)} KZT for the report, whether it passes or finds problems. No real payment is made.</p>${round.reason?`<div class="review-reason"><b>Request</b><p>${esc(round.reason)}</p></div>`:''}${latestReport?renderExpertReport(round):`<div class="review-pending">${icon('clock',20)}<span>${round.status==='Awaiting revision'?'The freelancer must submit corrections to the agreed checks. The original price and scope stay unchanged.':'The assigned expert must inspect the evidence and publish a report. Client approval is locked until all checks pass.'}</span></div>`}`}${action?`<div class="review-actions">${action}</div>`:''}${r.rounds.some(x=>x.report)?`<a class="btn ghost" href="/api/reviews/${d.id}/report" download>${icon('download',14)} Download review report</a>`:''}${r.rounds.length>1?`<details class="review-history"><summary>Earlier review rounds (${r.rounds.length-1})</summary>${r.rounds.slice(0,-1).map(x=>`<div class="review-old"><strong>${esc(x.kind)} · ${esc(expertName(x.expertId))} · version ${x.deliveryVersion}</strong>${x.report?renderExpertReport(x):''}</div>`).join('')}</details>`:''}<div class="review-scope-note"><b>A defect or a new request?</b><p>A broken agreed contact form is a correction. An extra online store is new scope: request → quote → both sides agree → separate milestone.</p></div><small>Demo experts are role-switched by the presenter. This records a review workflow; it does not certify real-world quality or automatically test a website.</small></div></section>`;
}
function renderExpertReport(round) {
  return `<div class="expert-report"><h3>${esc(round.report.outcome)} · expert report</h3><p class="preserve-lines">${esc(round.report.summary)}</p><div class="review-checks">${round.report.checks.map(c=>`<article><div><strong>${esc(c.criterion)}</strong><span class="review-badge ${c.status==='Passed'?'passed':''}">${esc(c.status)}</span></div><p class="preserve-lines">${esc(c.note)}</p></article>`).join('')}</div><small>Published ${date(round.report.publishedAt)} · no conflict of interest declared</small></div>`;
}
function expertReviewCost(d) {
  const r=d.expertReview; if(!r)return 0;
  return r.rounds.length?r.rounds.filter(x=>x.payer==='client').reduce((n,x)=>n+x.fee,0):r.policy.initialFee;
}
function reviewGateAction(d) {
  const round=reviewRound(d);
  if(!d.expertReview||d.state!=='Submitted'||(round?.status==='Report ready'&&round.report?.outcome==='Passed'))return '';
  return `<div class="action-panel waiting"><div class="action-icon">${icon('shield')}</div><h2>${round?.status==='Awaiting revision'?'Corrections come first':round?.report?'Resolve the review findings':'An expert checks the work first'}</h2><p>Read the independent review panel. Client approval becomes available after every agreed check passes.</p>${round?.report&&['client','freelancer'].includes(role)?button('Open a dispute','dispute',{class:'danger full'}):''}</div>`;
}
function reviewsPage() {
  const items=state.deals.filter(d=>d.expertReview && (role!=='expert'||reviewRound(d)?.expertId===activeExpertId));
  return `<div class="page-top"><div><div class="eyebrow">Know what you are accepting</div><h1>A specialist on your side.</h1><p>Review agreed work. Explain defects. Keep new requests separate.</p></div><span class="demo-label">Fictional expert workspace</span></div><section class="expert-intro"><div><h2>Check the result, not just the screenshot.</h2><p>Does the contact form send a request? Does the page work on mobile? Are the source files included? Review only what both parties agreed.</p></div><div><strong>Same fee. Any verdict.</strong><p>The expert earns a fixed amount for a complete report. A second opinion goes to a different reviewer.</p></div></section><div class="review-queue">${items.length?items.map(d=>{const round=reviewRound(d);return `<article class="panel review-queue-card"><div><span class="eyebrow">SD-${String(d.id).padStart(3,'0')} · ${esc(round?.kind||'Initial review')}</span><h2>${esc(d.title)}</h2><p>${round?`${esc(expertName(round.expertId))} · ${esc(round.report?.outcome||round.status)}`:'Waiting for the freelancer to submit delivery'}</p><small>${d.criteria.length} agreed checks · original scope preserved</small></div><button class="btn primary" data-deal="${d.id}">Open review ${icon('arrow',14)}</button></article>`}).join(''):'<section class="panel empty"><h2>No reviews yet</h2><p>Publish a new project, hire a freelancer and submit their delivery. The first review is then assigned automatically.</p></section>'}</div>`;
}
function reviewAction(action,id) {
  const d=state.deals.find(x=>x.id===Number(id)),r=d.expertReview,round=reviewRound(d);selectedId=d.id;
  let title,subtitle,fields,label;
  if(action==='report') {
    title='Write the independent report';subtitle=`${expertName(round.expertId)} · delivery version ${round.deliveryVersion}`;label='Publish expert report';
    fields=`<div class="review-form-evidence"><b>Freelancer delivery</b><p>${esc(d.evidence.message)}</p>${d.evidence.url?`<a href="${esc(d.evidence.url)}" target="_blank" rel="noopener noreferrer">Open submitted work</a>`:''}${d.evidence.file?`<a href="/api/deals/${d.id}/attachment" download>Download ${esc(d.evidence.file.name)}</a>`:''}<small>Do not enter passwords or private access tokens. Use a non-sensitive test link.</small></div>`+d.criteria.map((c,i)=>`<fieldset class="review-check-field"><legend>${i+1}. ${esc(c.text)}</legend><p>Freelancer evidence: ${esc(d.evidence.criteriaEvidence.find(x=>x.id===c.id)?.note)}</p>${field(`result-${c.id}`,'Result',`<select id="result-${c.id}" name="result-${c.id}" required><option value="">Choose a result</option><option>Passed</option><option>Needs correction</option><option>Unable to verify</option></select>`)}${mArea(`note-${c.id}`,'What did you test or observe?','Record evidence, reproduction steps and the required correction, if any.',1000)}</fieldset>`).join('')+mArea('summary','Plain-English summary','Explain what is ready and what still needs attention.',2000)+`<label class="check-option"><input type="checkbox" name="noConflict" required><span>I did not deliver this work and have no conflict of interest.</span></label><p class="form-note">Fixed compensation: ${money(round.expertPay)} KZT regardless of verdict. The demo records a simulated entitlement only.</p>`;
  } else if(action==='revise') {
    title='Submit corrections';subtitle='Fix the agreed checks. Do not add unapproved scope.';label='Send corrected delivery';
    fields=criteriaDeliveryFields(d)+mArea('message','Correction summary','Explain what changed since the previous delivery.',3000)+field('url','Updated test link · optional','<input type="url" id="url" name="url" placeholder="https://…">')+field('file','Updated attachment · optional','<input type="file" id="file" name="file">','Up to 300 KB. Previous delivery versions remain in the review history.');
  } else {
    const appeal=action==='appeal',fee=appeal?r.policy.appealFee:r.policy.recheckFee;
    title=appeal?'Request a second opinion':'Request corrections & recheck';subtitle=appeal?'A different expert reviews the same delivery.':'The freelancer corrects the agreed scope, then the expert rechecks it.';label=appeal?'Order second opinion':'Request corrections';
    fields=`<div class="quote-confirmation"><strong>${money(fee)} KZT</strong><span>${esc(roleTitles[role])} pays · unvalidated pilot price</span></div>`+mArea('reason',appeal?'Why do you disagree?':'What needs correction?',appeal?'Point to the disputed finding and evidence.':'Refer to the failed checks in the report.',2000)+`<label class="check-option"><input type="checkbox" name="acceptFee" required><span>I agree to the ${money(fee)} KZT review service fee, before any applicable taxes. No real charge in this demo.</span></label><p class="form-note">The freelancer’s original price does not increase. New deliverables need a separate extra-work agreement.</p>`;
  }
  marketModal(title,esc(subtitle),fields,`/api/reviews/${d.id}/${action}`,label,action);
  $('#market-form').id='review-form';
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-review]');if(b&&!pending)reviewAction(b.dataset.review,b.dataset.id);});
document.addEventListener('change',e=>{if(e.target.id==='expert-select'){activeExpertId=e.target.value;localStorage.setItem('safedeal-expert',activeExpertId);render();}});
document.addEventListener('submit',async e=>{
  if(e.target.id!=='review-form')return;e.preventDefault();if(pending)return;
  const form=e.target,data=new FormData(form),kind=form.dataset.kind,d=state.deals.find(x=>x.id===selectedId),body=Object.fromEntries([...data].filter(([k])=>k!=='file')),submit=form.querySelector('[type="submit"]'),error=$('#market-error');
  body.noConflict=data.has('noConflict');body.acceptFee=data.has('acceptFee');
  if(kind==='report')body.checks=d.criteria.map(c=>({id:c.id,status:data.get(`result-${c.id}`),note:data.get(`note-${c.id}`)}));
  if(kind==='revise')body.criteriaEvidence=d.criteria.map(c=>({id:c.id,note:data.get(`proof-${c.id}`)}));
  pending=true;submit.disabled=true;error.hidden=true;
  try {
    const file=data.get('file');if(file?.size){if(file.size>300000)throw new Error('Attach a file up to 300 KB.');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';bytes.forEach(x=>binary+=String.fromCharCode(x));body.file={name:file.name,base64:btoa(binary)};}
    await post(form.dataset.route,body);$('#dialog').close();currentView='detail';render();toast('Review record saved.');
  }catch(err){error.textContent=err.message;error.hidden=false;submit.disabled=false;}finally{pending=false;}
});
