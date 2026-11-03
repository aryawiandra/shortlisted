# Shortlisted

Landing page and a working demo of an AI coach for Indonesian selection stages (FGD, LGD, interview).

- `index.html` and the legal pages: the pre-sale landing page.
- `demo/`: a playable LGD session. Pick a case, discuss with four AI participants, get a scorecard.
- `api/` + `lib/`: serverless functions (`/api/turn`, `/api/score`, `/api/status`) and their logic.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:3000  (demo at /demo/)
npm test           # unit tests, Node's built-in runner
```

Useful query parameters on `/demo/`: `?minutes=2` shortens the session, `?read=0` skips the reading time.

## Two modes

| Mode | When | What happens |
|---|---|---|
| Simulation | No `ANTHROPIC_API_KEY` (default) | Rule-based participants and scorecard. No AI calls, no cost. The page says "Mode simulasi". |
| Live AI | `ANTHROPIC_API_KEY` is set | Claude plays the participants and writes the scorecard. If a call fails, the demo falls back to the simulation and says so. |

Copy `.env.example` to `.env` for local runs. On Vercel, set the same names under Project Settings, Environment Variables. Never commit keys.

## Cost and abuse controls (live mode)

- Participants run on `claude-haiku-5-5`, the scorecard on `claude-sonnet-5-5`. Override with `DEMO_PERSONA_MODEL` and `DEMO_SCORER_MODEL`.
- `DEMO_ACCESS_CODE`: when set, every API call needs the code (the demo page asks for it). Use this for anything you share publicly.
- Requests are validated (at most 40 messages, 600 characters each) and rate limited per IP (`DEMO_RATE_MAX`, default 30 per 10 minutes). The limiter is in memory, so it is best-effort on serverless. Also set a monthly spend limit in the Anthropic Console.

## Privacy

Nothing is stored. Typed text goes to the demo server only to produce replies. Voice input uses the browser's own speech recognition, so audio never reaches this server.
