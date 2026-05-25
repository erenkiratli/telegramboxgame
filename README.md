# telegramboxgame
# ⚔️ Gold Box Duel — Telegram Mini App

Two players. Two boxes. One holds the gold. Wager TON, pick differently, winner takes 80% of loser's stake.

## Stack
- **Frontend**: Vanilla HTML/CSS/JS (Telegram Mini App)
- **Backend**: Vercel Serverless Functions
- **Database**: Vercel KV (Redis)
- **Blockchain**: TON Testnet

---

## 🚀 Deployment Steps

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/goldboxduel.git
git push -u origin main
```

### 2. Import to Vercel
- Go to https://vercel.com/new
- Import your GitHub repo
- Framework Preset: **Other**
- Leave all other settings as default
- Click **Deploy**

### 3. Add Vercel KV Storage
- In your Vercel project → **Storage** tab
- Click **Create Database** → choose **KV**
- Click **Connect** — env vars are auto-injected ✅

### 4. Set Environment Variables
In Vercel → **Settings** → **Environment Variables**, add:

| Key | Value |
|-----|-------|
| `BOT_TOKEN` | Your token from @BotFather |
| `APP_URL` | `https://your-app.vercel.app` |
| `TON_MNEMONIC` | 24-word mnemonic for your house wallet |
| `HOUSE_WALLET` | Your house wallet address (EQ...) |
| `TON_API_KEY` | (Optional) from https://toncenter.com |

### 5. Register Telegram Bot Webhook
Visit this URL once (replace with your real token):
```
https://your-app.vercel.app/api/setup-webhook?secret=YOUR_BOT_TOKEN
```
You should see: `{"success": true, "message": "Webhook registered at ..."}`

### 6. Register Mini App with BotFather
In Telegram → @BotFather:
```
/newapp
```
- Choose your bot
- App name: Gold Box Duel
- Description: Two players, two boxes, one gold. Wager TON!
- Web App URL: `https://your-app.vercel.app`

### 7. Get Testnet TON
- Install Tonkeeper → switch to **Testnet** mode
- Go to https://t.me/testgiver_ton_bot → send `/start` to get free testnet TON
- Send testnet TON to your **house wallet** (it pays out winnings)

### 8. Redeploy
After setting env vars, go to **Deployments** → **Redeploy** so the functions pick them up.

---

## 🎮 How It Works

```
P1 opens app → connects wallet → picks wager → creates game
                                                    ↓
                              API stores game in Vercel KV
                                                    ↓
                              invite link sent to P2 via Telegram
                                                    ↓
P2 opens link → connects wallet → joins game (same wager)
                                                    ↓
                         Both players choose boxes (must differ)
                                                    ↓
                    Server reveals gold box → determines winner
                                                    ↓
              House wallet sends TON payout to winner automatically
              (winner's stake + 80% of loser's stake)
              (house keeps 20% of loser's stake)
```

---

## 💰 Prize Math Example (10 TON wager)

| | Amount |
|--|--|
| Total pot | 20 TON |
| Winner receives | 10 + 8 = **18 TON** |
| House keeps | **2 TON** |

---

## 📁 File Structure

```
goldboxduel/
├── index.html              ← Game frontend (all screens)
├── vercel.json             ← Routing config
├── package.json            ← Dependencies
├── .env.example            ← Env vars template
└── api/
    ├── bot.js              ← Telegram webhook handler
    ├── create-game.js      ← P1 creates game
    ├── join-game.js        ← P2 joins game
    ├── submit-choice.js    ← Players submit box choices
    ├── resolve-game.js     ← Determine winner + TON payout
    ├── game-status.js      ← Frontend polling endpoint
    ├── setup-webhook.js    ← One-time webhook registration
    └── _ton-utils.js       ← TON wallet helper (internal)
```

---

## 🔜 TON Connect (Replace Demo Wallet)

Replace the `connectWallet()` function in `index.html` with real TON Connect:

```html
<script src="https://unpkg.com/@tonconnect/ui@latest/dist/tonconnect-ui.min.js"></script>
<script>
  const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://your-app.vercel.app/tonconnect-manifest.json'
  });
  async function connectWallet() {
    const wallet = await tonConnectUI.connectWallet();
    walletAddr = wallet.account.address;
    afterConnect();
  }
</script>
```

And create `tonconnect-manifest.json`:
```json
{
  "url": "https://your-app.vercel.app",
  "name": "Gold Box Duel",
  "iconUrl": "https://your-app.vercel.app/icon.png"
}
```
