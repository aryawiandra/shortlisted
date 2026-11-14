# Shortlisted

Landing page and a working demo of an AI coach for Indonesian selection stages (FGD, LGD, interview).

- `index.html` and the legal pages: the pre-sale landing page.
- `demo/`: an immersive selection simulation. An invitation email arrives in a simulated inbox, its link opens a video meeting (lobby, assessor, four AI participants with voices and captions, push-to-talk), and the rapor arrives afterwards as another email. Direction and reasons: [demo/DESIGN.md](demo/DESIGN.md).
- `demo/latihan.html`: timed case drill. The applicant reads one case, writes a recommendation in 120 seconds, and gets 1 to 5 scores for analysis, communication and decision with a quote from their own answer. Costs about one scorer call, which is why the paid plans can include 15 to 35 of them.
- `api/` + `lib/`: serverless functions (`/api/turn`, `/api/score`, `/api/drill`, `/api/status`) and their logic.

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

## Voices

The participants speak with Microsoft's free neural voices (the "Read Aloud" voices built into Edge), served by `GET /api/tts?s=<speaker>&t=<text>` through the `msedge-tts` package (MIT). No key and no cost.

| Speaker | Voice | Why |
|---|---|---|
| Raka | `id-ID-ArdiNeural`, 8% faster | Native Indonesian male; the fast talker |
| Sinta | `id-ID-GadisNeural` | Native Indonesian female |
| Dimas | `en-US-BrianMultilingualNeural`, 6% slower, softer | Distinct calm male voice |
| Ayu | `en-US-EmmaMultilingualNeural` | Distinct warm female voice |
| Ratna (assessor) | `en-US-AvaMultilingualNeural`, 4% slower | Distinct measured female voice |

The multilingual voices read Indonesian with zero errors in a Whisper intelligibility test. Each person has their own voice: the old browser voices were pitch-shifted copies, which is what made them sound robotic.

- Speed: the assessor's script is synthesized while the applicant is in the lobby, replies are fetched as soon as their text arrives, and the server keeps one warm connection per voice. Responses are cacheable at Vercel's edge, so a line spoken once is free and instant afterwards.
- Failure: requests time out after 8 seconds, and after two failures the meeting continues on captions alone. The lobby says which state it is in.
- Caveat: this is an unofficial endpoint and can change without notice. The same voice names exist in Azure Speech, whose free tier (F0) is the official route if needed.
- Limits: `DEMO_TTS_RATE_MAX` (default 200 lines per 10 minutes per IP); `DEMO_ACCESS_CODE` also guards this route.

Other free options checked (Indonesian support, license):

| Project | Indonesian | License note |
|---|---|---|
| k2-fsa/OmniVoice | Yes (about 6,300 hours of training data) | Code Apache-2.0; the model card states no weights license, confirm before commercial use. Needs a GPU. |
| OHF-Voice/piper1-gpl (Piper) | One voice, `id_ID-news_tts-medium` | Engine GPL-3.0; the voice's dataset license is unclear. Runs on CPU and in the browser. |
| facebook/mms-tts-ind | Yes | CC-BY-NC-4.0, so not for commercial use. |
| resemble-ai/chatterbox | Malay only, not Indonesian | MIT. |
| hexgrad/kokoro | No | Apache-2.0. |
| rany2/edge-tts (Python) / msedge-tts (Node) | Yes (Ardi, Gadis, plus multilingual voices) | In use. Unofficial Microsoft endpoint; Azure Speech F0 is the official equivalent. |
| Gemini TTS (Google) | Yes | Very natural, has a free tier, but needs an API key and free-tier input may be used by Google. Not tested here. |

## Payments (pre-sale, Midtrans Snap)

The plan buttons open a short form (name, email, WhatsApp, consent). `POST /api/checkout` validates it, sets the price on the server (`lib/payments.js`, never from the request), and creates a Snap transaction; the buyer pays on Midtrans' hosted page (QRIS, e-wallets, bank transfer, whatever is enabled in the dashboard) and comes back to `terima-kasih.html`. That page asks `GET /api/order?id=` for the status, which asks Midtrans directly, so a forged `?transaction_status=settlement` in the URL changes nothing.

- **Ledger:** the Midtrans dashboard. Nothing is stored here, and there is no webhook yet: add one (with signature check plus a status re-query) when accounts get activated automatically.
- **Env:** `MIDTRANS_SERVER_KEY`, `MIDTRANS_ENV` (`production` for real money, otherwise sandbox), `SITE_URL`. Without a key the buttons say "Segera dibuka" and `/api/checkout` returns 503. A sandbox key with `MIDTRANS_ENV=production` (or the reverse) is refused.
- **Dashboard:** also set the Finish redirect URL to `<SITE_URL>/terima-kasih.html` (Settings > Snap Preferences), and turn on the buyer email receipt.
- **Limits:** 10 checkouts and 60 status checks per IP per 10 minutes.

## Privacy

Nothing is stored. Typed text goes to the demo server only to produce replies. Voice input uses the browser's own speech recognition, so audio never reaches this server. The camera, if turned on in the lobby, only shows on the applicant's own screen.
