# Daftari Concierge

A private tool for a **2-week concierge test**. Before we build a WhatsApp bot, we check that small Tanzanian sellers will keep
sending voice notes or texts about their sales and spending.

To the seller it feels like a bot. In reality the founder:

1. receives the voice note or text on a WhatsApp Business number,
2. pastes or uploads it here, and Gemini turns it into records,
3. checks and confirms each record,
4. sends the evening summary in Swahili with one tap (it opens WhatsApp with the message ready),
5. watches the **Score** screen. The test passes if **at least 5 of 10 sellers are still sending at day 14** without reminders.

This is not the product. It's a measuring instrument and it is **not production software**.

## How data is handled

| What | Where |
|---|---|
| Traders, consent (time, version, purpose), confirmed records | Only in the founder's browser (`localStorage`) on one device |
| Message text, transcripts, voice notes | **Not stored.** Held in memory while being checked, then discarded |
| Each message being read | Sent to Google's Gemini API (outside Tanzania) |
| Gemini API key | Only in the founder's browser. Never in the code or the build (CI fails if a key appears in the bundle) |
| Analytics, trackers, external fonts | None |

Because nothing is stored on a server, anyone who opens the public page sees an empty tool. The risk is the founder's own phone: if it's
lost or the browser data is cleared, the data is gone. **Use Settings → Backup every evening.**

Data-subject requests: **Traders → Export JSON/CSV** gives one trader their data, and **Traders → Delete** removes the trader and all their records.

## Setup (all free)

1. Get a Gemini API key from Google AI Studio. In Google Cloud, restrict the key to the Generative Language API.
2. Turn on GitHub Pages: repo **Settings → Pages → Source: GitHub Actions**. Every push to `main` then tests, builds and deploys.
3. Open the site on your phone, then go to **Settings**: paste the key and your contact for data questions.
4. **Traders → Add**: send the consent message, and add the trader only after they reply `NAKUBALI`.

## Develop

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # unit tests (amount reader, validation, summaries, scoreboard, export/delete)
npm run build
GEMINI_API_KEY=... npm run eval   # live: 30 real-style phrases against Gemini, must pass >= 90%
```

The model is set in `src/lib/gemini.ts` (`DEFAULT_MODEL`, default `gemini-flash-latest`) and can be changed in Settings.
