# Setting this up

Written for somebody who has not done this before. If you have a coding agent,
hand it this file and answer its questions as they come.

You need three accounts, plus somewhere to put your videos. All of them have a
free tier that is enough to start.

| What | What it does | Cost to start |
|---|---|---|
| **GitHub** | Holds your copy of the code | Free |
| **Vercel** | Runs the website | **$20/month — see below** |
| **Neon** | Stores accounts, progress and comments | Free |
| **A video host** | Holds your lessons | Free, or from $12/mo |

---

## 1. Get your own copy

Your copy is yours. Nothing you do to it affects anyone else, and no update from
us can overwrite it.

Push the folder you were given to a new **private** repository on your GitHub
account. Private matters: this repository will reference your settings, and there
is no reason for it to be public.

## 2. Make a database

Sign up at [neon.com](https://neon.com), create a project, and copy the
connection string. It starts with `postgresql://`.

That string is a password. Do not put it in `course.config.ts`, do not paste it
into a chat window, and do not commit it. It goes into Vercel in step 5.

[Which Neon plan](./choosing-a-neon-plan.md) — the free one suits most people
starting out, and the platform will warn you before it runs out.

## 3. Tell the platform about your course

Open [`course.config.ts`](../course.config.ts). It is the only file you need to
edit, and every setting has a comment explaining it.

At minimum, change:

- `site.name`, `site.tagline`, `site.supportEmail`
- `courses` — the course or courses you are selling, and which video host each uses
- `productToCourses` — which product from your funnel unlocks which course
- `email.from` — the address your emails come from

Leave `site.url` for now. You get it in step 5.

## 4. Generate two secrets

Run this twice and keep both results:

```bash
openssl rand -hex 32
```

One becomes `SESSION_SECRET`, the other `FUNNEL_SHARED_SECRET`. If you have no
terminal, ask your agent to generate them.

**Do not change `SESSION_SECRET` later.** Changing it signs every student out
and invalidates any sign-in or claim link that has not been used yet.

## 5. Put it online

Go to [vercel.com](https://vercel.com), sign in with GitHub, and import your
repository. When it asks for environment variables, add these.

### Always needed

| Name | Value |
|---|---|
| `DATABASE_URL` | The connection string from step 2 |
| `SESSION_SECRET` | The first secret from step 4 |
| `FUNNEL_SHARED_SECRET` | The second one. Your funnel needs the identical value |
| `OWNER_EMAIL` | **Your** email address — see below |

`OWNER_EMAIL` is how the platform knows which account is yours. It is the only
account that can moderate comments or see the page showing what needs your
attention. Without it nobody is the owner and neither of those exists. You do
not have to buy your own course; signing in with that address is enough.

### For sending email

Sign-in links and your own alerts go out this way. Pick one — see
[choosing an email sender](./choosing-an-email-sender.md).

| If `email.provider` is | Set these |
|---|---|
| `gmail` | `GMAIL_USER`, `GMAIL_APP_PASSWORD` |
| `resend` | `RESEND_API_KEY` |
| `smtp` or `ses` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` |

The Gmail app password is **not** your normal Gmail password. You generate it in
your Google account security settings, under app passwords.

### For your video host

Only the one you chose. See [choosing a video host](./choosing-a-video-host.md).

| Host | Set these | Notes |
|---|---|---|
| `youtube`, `vimeo`, `loom`, `custom-embed` | *Nothing* | The lesson's video id is all that is needed |
| `bunny` | `BUNNY_LIBRARY_ID`, and `BUNNY_TOKEN_KEY` to stop links being shared | Without the token key the video plays but can be passed around |
| `mux` | `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_PRIVATE_KEY` for signed playback | Without them it plays from a public playback id |
| `cloudflare-stream` | `CLOUDFLARE_STREAM_CUSTOMER_CODE` | |

Deploy. Vercel gives you a URL — put it in `site.url` in `course.config.ts`, with
no trailing slash, and push.

## 6. Set up the database tables

```bash
npm run migrate
```

Run it once. It is safe to run again — it skips anything already applied, and it
runs on every deploy.

## 7. Connect your funnel

Your funnel needs two things:

- **The address:** `https://your-site.com/api/enrol`
- **The shared secret:** the same `FUNNEL_SHARED_SECRET` from step 5

When somebody buys, the funnel calls that address and the platform enrols them.

## 8. Add your lessons

Lessons are Markdown files in `content/<your course's contentDir>/`:

```markdown
---
title: Getting started
video: dQw4w9WgXcQ
---

The lesson, written in Markdown.
```

The number at the front of the filename sets the order — `01-`, `02-`, `03-`.
The `video` value is whatever your host calls its id: a YouTube id, a Vimeo id,
a Bunny guid, a Mux playback id, or for `custom-embed` the whole embed URL.

A lesson can name its own `videoHost` to override the course's, so a free
preview can sit on YouTube while the rest stays somewhere private.

Two placeholder lessons ship in `content/flagship/`. Delete them.

## 9. Check it actually works

Do not skip this, and do not accept "the tests pass" as an answer. Tests prove
the code agrees with itself. They do not prove your deployment works.

Buy your own course, with a real payment, at the real price. Then check:

1. You land on a thank-you page with a way into the course
2. You can get in, and the course is there
3. **A video plays** — the commonest setup mistake is a video host that has not
   been told to allow your domain
4. Ticking a lesson complete survives a page refresh
5. Signing out and back in with a link or password works
6. `/owner` opens for you and shows your own page

Refund yourself afterwards.

---

## If something is wrong

**A video does not play.** Almost always the host blocking your domain. Check
your host's privacy or embed settings and add your Vercel URL.

**`/owner` shows "not found".** `OWNER_EMAIL` does not match the address you
signed in with. They must be the same, and capitals do not matter.

**No emails arrive.** Check the variables for your provider are set. The logs say
exactly which one is missing. Free tiers also stop at about 100 emails a day —
see [choosing an email sender](./choosing-an-email-sender.md).

**Somebody paid and has no access.** Check your funnel is sending a product id
that appears in `productToCourses`. If it is not, the purchase is still recorded
and shows on `/owner` — add the mapping and their access appears, with nothing
to re-send.

**The site is suddenly erroring for everyone.** Check Neon. If you are on the
free plan and used up the month's compute, the database suspends until the next
cycle. The platform warns you at 70% and 90% before that happens.

**Everyone got signed out at once.** `SESSION_SECRET` changed. Put the original
value back if you still have it.
