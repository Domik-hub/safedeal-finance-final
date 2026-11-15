Educational project for the course Introduction to Finance. Not a real product, service or investment offer. Do not use with real funds.

# SafeDeal — working local website

SafeDeal is a working educational marketplace: clients publish briefs, freelancers submit proposals with relevant portfolio work, and the client hires against agreed acceptance checks. The central product feature is explicit approval of extra scope: request → freelancer quote → client approval → separate milestone. The original scope, price and deadline remain on record. This is our product focus, not evidence that competitors lack similar capabilities or that customers will prefer it.

The English interface also includes delivery evidence for each acceptance check, attachment upload/download, client review, arbiter decisions and transaction history. Marketplace records are saved on the server. Hiring and accepted extra work create real Solidity milestones on a local Ganache chain; milestone status changes are signed and read back from that contract.

## Run locally

Clone this repository, install Node.js with npm, and run:

```sh
npm ci --ignore-scripts
npm start
```

Open **http://127.0.0.1:4173**. In a fresh workspace choose **Admin → Network & tests → Deploy workspace contract**, then switch to **Client**. Projects and proposals can be saved before deployment; hiring needs the contract. The ignored `data/` folder preserves the workspace. No public testnet or mainnet is used.

## Try the marketplace and scope protection

1. **Client → Projects → Post a project:** enter the brief, budget, date, skills and one acceptance check per line.
2. **Freelancer:** choose a fictional profile at the top, open the project and send a proposal. Select relevant portfolio work and agree that the price includes all checks.
3. **Client:** review the proposal and the freelancer's portfolio, then accept the proposal. This creates the original milestone for that specific freelancer.
4. **Client → Request extra work:** describe an additional deliverable with its own checks.
5. **Hired freelancer → Send a quote:** specify the additional price and date. Another freelancer cannot quote on their behalf.
6. **Client → Accept extra work:** a second milestone is created. The original agreement is unchanged. Either party may decline a pending change instead.
7. In each milestone use the payment-adapter, delivery, review and settlement flow below. Delivery must explain every acceptance check; the client must confirm every check before approval.
8. **Talent:** inspect portfolios, edit the active demo profile or add a portfolio project. Settled milestones automatically appear as completed local work, separately from self-added samples. Download the scope agreement from the project page to inspect the original and extra milestones together.

The seeded people, portfolio concepts and briefs are labelled fictional. Proposals are entered by the demonstrator using role switching; no real freelancer is contacted. This is one local shared workspace, not a deployed multi-user marketplace with authenticated customer accounts.

Tested with Node.js 24.22.1. Ganache can print an optional native uWS warning and fall back to JavaScript; the tested workflow works with that fallback.

## Try a complete agreement

1. **Client:** choose Milestones → New milestone. Enter a title, scope, integer KZT amount and delivery date.
2. **Payment adapter:** open the milestone and confirm a simulated reservation with a unique reference.
3. **Freelancer:** for marketplace milestones select the hired profile. Submit evidence for every acceptance check, delivery notes and optionally an HTTP(S) link or an attachment up to 300 KB. A sample fictional deliverable is in `sample-deliverables/`.
4. **Client:** read the submission, download the attachment, confirm each acceptance check and approve the work.
5. **Payment adapter:** confirm simulated settlement. The final released and refunded amounts appear on the milestone.

For the dispute branch, choose **Open a dispute** instead of approval. Either party can dispute submitted work. Switch to **Arbiter**, open the Dispute center, choose a release percentage and provide a decision explanation. Switch to **Payment adapter** to confirm the settlement. For a 120,000 KZT milestone, 60% releases 72,000 KZT and refunds 48,000 KZT.

Use Overview for current totals, Milestones for search/status filters, Activity to inspect transaction hashes or export records, and Network & tests for deployment, pause/resume and executable tests. Refreshing the browser or restarting the server preserves the workspace.

## What runs, and what is simulated

- Real implementation: a Node HTTP server, a responsive HTML/CSS/JavaScript application, an actual Solidity contract, separate local signer roles, mined transactions, on-chain hashes and state, persistent Ganache storage, saved off-chain notes and attachments, and executable tests.
- Simulated: client identities, business agreements, KZT balances, payment reservations and settlement confirmations. There is no bank/provider integration or real transfer of assets.
- The Demo role selector is a deliberate testing tool, not production authentication. The server listens only on the local loopback interface. Do not expose this server to the internet.
- No four-organization validator network has been deployed. The proposed consortium in the presentation is a future architecture; this implementation is one local Ganache development chain, ID 1337.
- The proposed 10% service fee and 16% VAT on that fee are illustrative inputs from the finance model. They are displayed separately, rounded to whole KZT for the UI, and are not charged or remitted. For a 120,000 KZT principal: 12,000 fee + 1,920 VAT = 133,920 estimated total. These planning inputs are not customer validation.

