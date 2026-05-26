// api/submit-choice.js
// Called when a player picks a box
// POST { gameId, wallet, choice: 0|1 }
// Returns { waiting: true } or { ready: true } when both have chosen

const { Redis } = require('@upstash/redis');
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { gameId, wallet, choice } = req.body;

    if (!gameId || !wallet || choice === undefined) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    if (choice !== 0 && choice !== 1) {
      return res.status(400).json({ error: 'Choice must be 0 or 1' });
    }

    const game = await kv.get(`game:${gameId}`);
    if (!game)                    return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'active') return res.status(400).json({ error: 'Game not active' });

    const isP1 = game.p1Wallet === wallet;
    const isP2 = game.p2Wallet === wallet;
    if (!isP1 && !isP2) return res.status(403).json({ error: 'Not a player in this game' });

    // Prevent same box — P2 must choose differently from P1
    if (isP2 && game.p1Choice !== null && game.p1Choice === choice) {
      return res.status(400).json({ error: 'Must choose a different box than Player 1' });
    }

    const updated = { ...game };
    if (isP1) updated.p1Choice = choice;
    if (isP2) updated.p2Choice = choice;

    const bothChosen = updated.p1Choice !== null && updated.p2Choice !== null;
    await kv.set(`game:${gameId}`, updated, { ex: 7200 });

    return res.status(200).json({ waiting: !bothChosen, ready: bothChosen });
  } catch (err) {
    console.error('submit-choice error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
