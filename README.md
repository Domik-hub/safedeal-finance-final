Educational project for the course Introduction to Finance. Not a real product, service or investment offer. Do not use with real funds.

# SafeDeal — working local website

SafeDeal is a functional educational milestone workspace with a client dashboard, freelancer delivery, attachment upload/download, client review, arbiter decisions and a transaction history. All interface text is in English. Each business action calls the real Solidity contract on a local Ganache chain; milestone statuses are read back from that contract. The website is not a slide presentation or a static click-through mockup.

## Run locally

Clone this repository, install Node.js with npm, and run:

```sh
npm ci --ignore-scripts
npm start
```

Open **http://127.0.0.1:4173**. In a fresh workspace choose **Admin → Network & tests → Deploy workspace contract**, then switch to **Client** to create a milestone. The ignored `data/` folder is created locally and preserves the workspace. No public testnet or mainnet is used.

Tested with Node.js 24.22.1. Ganache can print an optional native uWS warning and fall back to JavaScript; the tested workflow works with that fallback.

## Try a complete agreement

1. **Client:** choose Milestones → New milestone. Enter a title, scope, integer KZT amount and delivery date.
2. **Payment adapter:** open the milestone and confirm a simulated reservation with a unique reference.
3. **Freelancer:** submit delivery notes and optionally an HTTP(S) link or an attachment up to 300 KB. A sample fictional deliverable is in `sample-deliverables/`.
4. **Client:** read the submission, download the attachment and approve the work.
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
```

`npm test` runs 16 real contract tests: successful settlement; unauthorized actions; invalid state order; client/freelancer permissions; dispute and arbiter restrictions; split and full-refund outcomes; duplicate/replayed confirmations; missing adapter messages; pause access; invalid inputs; excessive splits; and native-asset rejection.

`npm run test:app` runs 6 HTTP integration tests: request/role boundaries, form validation, delivery attachment and settlement, dispute conservation, pause enforcement and recovery after a real server restart. Tests use isolated data and do not alter the user's milestones.

Browser verification also covered the full normal and disputed workflows, actual file download, search/filter behavior, refresh, running the contract tests from the UI, and layouts at 1440×960 and 390×844. A fresh verification log is in `verification/` in this repository. Passing tests are not an external security audit.

## Recorded demonstration

[Watch the English demo (2:53)](https://drive.google.com/file/d/1OYpueuP28cloxXEb5lAvWSyM6pL3cRbn/view).

The recording shows actual local deployment, creation, reservation, file delivery and download, approval, settlement, a disputed milestone, a 60/40 arbiter decision and the 16 passing contract tests. All transactions and people are fictional. The example principal is KZT 120,000; the financial model uses a separately derived KZT 100,000 benchmark.

## Source map

- `app-server.cjs`: local API, validation, signer selection, persistent metadata and test runner.
- `public/`: responsive website and interface logic.
- `contracts/MilestoneWorkflow.sol`: role/state rules and amount conservation.
- `lib.cjs`: compiler and local chain setup.
- `test/workflow.test.cjs`: 16 contract tests.
- `test/app.test.cjs`: 6 server integration tests.
- `sample-deliverables/`: fictional file used in the new demonstration.

The contract has no payable function, token transfer or external custody call. Terms/delivery hashes and decisions are on chain; descriptions, dates and attachment bytes are off chain. Reservation and settlement references cannot be reused. Privileged signer roles are separate. The admin may pause but cannot replace the client's approval or the arbiter's decision. State checks remain enforced by the contract, independently of the visible buttons.

## Local data and keys

Persistent local test accounts are deterministic for repeatable development. Their credentials must never be used on a real network. No seed phrase or private key is displayed in the website, source archive or recording. Do not add real personal information, real client files, `.env` files, wallet keys or real funds. Keep `data/`, `node_modules/`, logs and environment files out of Git.

## Dependencies and licenses

The contract and application use the MIT license in this folder. Dependencies are pinned: ethers 6.15.0 (MIT), Ganache 7.9.2 (MIT), solc 0.8.30 (GPL-3.0 compiler package). Preserve each dependency's license when distributing it. The source archive excludes dependency binaries. Official sources: https://github.com/ethers-io/ethers.js ; https://github.com/trufflesuite/ganache ; https://github.com/ethereum/solc-js . No OpenZeppelin template was used.

## Financial model

Run `python finance/calculate_finance.py` with Python 3 (standard library only). It writes `finance/financial_model.json` and prints the reference case and stresses. Source URLs, access dates, quantities, assumptions and limitations are included in the script and JSON. `finance/sources-and-calculations.txt` explains the interpretation.

The 635 milestones/month reference is the minimum constant volume satisfying the chosen three-year NPV hurdle, **not observed demand**. Published acquiring rates do not establish a usable escrow integration. No surveys, customer orders, bank agreement or independent validator commitments are claimed.

## AI disclosure and contribution history

OpenAI Codex (GPT-6 family; exact historical variant not confirmed) assisted with application, contract and test code, interface design, debugging, browser recording, financial-model drafts and documentation. The team selected the project direction and requested revisions. Students remain responsible for independently checking the analysis and understanding the code. AI assistance must not be described as independent student authorship.

This repository was published through the owner's GitHub account with present-day commits. These commits do not establish separate contributions by all four students. Each team member must make their own genuine, reviewed contribution from their own account to satisfy the course's individual-history requirement; no authors or dates have been invented.

The academic report and self-evaluations are separate submission artifacts. This is a local educational prototype, not a public product, security certification, bank partnership or investment offer.
