// api/join-game.js
// Called by frontend when Player 2 stakes and joins
// POST { gameId: "ABC123", p2Wallet: "EQ..." }
// Returns { game } with goldBox hidden from client

const { kv } = require('@vercel/kv');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { gameId, p2Wallet } = req.body;

    if (!gameId || !p2Wallet) {
      return res.status(400).json({ error: 'Missing gameId or p2Wallet' });
    }

    const game = await kv.get(`game:${gameId}`);
    if (!game)                        return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'waiting')    return res.status(400).json({ error: 'Game already started or finished' });
    if (game.p1Wallet === p2Wallet)   return res.status(400).json({ error: 'Cannot play against yourself' });

    // Server decides where the gold is — client never knows until reveal
    const goldBox = Math.random() < 0.5 ? 0 : 1;

    const updatedGame = {
      ...game,
      p2Wallet,
      goldBox,          // stored server-side, NOT sent to client yet
      status: 'active',
    };

    // Keep for 2 hours once active
    await kv.set(`game:${gameId}`, updatedGame, { ex: 7200 });

    // Return game info WITHOUT goldBox — client must not know yet
    const { goldBox: _hidden, ...safeGame } = updatedGame;
    return res.status(200).json({ game: safeGame });
  } catch (err) {
    console.error('join-game error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
