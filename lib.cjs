const fs = require('node:fs');
const path = require('node:path');
const solc = require('solc');
const ganache = require('ganache');
const { BrowserProvider, ContractFactory, id } = require('ethers');

function compile() {
  const source = fs.readFileSync(path.join(__dirname, 'contracts', 'MilestoneWorkflow.sol'), 'utf8');
  const input = { language: 'Solidity', sources: { 'MilestoneWorkflow.sol': { content: source } }, settings: {
    optimizer: { enabled: true, runs: 200 }, evmVersion: 'shanghai',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
  }};
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors || []).filter(e => e.severity === 'error');
  if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
  return out.contracts['MilestoneWorkflow.sol'].MilestoneWorkflow;
}

async function localChain(options = {}) {
  const transport = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 7, deterministic: Boolean(options.dbPath) }, chain: { chainId: 1337, hardfork: 'shanghai' }, ...(options.dbPath ? { database: { dbPath: options.dbPath } } : {}) });
  const provider = new BrowserProvider(transport, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 10;
  const signers = await Promise.all(Array.from({ length: 7 }, (_, i) => provider.getSigner(i)));
  return { transport, provider, signers, close: () => transport.disconnect() };
}

async function deploy(chain, compiled = compile()) {
  const [admin, client, freelancer, arbiter, adapter, outsider] = chain.signers;
  const factory = new ContractFactory(compiled.abi, compiled.evm.bytecode.object, admin);
  const contract = await factory.deploy(await arbiter.getAddress(), await adapter.getAddress());
  await contract.waitForDeployment();
  return { ...chain, contract, admin, client, freelancer, arbiter, adapter, outsider };
}

const send = async tx => (await tx).wait();
async function createMilestone(f, suffix = '') {
  const n = await f.contract.nextId();
  await send(f.contract.connect(f.client).create(await f.freelancer.getAddress(), 120000n, id('fictional-terms' + suffix)));
  return n;
}
async function submitted(f, suffix = '') {
  const n = await createMilestone(f, suffix);
  await send(f.contract.connect(f.adapter).reserve(n, id('fictional-reservation' + suffix)));
  await send(f.contract.connect(f.freelancer).submit(n, id('fictional-evidence' + suffix)));
  return n;
}
module.exports = { compile, localChain, deploy, send, createMilestone, submitted, hash: id };
