// api/resolve-game.js
// Called after both players have chosen — reveals gold, pays out TON
// Waits for BOTH player payments to confirm on-chain before sending payout

const { Redis } = require('@upstash/redis');
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const TON_API_KEY = process.env.TON_API_KEY || '';
const HOUSE_PCT   = 0.20;
const WINNER_PCT  = 0.80;

// ── Check if a wallet has sent at least `amountTON` to HOUSE_WALLET
// by scanning recent transactions on TON mainnet
async function isPaymentConfirmed(fromWallet, amountTON, afterTimestamp) {
  try {
    const houseWallet = process.env.HOUSE_WALLET;
    const url = `https://toncenter.com/api/v2/getTransactions?address=${houseWallet}&limit=20&api_key=${TON_API_KEY}`;
    const res  = await fetch(url);
    const data = await res.json();

    if (!data.ok || !data.result) return false;

    const amountNano = Math.round(amountTON * 1e9);

    for (const tx of data.result) {
      // Only look at transactions after game was created
      if (tx.utime * 1000 < afterTimestamp) continue;

      const inMsg = tx.in_msg;
      if (!inMsg) continue;

      // Check sender matches and amount is correct (allow small variance for gas)
      const senderMatch = inMsg.source &&
        (inMsg.source === fromWallet ||
         inMsg.source.toLowerCase() === fromWallet.toLowerCase());
      const amountMatch = parseInt(inMsg.value) >= amountNano * 0.99; // 1% tolerance

      if (senderMatch && amountMatch) return true;
    }
    return false;
  } catch (err) {
    console.error('Payment check error:', err);
    return false; // fail safe — don't pay out if we can't verify
  }
}

// ── Wait for payment confirmation with retries
async function waitForPayment(wallet, amount, afterTimestamp, maxRetries) {
  const retries = maxRetries || 10;
  for (let i = 0; i < retries; i++) {
    const confirmed = await isPaymentConfirmed(wallet, amount, afterTimestamp);
    if (confirmed) return true;
    // Wait 3 seconds between checks
    await new Promise(function(r) { setTimeout(r, 3000); });
  }
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { gameId } = req.body;
    if (!gameId) return res.status(400).json({ error: 'Missing gameId' });

    const game = await kv.get(`game:${gameId}`);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // Already resolved — return cached result
    if (game.status === 'resolved') {
      return res.status(200).json({
        winner:          game.winner,
        loser:           game.loser,
        goldBox:         game.goldBox,
        p1Choice:        game.p1Choice,
        p2Choice:        game.p2Choice,
        winnerReceives:  game.winnerReceives,
        housePaid:       game.housePaid,
        txHash:          game.txHash,
        alreadyResolved: true,
      });
    }

    if (game.status !== 'active') return res.status(400).json({ error: 'Game not active' });
    if (game.p1Choice === null || game.p2Choice === null) {
      return res.status(400).json({ error: 'Both players must submit choices first' });
    }

    // ── STEP 1: Verify P1 payment confirmed on-chain ──────────────
    console.log('Checking P1 payment confirmation...');
    const p1Confirmed = await waitForPayment(
      game.p1Wallet,
      game.wager,
      game.createdAt,
      10 // max 10 retries = 30 seconds
    );

    if (!p1Confirmed) {
      return res.status(402).json({
        error: 'P1 payment not confirmed on blockchain yet. Please wait and try again.',
        retryable: true
      });
    }

    // ── STEP 2: Verify P2 payment confirmed on-chain ──────────────
    console.log('Checking P2 payment confirmation...');
    const p2Confirmed = await waitForPayment(
      game.p2Wallet,
      game.wager,
      game.createdAt,
      10 // max 10 retries = 30 seconds
    );

    if (!p2Confirmed) {
      return res.status(402).json({
        error: 'P2 payment not confirmed on blockchain yet. Please wait and try again.',
        retryable: true
      });
    }

    console.log('Both payments confirmed! Sending payout...');

    // ── STEP 3: Determine winner ──────────────────────────────────
    const winner = game.p1Choice === game.goldBox ? game.p1Wallet : game.p2Wallet;
    const loser  = winner === game.p1Wallet ? game.p2Wallet : game.p1Wallet;

    const wagerNano   = BigInt(Math.round(game.wager * 1e9));
    const houseNano   = wagerNano * BigInt(20) / BigInt(100);
    const winnerBonus = wagerNano * BigInt(80) / BigInt(100);
    const winnerTotal = wagerNano + winnerBonus;

    // ── STEP 4: Send payout to winner ─────────────────────────────
    let winnerTx = null;
    try {
      const { sendTon } = require('./_ton-utils');
      winnerTx = await sendTon(winner, winnerTotal);
      console.log('Payout sent:', winnerTx);
    } catch (tonErr) {
      console.error('TON payout error:', tonErr);
      // Mark as resolved anyway to prevent double-payout attempts
      // Manual intervention needed if this fails
    }

    // ── STEP 5: Save resolved game ────────────────────────────────
    const resolved = {
      ...game,
      status:         'resolved',
      winner,
      loser,
      winnerReceives: (Number(winnerTotal) / 1e9).toFixed(2),
      housePaid:      (Number(houseNano) / 1e9).toFixed(2),
      txHash:         winnerTx ? winnerTx.hash : null,
      resolvedAt:     Date.now(),
    };

    await kv.set('game:' + gameId, resolved, { ex: 604800 }); // keep 7 days

    return res.status(200).json({
      winner:         resolved.winner,
      loser:          resolved.loser,
      goldBox:        resolved.goldBox,
      p1Choice:       resolved.p1Choice,
      p2Choice:       resolved.p2Choice,
      winnerReceives: resolved.winnerReceives,
      housePaid:      resolved.housePaid,
      txHash:         resolved.txHash,
    });

  } catch (err) {
    console.error('resolve-game error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
