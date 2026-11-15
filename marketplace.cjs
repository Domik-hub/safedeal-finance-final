const crypto = require('node:crypto');

const todayPlus = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const uid = prefix => `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
const criteria = lines => lines.map(text => ({ id: uid('criterion'), text }));

function seedMarketplace() {
  return {
    version: 1,
    profiles: [
      { id: 'mira', name: 'Mira North', initials: 'MN', title: 'Brand & interface designer', city: 'Almaty', rate: 12000, color: 'peach', skills: ['UI design', 'Figma', 'Branding'], bio: 'I turn early ideas into clear, usable interfaces. My proposals explain exactly what you will receive and how each deliverable will be checked.', portfolio: [
        { id: 'mira-1', title: 'Fieldnotes identity', category: 'Brand design', description: 'A fictional stationery identity with a wordmark, color system and packaging concepts.', theme: 'paper', url: '', sample: true },
        { id: 'mira-2', title: 'Forma booking app', category: 'Product design', description: 'A fictional appointment app with a mobile booking flow and a reusable component library.', theme: 'violet', url: '', sample: true }
      ] },
      { id: 'alex', name: 'Alex Rowan', initials: 'AR', title: 'Frontend developer', city: 'Astana', rate: 15000, color: 'blue', skills: ['JavaScript', 'Web development', 'Accessibility'], bio: 'I build responsive websites with clear handover notes. I prefer small milestones with observable acceptance checks, so both sides know when the work is done.', portfolio: [
        { id: 'alex-1', title: 'Orbit store concept', category: 'Web development', description: 'A fictional responsive storefront with product filters and a simple checkout prototype.', theme: 'orange', url: '', sample: true },
        { id: 'alex-2', title: 'North analytics', category: 'Dashboard', description: 'A fictional reporting interface designed for clear charts, keyboard navigation and small screens.', theme: 'blue', url: '', sample: true }
      ] },
      { id: 'dani', name: 'Dani Vale', initials: 'DV', title: 'Illustrator & visual storyteller', city: 'Shymkent', rate: 10000, color: 'green', skills: ['Illustration', 'Branding', 'Social media'], bio: 'I create expressive visuals for small brands. I agree on the style and the final file formats before starting, and document changes as the brief evolves.', portfolio: [
        { id: 'dani-1', title: 'Sunday market', category: 'Illustration', description: 'A fictional poster series using geometric shapes and a warm, limited palette.', theme: 'green', url: '', sample: true },
        { id: 'dani-2', title: 'Little planet', category: 'Visual identity', description: 'A fictional set of social graphics and illustrated characters for an independent studio.', theme: 'pink', url: '', sample: true }
      ] }
    ],
    jobs: [
      { id: 'job-studio', title: 'A fresh landing page for a creative studio', category: 'Web development', description: 'Create a responsive one-page website for a fictional creative studio. We have the copy and a simple visual direction. We need a clear services section, selected work and a contact form interface.', budget: 180000, dueDate: todayPlus(21), skills: ['Web development', 'JavaScript', 'UI design'], criteria: criteria(['Works at 390 px and 1440 px without horizontal scrolling', 'Includes hero, services, three work examples and a contact form interface', 'Includes source files and a short handover guide']), status: 'Open', sample: true, createdAt: new Date().toISOString(), milestoneIds: [] },
      { id: 'job-brand', title: 'A thoughtful identity for a small coffee brand', category: 'Branding', description: 'Design a compact visual identity for a fictional coffee brand. We want a warm wordmark and a simple system that works on cups and social posts.', budget: 120000, dueDate: todayPlus(14), skills: ['Branding', 'Figma', 'Illustration'], criteria: criteria(['Deliver the final logo as SVG and transparent PNG', 'Include a color palette and typography guide', 'Provide three social post templates']), status: 'Open', sample: true, createdAt: new Date().toISOString(), milestoneIds: [] },
      { id: 'job-app', title: 'Make a booking flow feel effortless', category: 'UI design', description: 'Design five mobile screens for a fictional service booking app: browse, service details, date selection, confirmation and upcoming bookings.', budget: 150000, dueDate: todayPlus(18), skills: ['UI design', 'Figma', 'Accessibility'], criteria: criteria(['Provide five connected mobile screens in an editable file', 'Show empty, loading and error states for the booking step', 'Include an interactive prototype and component sheet']), status: 'Open', sample: true, createdAt: new Date().toISOString(), milestoneIds: [] }
    ],
    proposals: [], changes: []
  };
}

function createMarketplace({ meta, getFixture, save, log, send, hash, fail }) {
  meta.marketplace ||= seedMarketplace();
  const m = meta.marketplace;
  const text = (v, label, max = 2500) => {
    if (typeof v !== 'string' || !v.trim() || v.trim().length > max) fail(`${label} is required (maximum ${max} characters).`);
    return v.trim();
  };
  const amount = n => { if (!Number.isSafeInteger(n) || n < 1 || n > 1000000000) fail('Enter a whole KZT amount between 1 and 1,000,000,000.'); return n; };
  const date = v => { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) fail('Enter a valid delivery date.'); return v; };
  const list = (v, label, max = 8) => {
    if (!Array.isArray(v) || v.length < 1 || v.length > max) fail(`Add between 1 and ${max} ${label}.`);
    const values = v.map(s => text(s, label, 180));
    if (new Set(values.map(s => s.toLowerCase())).size !== values.length) fail(`Remove duplicate ${label}.`);
    return values;
  };
  const profile = id => { const p = m.profiles.find(p => p.id === id); if (!p) fail('Select a freelancer profile.', 400); return p; };
  const job = id => { const j = m.jobs.find(j => j.id === id); if (!j) fail('Project not found.', 404); return j; };
  const requireRole = (b, role) => { if (b.role !== role) fail(`Only the ${role} can do this.`, 403); };
  const assigned = (b, j) => { requireRole(b, 'freelancer'); if (b.profileId !== j.freelancerId) fail('Only the hired freelancer can do this.', 403); };
  const signer = id => getFixture().signers[{ mira: 2, alex: 5, dani: 6 }[profile(id).id]];

  async function createDeal(j, p, terms, changeId = null) {
    const f = getFixture();
    if (!f.contract) fail('Initialize the local contract in Network & tests before hiring.', 409);
    const id = Number(await f.contract.nextId());
    const freelancerAddress = await signer(p.id).getAddress();
    const agreed = { ...terms, projectId: j.id, freelancerId: p.id, freelancerAddress, changeId };
    const receipt = await send(f.contract.connect(f.client).create(freelancerAddress, terms.amount, hash(JSON.stringify(agreed))));
    meta.deals[id] = { title: terms.title, description: terms.description, dueDate: terms.dueDate, criteria: terms.criteria, createdAt: new Date().toISOString(), projectId: j.id, freelancerId: p.id, freelancerName: p.name, changeId, scopeAgreement: agreed };
    log(changeId ? 'Additional scope agreed by both parties' : 'Proposal accepted and scope agreed', 'client', id, receipt, `${terms.amount.toLocaleString('en-US')} KZT · ${p.name} · ${terms.title}`);
    j.milestoneIds.push(id);
    return id;
  }

  async function mutate(route, b) {
    let selectedJobId = null, selectedId = null, selectedProfileId = null;
    if (route === '/api/market/jobs') {
      requireRole(b, 'client');
      const j = { id: uid('job'), title: text(b.title, 'Project title', 110), description: text(b.description, 'Project brief', 3000), category: text(b.category, 'Category', 60), budget: amount(b.budget), dueDate: date(b.dueDate), skills: list(b.skills, 'skills'), criteria: criteria(list(b.criteria, 'acceptance checks')), status: 'Open', sample: false, createdAt: new Date().toISOString(), milestoneIds: [] };
      m.jobs.unshift(j); selectedJobId = j.id;
      log('Project published', 'client', null, null, j.title);
    } else if (route === '/api/market/portfolio') {
      requireRole(b, 'freelancer'); const p = profile(b.profileId);
      if (p.portfolio.length >= 20) fail('This demo supports up to 20 portfolio projects per profile.');
      const title = text(b.title, 'Portfolio title', 100), description = text(b.description, 'Project description', 1000);
      let url = b.url ? text(b.url, 'Project URL', 600) : '';
      if (url) { let u; try { u = new URL(url); } catch { fail('Enter a valid project URL.'); } if (!['https:', 'http:'].includes(u.protocol)) fail('Use an HTTP or HTTPS project URL.'); }
      const theme = ['paper', 'violet', 'orange', 'blue', 'green', 'pink'].includes(b.theme) ? b.theme : 'paper';
      p.portfolio.unshift({ id: uid('portfolio'), title, description, category: text(b.category, 'Project type', 60), url, theme, sample: false }); selectedProfileId = p.id;
    } else if (route === '/api/market/profile') {
      requireRole(b, 'freelancer'); const p = profile(b.profileId);
      const update = { title: text(b.title, 'Professional title', 90), bio: text(b.bio, 'About you', 1200), skills: list(b.skills, 'skills'), rate: amount(b.rate) };
      Object.assign(p, update); selectedProfileId = p.id;
    } else {
      const match = route.match(/^\/api\/market\/jobs\/([^/]+)\/(apply|hire|close|changes)$/);
      const cm = route.match(/^\/api\/market\/changes\/([^/]+)\/(quote|accept|decline)$/);
      if (match) {
        const j = job(match[1]); selectedJobId = j.id;
        if (match[2] === 'apply') {
          requireRole(b, 'freelancer'); const p = profile(b.profileId);
          if (j.status !== 'Open') fail('This project is no longer accepting proposals.', 409);
          if (m.proposals.some(x => x.jobId === j.id && x.profileId === p.id)) fail('You already sent a proposal for this project.', 409);
          if (b.acceptScope !== true) fail('Confirm that your proposal includes every acceptance check.');
          const portfolioIds = Array.isArray(b.portfolioIds) ? [...new Set(b.portfolioIds)] : [];
          if (!portfolioIds.length || portfolioIds.some(id => !p.portfolio.some(x => x.id === id))) fail('Select at least one project from your own portfolio.');
          m.proposals.push({ id: uid('proposal'), jobId: j.id, profileId: p.id, amount: amount(b.amount), dueDate: date(b.dueDate), message: text(b.message, 'Proposal message', 2500), portfolioIds, acceptedCriteria: structuredClone(j.criteria), status: 'Pending', createdAt: new Date().toISOString() });
          log('Proposal received', 'freelancer', null, null, `${p.name} · ${j.title}`);
        } else if (match[2] === 'hire') {
          requireRole(b, 'client');
          if (j.status !== 'Open') fail('This project has already been hired or closed.', 409);
          const proposal = m.proposals.find(x => x.id === b.proposalId && x.jobId === j.id);
          if (!proposal || proposal.status !== 'Pending') fail('Available proposal not found.', 404);
          const p = profile(proposal.profileId);
          selectedId = await createDeal(j, p, { title: j.title, description: j.description, amount: proposal.amount, dueDate: proposal.dueDate, criteria: structuredClone(proposal.acceptedCriteria) });
          j.status = 'Hired'; j.freelancerId = p.id; j.agreedAmount = proposal.amount; j.agreedDueDate = proposal.dueDate;
          j.agreement = { amount: proposal.amount, dueDate: proposal.dueDate, criteria: structuredClone(proposal.acceptedCriteria), proposalId: proposal.id, agreedAt: new Date().toISOString() };
          for (const item of m.proposals.filter(x => x.jobId === j.id)) item.status = item.id === proposal.id ? 'Accepted' : 'Not selected';
        } else if (match[2] === 'close') {
          requireRole(b, 'client'); if (j.status !== 'Open') fail('Only an open project can be closed.', 409);
          j.status = 'Closed'; for (const item of m.proposals.filter(x => x.jobId === j.id)) item.status = 'Closed';
        } else {
          requireRole(b, 'client'); if (j.status !== 'Hired') fail('Hire a freelancer before requesting extra work.', 409);
          m.changes.push({ id: uid('change'), jobId: j.id, title: text(b.title, 'Additional task', 110), description: text(b.description, 'What is outside the agreed scope?', 2000), criteria: criteria(list(b.criteria, 'acceptance checks')), status: 'Requested', createdAt: new Date().toISOString() });
          log('Additional work requested', 'client', j.milestoneIds[0], null, `${b.title} · waiting for a separate quote`);
        }
      } else if (cm) {
        const change = m.changes.find(c => c.id === cm[1]); if (!change) fail('Change request not found.', 404);
        const j = job(change.jobId); selectedJobId = j.id;
        if (['Accepted', 'Declined'].includes(change.status)) fail('This change request is already closed.', 409);
        if (cm[2] === 'quote') {
          assigned(b, j); if (change.status !== 'Requested') fail('A quote has already been submitted.', 409);
          const quote = { amount: amount(b.amount), dueDate: date(b.dueDate), message: text(b.message, 'Quote explanation', 1500), profileId: b.profileId, quotedAt: new Date().toISOString() };
          change.quote = quote; change.status = 'Quoted';
          log('Additional work quoted', 'freelancer', j.milestoneIds[0], null, `${quote.amount} KZT · waiting for client approval`);
        } else if (cm[2] === 'accept') {
          requireRole(b, 'client'); if (change.status !== 'Quoted') fail('The freelancer must quote this request first.', 409);
          selectedId = await createDeal(j, profile(j.freelancerId), { title: change.title, description: change.description, amount: change.quote.amount, dueDate: change.quote.dueDate, criteria: structuredClone(change.criteria) }, change.id);
          change.status = 'Accepted'; change.milestoneId = selectedId; change.acceptedAt = new Date().toISOString();
        } else {
          if (b.role === 'freelancer') assigned(b, j); else requireRole(b, 'client');
          change.status = 'Declined'; change.declinedBy = b.role;
          log('Additional work declined', b.role, j.milestoneIds[0], null, change.title);
        }
      } else fail('Marketplace action not found.', 404);
    }
    save(); return { selectedJobId, selectedId, selectedProfileId };
  }
  function assertFreelancer(b, extra) {
    if (b.role === 'freelancer' && extra.freelancerId && b.profileId !== extra.freelancerId) fail('This milestone belongs to another freelancer profile.', 403);
  }
  return { snapshot: () => m, mutate, signer, assertFreelancer };
}
module.exports = { createMarketplace, seedMarketplace };
