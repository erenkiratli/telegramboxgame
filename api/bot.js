// api/bot.js
// Telegram webhook — receives all bot messages/commands
// Set webhook URL to: https://your-app.vercel.app/api/bot

const { Redis } = require('@upstash/redis');
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL   = process.env.APP_URL;

async function sendMessage(chatId, text, replyMarkup = null) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function answerCallbackQuery(callbackQueryId, text = '') {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Gold Box Duel Bot OK');

  try {
    const update = req.body;

    // ── Handle /start command ──────────────────────────────────
    if (update.message) {
      const msg    = update.message;
      const chatId = msg.chat.id;
      const text   = msg.text || '';

      // /start with a game invite: /start join_GAMEID
      if (text.startsWith('/start join_')) {
        const gameId = text.replace('/start join_', '').trim();
        const game   = await kv.get(`game:${gameId}`);

        if (!game) {
          await sendMessage(chatId, '❌ Game not found or already started.');
          return res.status(200).send('ok');
        }
        if (game.status !== 'waiting') {
          await sendMessage(chatId, '⚠️ This game has already started or finished.');
          return res.status(200).send('ok');
        }

        await sendMessage(chatId,
          `⚔️ <b>You've been challenged!</b>\n\n` +
          `💎 Wager: <b>${game.wager} TON</b>\n` +
          `🏆 Win and receive: <b>${(game.wager + game.wager * 0.8).toFixed(1)} TON</b>\n\n` +
          `Tap below to join and stake your TON!`,
          {
            inline_keyboard: [[{
              text: `🛡️ Join Game — Stake ${game.wager} TON`,
              web_app: { url: `${APP_URL}?join=${gameId}` }
            }]]
          }
        );
        return res.status(200).send('ok');
      }

      // Plain /start — show main menu
      if (text.startsWith('/start')) {
        await sendMessage(chatId,
          `🪙 <b>Gold Box Duel</b>\n\n` +
          `Two players. Two boxes. One holds the gold.\n` +
          `Pick differently — the one who finds gold wins!\n` +
          `Fastest game to make money. Make money in 2 seconds!\n\n` +
          `💎 Wagers: 5 · 10 · 25 · 50 · 100 TON\n` +
          `🏆 Winner gets: own stake + 80% of loser's\n` +
          `🏛 House fee: 20% of loser's stake\n\n` +
          `Tap below to play on TON Testnet:`,
          {
            inline_keyboard: [[{
              text: '⚔️ Open Gold Box Duel',
              web_app: { url: APP_URL }
            }]]
          }
        );
        return res.status(200).send('ok');
      }
    }

    res.status(200).send('ok');
  } catch (err) {
    console.error('Bot webhook error:', err);
    res.status(200).send('ok'); // always 200 to Telegram
  }
};
