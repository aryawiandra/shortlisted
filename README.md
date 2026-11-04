# Shortlisted

Landing page and a working demo of an AI coach for Indonesian selection stages (FGD, LGD, interview).

- `index.html` and the legal pages: the pre-sale landing page.
- `demo/`: an immersive selection simulation. An invitation email arrives in a simulated inbox, its link opens a video meeting (lobby, assessor, four AI participants with voices and captions, push-to-talk), and the rapor arrives afterwards as another email. Direction and reasons: [demo/DESIGN.md](demo/DESIGN.md).
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

## Voices

The AI participants speak through the browser's built-in speech synthesis (`demo/voice.js`): free, no download, and good on Edge (natural Indonesian voices) and Android. Where a device has no Indonesian voice, the lobby turns voices off by default and captions carry the meeting. Open-source options checked for a server-side voice later (Indonesian support, license):

| Project | Indonesian | License note |
|---|---|---|
| k2-fsa/OmniVoice | Yes (about 6,300 hours of training data) | Code Apache-2.0; the model card states no weights license, confirm before commercial use. Needs a GPU. |
| OHF-Voice/piper1-gpl (Piper) | One voice, `id_ID-news_tts-medium` | Engine GPL-3.0; the voice's dataset license is unclear. Runs on CPU and in the browser. |
| facebook/mms-tts-ind | Yes | CC-BY-NC-4.0, so not for commercial use. |
| resemble-ai/chatterbox | Malay only, not Indonesian | MIT. |
| hexgrad/kokoro | No | Apache-2.0. |
| rany2/edge-tts | Yes (Ardi, Gadis) | Uses an unofficial Microsoft endpoint: fine for prototypes, not for production. |

## Privacy

Nothing is stored. Typed text goes to the demo server only to produce replies. Voice input uses the browser's own speech recognition, so audio never reaches this server. The camera, if turned on in the lobby, only shows on the applicant's own screen.