## Tests and verification

```sh
npm test
npm run test:app
npm run test:market
# All 31 tests:
npm run test:all
```

`npm test` runs 16 real contract tests: successful settlement; unauthorized actions; invalid state order; client/freelancer permissions; dispute and arbiter restrictions; split and full-refund outcomes; duplicate/replayed confirmations; missing adapter messages; pause access; invalid inputs; excessive splits; and native-asset rejection.

`npm run test:app` runs 6 HTTP integration tests: request/role boundaries, form validation, delivery attachment and settlement, dispute conservation, pause enforcement and recovery after a real server restart. Tests use isolated data and do not alter the user's milestones.

`npm run test:market` runs 9 integration tests: valid project publication; portfolio ownership and scope consent; hiring the selected signer; bilateral approval of extra work; declining changes; per-check delivery and review; portfolio validation; agreement export; and recovery of marketplace records after restart. All 31 tests passed on 15 November 2026 with Node.js 24.22.1.

Browser verification also covered the full normal and disputed workflows, actual file download, search/filter behavior, refresh, running the contract tests from the UI, and layouts at 1440×960 and 390×844. A fresh verification log is in `verification/` in this repository. Passing tests are not an external security audit.

## Previous recorded demonstration

[Watch the English demo (2:53)](https://drive.google.com/file/d/1OYpueuP28cloxXEb5lAvWSyM6pL3cRbn/view).

This earlier recording shows the original milestone workflow. It does not show the new marketplace, portfolios or scope-change feature. It covers local deployment, creation, reservation, file delivery and download, approval, settlement, a dispute, a 60/40 arbiter decision and 16 contract tests. All transactions and people are fictional. Its example principal is KZT 120,000; the financial model uses a separately derived KZT 100,000 benchmark.

## Source map

- `app-server.cjs`: local API, validation, signer selection, persistent metadata and test runner.
- `marketplace.cjs`: projects, profiles, proposals, agreed scope and bilateral change requests.
- `public/`: responsive website and interface logic.
- `contracts/MilestoneWorkflow.sol`: role/state rules and amount conservation.
- `lib.cjs`: compiler and local chain setup.
- `test/workflow.test.cjs`: 16 contract tests.
- `test/app.test.cjs`: 6 server integration tests.
- `test/marketplace.test.cjs`: 9 marketplace integration tests.
- `sample-deliverables/`: fictional file used in the new demonstration.

The contract has no payable function, token transfer or external custody call. Terms/delivery hashes and decisions are on chain; descriptions, dates and attachment bytes are off chain. Reservation and settlement references cannot be reused. Privileged signer roles are separate. The admin may pause but cannot replace the client's approval or the arbiter's decision. State checks remain enforced by the contract, independently of the visible buttons.

## Local data and keys

Persistent local test accounts are deterministic for repeatable development. Their credentials must never be used on a real network. No seed phrase or private key is displayed in the website, source archive or recording. Do not add real personal information, real client files, `.env` files, wallet keys or real funds. Keep `data/`, `node_modules/`, logs and environment files out of Git.

## Dependencies and licenses

The contract and application use the MIT license in this folder. Dependencies are pinned: ethers 6.15.0 (MIT), Ganache 7.9.2 (MIT), solc 0.8.30 (GPL-3.0 compiler package). Preserve each dependency's license when distributing it. The source archive excludes dependency binaries. Official sources: https://github.com/ethers-io/ethers.js ; https://github.com/trufflesuite/ganache ; https://github.com/ethereum/solc-js . No OpenZeppelin template was used.

## Report and calculations

Financial calculations, assumptions and source citations are retained in the separate academic report. They are not published in this repository.

## AI disclosure and contribution history

OpenAI Codex (GPT-6 family; exact historical variant not confirmed) assisted with application, contract and test code, interface design, debugging, browser recording, financial-model drafts and documentation. The team selected the project direction and requested revisions. Students remain responsible for independently checking the analysis and understanding the code. AI assistance must not be described as independent student authorship.

This repository was published through the owner's GitHub account with present-day commits. These commits do not establish separate contributions by all four students. Each team member must make their own genuine, reviewed contribution from their own account to satisfy the course's individual-history requirement; no authors or dates have been invented.

The academic report and self-evaluations are separate submission artifacts. This is a local educational prototype, not a public product, security certification, bank partnership or investment offer.
