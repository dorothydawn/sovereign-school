# Choosing where your videos live

This platform does not host your videos, and does not have an opinion about who
should. You pick a host, you keep your own account with them, and the platform
embeds from it. If you change your mind later, you change one line in
`course.config.ts` and re-point your lessons.

There is no default and no recommendation here on purpose. The right answer
depends on two things only you know: **how many students you expect**, and **how
much you mind people sharing your videos**.

## What it actually costs

Worked at a realistic course — **20 lessons of 15 minutes** (5 hours of video) —
with every student watching the whole thing once.

| Students | YouTube | Vimeo | Bunny | Mux | Cloudflare Stream |
|---|---|---|---|---|---|
| 200 | **$0** | $25/mo | $5.74 | $0.90 | $65 |
| 1,000 | **$0** | $25/mo | $28 | $201 | $305 |
| 5,000 | **$0** | $25/mo | $141 | $1,401 | $1,505 |
| 10,000 | **$0** | $25/mo | $281 | $2,901 | $3,005 |

Two different shapes of pricing are mixed in that table, and the difference
matters more than the numbers:

- **YouTube and Vimeo are flat.** You pay the same whether ten people watch or
  ten thousand. The cost is yours, not per-student.
- **Bunny, Mux and Cloudflare are metered.** The figures above are *per cohort* —
  every new group of students costs that again. They are cheap when you are
  small and they keep climbing.

Mux in particular looks free at small numbers because it gives you 100,000
delivered minutes a month. That runs out at **333 students** finishing a 5-hour
course in a month, and the price after that is steep. Do not let the free tier
pick your host for you.

## What each one protects you from

Cost is only half of it. The other half is whether somebody can take your video
and pass it around.

| Host | Can a student share the video outside your site? | Cost shape |
|---|---|---|
| **YouTube (unlisted)** | **Yes, trivially.** Anyone with the link can watch forever | Free |
| **Vimeo** | No, if you switch on domain-level privacy — the embed only works on your site | Flat |
| **Loom** | Partly — link sharing is the point of the product | Free tier is limited |
| **Bunny** | No — signed links that expire | Metered, cheap |
| **Mux** | No — signed playback tokens | Metered, free then steep |
| **Cloudflare Stream** | No — signed URLs | Metered, pricey |

**Be clear-eyed about YouTube unlisted.** "Unlisted" means it does not show up in
search. It does not mean private. Anyone who can open your lesson page can find
the video's YouTube address in about ten seconds and post it anywhere, and you
will never know. Your paywall protects the *page*, not the *video*.

For a free or cheap course, that is usually fine and the price is unbeatable.
For an expensive course sold to a large audience, it is a real risk that people
tend to discover the hard way.

## How to decide

Answer these in order:

1. **Is your course free, or nearly?** → YouTube. Stop here.
2. **Would you mind if it leaked?** → If not, YouTube. If yes, keep going.
3. **Do you expect more than a few hundred students?** → Vimeo, because flat
   beats metered as soon as you have volume.
4. **Small, paid, and you want it locked down?** → Bunny is the cheapest host
   with real protection.

Whatever you pick, put it in `course.config.ts`:

```ts
courses: [
  { id: 'flagship', /* ... */ videoHost: 'vimeo' },
]
```

Different courses can use different hosts. You are not locked in.

## What each host needs from you

Credentials go in your environment variables, never in `course.config.ts` — that
file is committed to your repository.

| Host | Set these | If you leave them out |
|---|---|---|
| **YouTube** | Nothing | — |
| **Vimeo** | Nothing | — |
| **Loom** | Nothing | — |
| **Bunny** | `BUNNY_LIBRARY_ID`, `BUNNY_TOKEN_KEY` | Without the library id, no video plays and the page says so. Without the token key it plays, but the link can be shared |
| **Mux** | `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_PRIVATE_KEY` | It plays from a public playback id, which anyone can share |
| **Cloudflare Stream** | `CLOUDFLARE_STREAM_CUSTOMER_CODE` | No video plays, and the page says which value is missing |
| **Custom embed** | Nothing | The lesson supplies the whole `https://` URL |

Two of these are worth saying plainly.

**Vimeo's protection is a setting you switch on, not something this platform can
do for you.** The code cannot see whether you have enabled domain-level privacy.
Turn it on in Vimeo, add your site's domain, and check a lesson still plays
afterwards.

**Bunny and Mux fall back to unprotected rather than refusing to play.** A lesson
with a missing signing key still works — it is simply shareable. If you chose
those hosts for the protection, set the keys.

## Prices change

These were checked in September 2026. Providers change pricing; if you are
making a decision with real money attached, check the current rate. The shape of
the comparison — flat versus metered, protected versus open — changes much more
slowly than the numbers do.
