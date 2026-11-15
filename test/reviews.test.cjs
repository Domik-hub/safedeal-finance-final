const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createApp } = require('../app-server.cjs');
let app, token, jobId, dealId, checks, originalHash;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'safedeal-review-test-'));
const state=async()=>(await fetch(app.url+'/api/state')).json();
async function post(route,role,body={},expected=200){const res=await fetch(app.url+route,{method:'POST',headers:{'Content-Type':'application/json','X-SafeDeal-Token':token},body:JSON.stringify({profileId:'alex',expertId:'nina',...body,role})});const data=await res.json();assert.equal(res.status,expected,data.error);return data;}
const deal=async()=>(await state()).deals.find(d=>d.id===dealId);
const report=(status='Passed',expertId='nina')=>({expertId,noConflict:true,summary:'Fictional technical acceptance report.',checks:checks.map((c,i)=>({id:c.id,status:i===0?status:'Passed',note:i===0&&status!=='Passed'?'Submitting the contact form does not produce a request. Correct the agreed feature.':'Tested the agreed requirement using the submitted evidence.'}))});
const delivery=(version=1)=>({message:`Fictional delivery version ${version}`,criteriaEvidence:checks.map(c=>({id:c.id,note:`Evidence for version ${version}: ${c.text}`})),file:{name:'demo.txt',base64:Buffer.from(`Demo source ${version}`).toString('base64')}});
before(async()=>{app=await createApp({dataDir,port:0});token=(await state()).token;await post('/api/deploy','admin');});
after(async()=>{await app?.close();});

