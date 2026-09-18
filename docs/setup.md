# Setting this up

Written for someone who has not done this before. If you have a coding agent,
you can hand it this file and answer its questions as they come.

You will need three accounts. All three have a free tier that is enough to start.

| What | What it does | Cost to start |
|---|---|---|
| **GitHub** | Holds your copy of the code | Free |
| **Vercel** | Runs the website | Free |
| **Neon** | Stores accounts and progress | Free |

Plus a video host, which you choose — see
[choosing a video host](./choosing-a-video-host.md). One of the options is free.

---

## 1. Get your own copy

Your copy is yours. Nothing you do to it affects anyone else, and no update from
us can overwrite it.

Push the folder you were given to a new **private** repository on your GitHub
account. Private matters: this repository will reference your settings, and there
is no reason for it to be public.

## 2. Make a database

Sign up at [neon.com](https://neon.com), create a project, and copy the
connection string it gives you. It starts with `postgresql://`.

That string is a password. Do not put it in `course.config.ts`, do not paste it
into a chat window, and do not commit it. It goes in Vercel's environment
variables in step 4.

[Which Neon plan you want](./choosing-a-neon-plan.md) — the free one is fine for
most people starting out.

## 3. Tell the platform about your course

Open [`course.config.ts`](../course.config.ts). It is the only file you need to
edit, and every setting has a comment explaining it.

At minimum, change:

- `site.name`, `site.tagline`, `site.supportEmail`
- `courses` — the course or courses you are selling
- `productToCourses` — which product from your funnel unlocks which course

Leave `site.url` for now. You get it in the next step.

## 4. Put it online

Go to [vercel.com](https://vercel.com), sign in with GitHub, and import your
repository. When it asks for environment variables, add these:

| Name | Value |
|---|---|
| `DATABASE_URL` | The connection string from step 2 |
| `FUNNEL_SHARED_SECRET` | A long random string. Generate one, keep a copy — your funnel needs the identical value |
| `SESSION_SECRET` | A different long random string |

Deploy. Vercel gives you a URL. Put it in `site.url` in `course.config.ts` — no
trailing slash — and push the change.

To generate a random secret, run `openssl rand -hex 32`, or ask your agent.

## 5. Set up the database tables

```bash
npm run migrate
```

Run once. Safe to run again — it skips anything already applied.

## 6. Connect your funnel

Your funnel needs two things:

- **The address:** `https://your-site.com/api/enrol`
- **The shared secret:** the same `FUNNEL_SHARED_SECRET` from step 4

When somebody buys, the funnel calls that address and the platform enrols them.

## 7. Check it actually works

Do not skip this, and do not accept "the tests pass" as an answer. Tests prove
the code agrees with itself. They do not prove your deployment works.

Buy your own course, with a real payment, at the real price. Then check that:

1. You land on a thank-you page with a way into the course
2. You can get in, and the course is there
3. **A video plays** — the most common setup mistake is a video host that is not
   configured to allow your domain
4. Ticking a lesson complete survives a page refresh

Refund yourself afterwards.

---

## If something is wrong

**A video does not play.** Almost always the video host blocking your domain.
Check your host's privacy or embed settings and add your Vercel URL.

**Somebody paid and has no access.** Check your funnel is sending a product id
that appears in `productToCourses`. If it is not, the purchase is still recorded
— add the mapping and their access appears, with nothing to re-send.

**The site is suddenly erroring for everyone.** Check Neon. If you are on the
free plan and used up the month's compute, the database suspends until the next
cycle. See [choosing a Neon plan](./choosing-a-neon-plan.md).
