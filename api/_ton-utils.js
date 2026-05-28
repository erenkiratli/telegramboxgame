// api/_ton-utils.js
// Internal TON helper — NOT exposed as an endpoint (prefixed with _)
// Sends TON from the house wallet to a recipient address

const { mnemonicToPrivateKey } = require('@ton/crypto');
const { WalletContractV4, internal, toNano, fromNano, TonClient } = require('@ton/ton');

// TON Mainnet client
const client = new TonClient({
  endpoint: 'https://toncenter.com/api/v2/jsonRPC',
  apiKey: process.env.TON_API_KEY || undefined,
});

// Load house wallet from mnemonic env variable
async function getHouseWallet() {
  const mnemonic = process.env.TON_MNEMONIC;
  if (!mnemonic) throw new Error('TON_MNEMONIC env var not set');

  const mnemonicArr = mnemonic.trim().split(' ');
  if (mnemonicArr.length !== 24) throw new Error('TON_MNEMONIC must be 24 words');

  const keyPair  = await mnemonicToPrivateKey(mnemonicArr);
  const wallet   = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
  const contract = client.open(wallet);

  return { contract, keyPair, wallet };
}

/**
 * Send TON from house wallet to a recipient
 * @param {string} toAddress  — recipient TON wallet address
 * @param {BigInt} amountNano — amount in nanoTON
 * @returns {{ hash: string, amount: string }}
 */
async function sendTon(toAddress, amountNano) {
  const { contract, keyPair } = await getHouseWallet();

  const seqno = await contract.getSeqno();

  const transfer = await contract.sendTransfer({
    secretKey: keyPair.secretKey,
    seqno,
    messages: [
      internal({
        to:    toAddress,
        value: amountNano,
        body:  'Gold Box Duel — Winner Payout',
        bounce: false,
      }),
    ],
  });

  // Wait for confirmation (up to 30s on testnet)
  let confirmed = false;
  for (let i = 0; i < 10; i++) {
    await sleep(3000);
    const currentSeqno = await contract.getSeqno();
    if (currentSeqno > seqno) { confirmed = true; break; }
  }

  return {
    hash:      transfer?.hash?.toString('hex') || 'pending',
    amount:    fromNano(amountNano) + ' TON',
    confirmed,
  };
}

/**
 * Get current house wallet balance (for dashboard/health checks)
 */
async function getHouseBalance() {
  const { contract } = await getHouseWallet();
  const balance = await contract.getBalance();
  return fromNano(balance);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { sendTon, getHouseBalance };
  return fromNano(balance);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { sendTon, getHouseBalance };
