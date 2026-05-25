// api/create-game.js
// Called by frontend when Player 1 locks their wager
// POST { wager: 10, p1Wallet: "EQ..." }
// Returns { gameId, inviteLink }

const { kv } = require('@vercel/kv');

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL   = process.env.APP_URL;

// Generate a short random game ID
function makeGameId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

module.exports = async function handler(req, res) {
  // CORS headers — needed for browser fetch from Mini App
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { wager, p1Wallet } = req.body;

    // Validate wager
    const VALID_WAGERS = [5, 10, 25, 50, 100];
    if (!VALID_WAGERS.includes(Number(wager))) {
      return res.status(400).json({ error: 'Invalid wager amount' });
    }
    if (!p1Wallet || typeof p1Wallet !== 'string') {
      return res.status(400).json({ error: 'Missing p1Wallet' });
    }

    // Create game record
    const gameId = makeGameId();
    const game = {
      gameId,
      wager:      Number(wager),
      p1Wallet,
      p2Wallet:   null,
      status:     'waiting',      // waiting | active | resolved
      goldBox:    null,           // set when P2 joins (server decides)
      p1Choice:   null,
      p2Choice:   null,
      winner:     null,
      createdAt:  Date.now(),
      resolvedAt: null,
    };

    // Store in KV — expire after 30 minutes if P2 never joins
    await kv.set(`game:${gameId}`, game, { ex: 1800 });

    // Build invite link: deep-links into bot with game ID
    const inviteLink = `https://t.me/${await getBotUsername()}?start=join_${gameId}`;

    return res.status(200).json({ gameId, inviteLink });
  } catch (err) {
    console.error('create-game error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Cache bot username so we don't call getMe every time
let _botUsername = null;
async function getBotUsername() {
  if (_botUsername) return _botUsername;
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
  const d = await r.json();
  _botUsername = d.result.username;
  return _botUsername;
}
