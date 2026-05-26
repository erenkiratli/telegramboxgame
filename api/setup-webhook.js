// api/setup-webhook.js
// Visit this URL once after deploying to register your bot webhook:
// GET https://your-app.vercel.app/api/setup-webhook?secret=YOUR_BOT_TOKEN

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL   = process.env.APP_URL;

module.exports = async function handler(req, res) {
  // Simple auth — pass bot token as ?secret= param so random people can't trigger this
  if (req.query.secret !== BOT_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const webhookUrl = `${APP_URL}/api/bot`;

    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url:             webhookUrl,
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: true,
        }),
      }
    );

    const data = await response.json();

    if (data.ok) {
      return res.status(200).json({
        success: true,
        message: `Webhook registered at ${webhookUrl}`,
        telegram: data,
      });
    } else {
      return res.status(400).json({ success: false, telegram: data });
    }
  } catch (err) {
    console.error('setup-webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
};
