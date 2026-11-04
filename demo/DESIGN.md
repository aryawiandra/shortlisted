# Demo direction

Direction from the founder (4 Nov 2026): the demo should feel like the applicant really got an email. An invitation email arrives, the link in it opens the meeting, and the rapor arrives later as another email in the same inbox. Apple style, as immersive as possible.

**Design Read:** an immersive product demo (simulated laptop: inbox, then video meeting, then results email) for Indonesian fresh graduates preparing for selection, in an Apple-style interface language (native mail app, video-call app) inside Shortlisted's yellow brand world. Dials **ENERGY 2 / RHYTHM 2 / MOTION 2**.

## Flow

1. **Intro sheet**: name, then "Mulai simulasi". One sentence sets the scene; the fine print says everything is fictional and nothing is stored.
2. **Inbox**: two older emails are already there. The Arunika Energi invitation arrives live: a notification banner plus a chime, and the row slides into the list. A second invitation (Rinjani Finansial, the other case) sits unread from yesterday.
3. **Invitation email**: the schedule block and a "Gabung meeting" link. The link is the only way into the product.
4. **Lobby**: self-view (camera only if the applicant turns it on), name, voice and caption toggles, and the meeting passcode when the server requires one.
5. **Meeting**: the assessor opens, shares the case for the reading time, then four AI participants discuss with the applicant. Voices come from the browser's speech synthesis, with captions. The applicant holds the mic button (or Space) to talk, or types.
6. **After the meeting**: the window closes back toward the email it came from. The inbox checks for mail, then the rapor email arrives from Shortlisted, with a notification. It holds the radar, the tiers, and quotes from the applicant's own words.

## Decisions (one line each, R-31)

- **System font for the simulated OS**: the inbox and meeting must feel native to the device the applicant is holding.
- **Bricolage Grotesque only on Shortlisted's own surfaces** (intro sheet, meeting app name, rapor email): the brand appears where the product speaks, not where the fiction does.
- **Palette**: brand yellow and night (identity), plus link blue `#0066CC` for links and unread dots (mail convention, 5.6:1 on white). Red marks only leave and recording.
- **Light inbox, dark meeting**: video-call apps use dark surfaces so faces and captions read; the inbox stays light like a real mail app.
- **Wallpaper in brand yellow**: the one identity motif that ties the fictional laptop to Shortlisted.
- **Glass on one surface only, the notification banner**: it floats over the inbox while it changes beneath it (R-10). The meeting control bar sits below the stage, not over it, so it stays solid.
- **Initials avatars for every person and company**: honest placeholders, no invented faces or logos (R-23).
- **Fictional companies with `.test` addresses** and a visible "Simulasi" label in the menu bar: immersive, never mistakable for a real recruiter.

## Motion language

- Personality: calm and premium. Signature curve `cubic-bezier(0.32, 0.72, 0, 1)` for 80% of motion; exits use `cubic-bezier(0.4, 0, 1, 1)` and are about 30% shorter.
- Durations: quick 160 ms (press, hover), standard 360 ms (banners, rows, sheets), slow 560 ms (the meeting window opening from the link).
- Spatial rule: things leave the way they came. The meeting window grows out of the "Gabung meeting" button and shrinks back to it. Banners enter from the right and leave to the right.
- Three layers: primary (the window or banner), secondary (the new row's highlight fading, the speaking ring), ambient (the wallpaper dims when the meeting opens). Nothing loops unless it marks a real state: the speaking bars move only while someone is speaking.
- Reduced motion: every move becomes a 160 ms cross-fade, and the speaking bars hold still.
- Sound: one soft chime when an email arrives and one tone when you join, on the same frame as the visual. Nothing else.
