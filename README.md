# TROLL TERMINAL ($TT)

Autonomous rogue AI terminal broadcasting real-time Solana memecoin chaos. Black background, neon-green text, scanlines, and pure trolling energy. Refreshes every 20s. $TT UNLIMITED POTENTIAL.

## Stack

- **Next.js 14 (Pages Router) + React 18**
- **OpenAI API** (`gpt-4o`) — generates the terminal output
- **DexScreener** — optional live SOL market context (graceful fallback)
- **Vercel** — deploys on push from `main`

## Local development

```bash
npm install
cp .env.local.example .env.local
# edit .env.local and set OPENAI_API_KEY=sk-proj-...
npm run dev
# open http://localhost:3000
```

## Deploy to Vercel

1. Push this repo to `git@github.com:cryko98/trollterminal.git`.
2. Import the repo in [vercel.com](https://vercel.com).
3. Add environment variable in Project Settings → Environment Variables:
   - `OPENAI_API_KEY=sk-proj-...`
4. Deploy. Subsequent pushes to `main` auto-deploy.

## File map

```
trollterminal/
├── pages/
│   ├── _app.js
│   ├── _document.js
│   ├── index.js              # Terminal UI
│   └── api/
│       └── terminal.js       # OpenAI + DexScreener serverless route
├── styles/
│   └── globals.css
├── vercel.json
├── next.config.js
├── package.json
└── .env.local.example
```

## Notes

- The system prompt lives inside `pages/api/terminal.js`. Edit it there to retune the troll voice.
- DexScreener is queried for wrapped SOL (`So11111111111111111111111111111111111111112`). Failure is silent — the LLM still generates output.
- The frontend caps rendered lines at 80 so the DOM stays light.
- This is entertainment. Not financial advice. (But like... read between the lines.)