test('review terms require consent from freelancer and client before hiring',async()=>{
  const published=await post('/api/market/jobs','client',{title:'Cafe site acceptance',description:'A fictional cafe page with a working contact form.',category:'Web development',budget:100000,dueDate:'2030-12-01',skills:['JavaScript'],criteria:['Contact form sends a request','Mobile layout and source handover']});jobId=published.selectedJobId;
  const proposal={amount:100000,dueDate:'2030-12-01',message:'I will deliver both agreed checks.',portfolioIds:['alex-1'],acceptScope:true};
  await post(`/api/market/jobs/${jobId}/apply`,'freelancer',proposal,400);
  const applied=await post(`/api/market/jobs/${jobId}/apply`,'freelancer',{...proposal,acceptReview:true});
  const proposalId=applied.marketplace.proposals.find(p=>p.jobId===jobId).id;
  await post(`/api/market/jobs/${jobId}/hire`,'client',{proposalId},400);
  const hired=await post(`/api/market/jobs/${jobId}/hire`,'client',{proposalId,acceptReviewFee:true});dealId=hired.selectedId;
  const d=await deal();checks=d.criteria;originalHash=d.termsHash;
  assert.equal(d.expertReview.policy.initialFee,15000);assert.equal(d.scopeAgreement.reviewPolicy.initialExpertPay,10000);
});
test('initial report is required; only the assigned expert may inspect every agreed check',async()=>{
  await post(`/api/deals/${dealId}/reserve`,'adapter',{reference:'REVIEW-RES-1'});
  await post(`/api/deals/${dealId}/submit`,'freelancer',delivery());
  await post(`/api/deals/${dealId}/approve`,'client',{checkedCriteriaIds:checks.map(c=>c.id)},409);
  await post(`/api/deals/${dealId}/dispute`,'client',{reason:'Trying to bypass the expert'},409);
  await post(`/api/reviews/${dealId}/report`,'client',report(),403);
  await post(`/api/reviews/${dealId}/report`,'expert',report('Passed','owen'),403);
  await post(`/api/reviews/${dealId}/report`,'expert',{...report(),noConflict:false},400);
  await post(`/api/reviews/${dealId}/report`,'expert',{...report(),checks:[]},400);
  await post(`/api/reviews/${dealId}/report`,'expert',{...report(),checks:[report().checks[0],report().checks[0]]},400);
});
test('failed review blocks approval and earns the same fixed expert compensation',async()=>{
  await post(`/api/reviews/${dealId}/report`,'expert',report('Needs correction'));
  const d=await deal(),round=d.expertReview.rounds[0];assert.equal(round.report.outcome,'Changes requested');assert.equal(round.expertPay,10000);assert.equal(round.expertPayStatus,'Earned in simulation');
  await post(`/api/deals/${dealId}/approve`,'client',{checkedCriteriaIds:checks.map(c=>c.id)},409);
  await post(`/api/reviews/${dealId}/report`,'expert',report(),409);
});
test('corrections preserve original terms and require a newly consented recheck of the new version',async()=>{
  const body={reason:'Please fix the failed contact form check.',acceptFee:true};
  await post(`/api/reviews/${dealId}/recheck`,'freelancer',body,403);
  await post(`/api/reviews/${dealId}/recheck`,'client',{...body,acceptFee:false},400);
  await post(`/api/reviews/${dealId}/recheck`,'client',body);
  await post(`/api/reviews/${dealId}/revise`,'freelancer',{...delivery(2),profileId:'mira'},403);
  await post(`/api/reviews/${dealId}/revise`,'freelancer',delivery(2));
  let d=await deal();assert.equal(d.expertReview.currentVersion,2);assert.equal(d.expertReview.deliveries[0].evidence.message,'Fictional delivery version 1');assert.equal(d.amount,100000);assert.equal(d.termsHash,originalHash);
  await post(`/api/deals/${dealId}/approve`,'client',{checkedCriteriaIds:checks.map(c=>c.id)},409);
  await post(`/api/reviews/${dealId}/report`,'expert',report());
  d=await deal();assert.equal(d.expertReview.rounds[1].expertPay,5000);assert.equal(d.expertReview.rounds[1].report.outcome,'Passed');
});
test('second opinion selects a different expert and blocks reliance on the earlier pass',async()=>{
  const body={acceptFee:true,reason:'Please independently verify the contact-form finding.'};
  await post(`/api/reviews/${dealId}/appeal`,'freelancer',{...body,profileId:'mira'},403);
  await post(`/api/reviews/${dealId}/appeal`,'freelancer',body);
  let d=await deal(),round=d.expertReview.rounds.at(-1);assert.equal(round.expertId,'owen');assert.equal(round.payer,'freelancer');assert.equal(round.fee,15000);
  await post(`/api/deals/${dealId}/approve`,'client',{checkedCriteriaIds:checks.map(c=>c.id)},409);
  await post(`/api/reviews/${dealId}/report`,'expert',report(),403);
  await post(`/api/reviews/${dealId}/report`,'expert',report('Unable to verify','owen'));
  await post(`/api/reviews/${dealId}/appeal`,'client',body,409);
  d=await deal();assert.equal(d.expertReview.rounds.at(-1).report.outcome,'Changes requested');assert.equal(d.expertReview.rounds.at(-1).expertPay,10000);
});
test('latest passed review allows client acceptance and settlement, while review fees stay separate',async()=>{
  await post(`/api/reviews/${dealId}/recheck`,'client',{acceptFee:true,reason:'Supply the missing test evidence.'});
  await post(`/api/reviews/${dealId}/revise`,'freelancer',delivery(3));
  await post(`/api/reviews/${dealId}/report`,'expert',report('Passed','owen'));
  await post(`/api/deals/${dealId}/approve`,'client',{checkedCriteriaIds:[checks[0].id]},400);
  await post(`/api/deals/${dealId}/approve`,'client',{checkedCriteriaIds:checks.map(c=>c.id)});
  await post(`/api/deals/${dealId}/settle`,'adapter',{reference:'REVIEW-SET-1'});
  const d=await deal();assert.equal(d.released,100000);assert.equal(d.state,'Settled');assert.equal(d.expertReview.rounds.reduce((sum,x)=>sum+x.fee,0),40000);assert.equal((await state()).deals.length,1);
  await post(`/api/reviews/${dealId}/appeal`,'client',{acceptFee:true,reason:'Too late'},409);
});
test('readable downloadable reports include review history and survive restart',async()=>{
  const previous=await deal(), res=await fetch(`${app.url}/api/reviews/${dealId}/report`),html=await res.text();assert.equal(res.status,200);assert.match(html,/Nina Brooks/);assert.match(html,/Owen Reed/);assert.match(html,/Changes requested/);assert.match(html,/Delivery SHA256/);assert.ok(!html.includes(token));
  await app.close();app=await createApp({dataDir,port:0});token=(await state()).token;assert.deepEqual((await deal()).expertReview,previous.expertReview);
});
