// api/game-status.js
// Frontend polls this every 2s to know when P2 has joined / both chosen
// GET /api/game-status?gameId=ABC123
// Returns safe game state (goldBox is NEVER returned until resolved)

const { Redis } = require('@upstash/redis');
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { gameId } = req.query;
  if (!gameId) return res.status(400).json({ error: 'Missing gameId' });

  try {
    const game = await kv.get(`game:${gameId}`);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // Strip goldBox unless resolved — prevents client-side cheating
    const safe = {
      gameId:    game.gameId,
      wager:     game.wager,
      p1Wallet:  game.p1Wallet,
      p2Wallet:  game.p2Wallet,
      status:    game.status,
      p1Choice:  game.p1Choice,
      p2Choice:  game.p2Choice,
      winner:    game.winner,
      loser:     game.loser,
      createdAt: game.createdAt,
      // Only reveal goldBox and payout details after resolution
      ...(game.status === 'resolved' ? {
        goldBox:        game.goldBox,
        winnerReceives: game.winnerReceives,
        housePaid:      game.housePaid,
        txHash:         game.txHash,
        resolvedAt:     game.resolvedAt,
      } : {}),
    };

    return res.status(200).json(safe);
  } catch (err) {
    console.error('game-status error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
