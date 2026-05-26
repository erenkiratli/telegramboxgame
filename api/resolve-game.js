// api/resolve-game.js
// Called after both players have chosen — reveals gold, pays out TON
// POST { gameId }
// Returns { winner, goldBox, winnerReceives, housePaid, txHash }

const { kv } = require('@vercel/kv');

// TON testnet endpoint
const TON_ENDPOINT = 'https://testnet.toncenter.com/api/v2';
const TON_API_KEY  = process.env.TON_API_KEY || ''; // optional but reduces rate limits

const HOUSE_PCT   = 0.20; // 20% of loser's stake → house
const WINNER_PCT  = 0.80; // 80% of loser's stake → winner

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
    if (game.status === 'resolved') {
      // Already resolved — return cached result
      return res.status(200).json({
        winner:         game.winner,
        goldBox:        game.goldBox,
        winnerReceives: game.winnerReceives,
        housePaid:      game.housePaid,
        txHash:         game.txHash,
        alreadyResolved: true,
      });
    }
    if (game.status !== 'active') return res.status(400).json({ error: 'Game not active' });
    if (game.p1Choice === null || game.p2Choice === null) {
      return res.status(400).json({ error: 'Both players must submit choices first' });
    }

    // ── Determine winner ────────────────────────────────────────
    const winner = game.p1Choice === game.goldBox ? game.p1Wallet : game.p2Wallet;
    const loser  = winner === game.p1Wallet ? game.p2Wallet : game.p1Wallet;

    const wagerNano     = BigInt(Math.round(game.wager * 1e9));        // wager in nanoTON
    const houseNano     = wagerNano * BigInt(20) / BigInt(100);        // 20% of loser
    const winnerBonus   = wagerNano * BigInt(80) / BigInt(100);        // 80% of loser
    const winnerTotal   = wagerNano + winnerBonus;                     // own stake + bonus

    // ── Send TON payouts ────────────────────────────────────────
    // In production, your house wallet holds BOTH players' stakes
    // (sent to house wallet via TON Connect during create/join flow).
    // This function then splits and pays out from house wallet.
    //
    // For testnet demo, we send from house wallet directly.
    let winnerTx = null;
    let houseTx  = null;

    try {
      const { sendTon } = require('./_ton-utils');

      // Send winner their payout (own stake + 80% of loser's)
      winnerTx = await sendTon(winner, winnerTotal);

      // House keeps 20% of loser's stake (already in house wallet, no send needed)
      // But we log it for transparency
      houseTx = { kept: houseNano.toString(), note: 'House fee retained in operator wallet' };
    } catch (tonErr) {
      console.error('TON payout error:', tonErr);
      // Don't fail the whole resolve — log and continue
      // In production: add to a retry queue
    }

    // ── Update game record ──────────────────────────────────────
    const resolved = {
      ...game,
      status:         'resolved',
      winner,
      loser,
      winnerReceives: (Number(winnerTotal) / 1e9).toFixed(2),
      housePaid:      (Number(houseNano) / 1e9).toFixed(2),
      txHash:         winnerTx?.hash || null,
      resolvedAt:     Date.now(),
    };
    // Keep resolved games for 7 days for history
    await kv.set(`game:${gameId}`, resolved, { ex: 604800 });

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
