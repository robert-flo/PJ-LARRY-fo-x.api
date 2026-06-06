---
name: x
description: X (Twitter) research specialist. USE WHEN you need to check what people on X are actually saying about a topic, tool, framework, error, or approach right now — real-world builder signal, pain points, workarounds, debates. Callable as the `x` command. AI-first, structured output.
---

# x — X Research Specialist

`x` is a local command that turns a natural-language research intent into
high-signal reconnaissance on X.com and returns **structured, scored, cited**
results. You (the calling AI) translate the user's need into one `x` call,
then read the JSON back and reason over it.

## When to reach for it

Use `x` whenever the work would benefit from "what is the world actually
saying on X about this?" — e.g. vetting an approach, finding real-world
experiences with a tool/framework, surfacing pain points or workarounds,
checking sentiment on a release, or comparing docs-vs-reality.

## The one call you'll make most

```
x research "<natural-language intent>" --compact --max-cost 0.50
```

- `research` runs a *portfolio* of queries (overview, pain points, wins,
  debate, wide net), dedups, scores each post for signal, and returns
  clusters + top posts + top voices + a raw list. This is the star command.
- `--compact` = token-lean output (drops raw posts, truncates text). Use it
  by default; switch to `--json` (full) only when you need every field.
- `--max-cost <USD>` = hard budget guard. The run refuses if the estimate
  exceeds it. Always set this for unattended calls.

### Translate intent → flags
- Add `--context "<what the current project is about>"` to bias scoring toward
  posts relevant to your work.
- Add `--since 24h` / `--since 7d` to bound recency (max 7 days — see limits).
- Add `--accounts a,b,c` to target specific @handles.
- Add `--queries 3` to go cheaper/faster, `--max-posts 120` to go deeper.

## Preview cost before spending (no creds needed)
```
x cost "<intent>"                 # upper-bound $ estimate
x research "<intent>" --dry-run   # same, in the research flow
```

## Lower-level commands
```
x search "<raw X query or phrase>"   # single query; supports X operators
x timeline <@handle>                 # a user's recent posts (scored)
x user <@handle>                     # profile lookup
x mentions                           # your mentions   (needs `x auth`)
x bookmarks                          # your bookmarks  (needs `x auth`)
x auth                               # one-time OAuth2 login to enable owned reads
x status                             # which providers are live (no secrets)
```

## Owned-account reads (your bookmarks & mentions)

`x bookmarks` and `x mentions` read the authenticated user's OWN account, which
needs an OAuth2 user-context token, not just the app bearer. Set it up once:

```
x auth        # opens an OAuth2 PKCE flow; approve in a browser, paste the redirect back
```

- Requires `X_API_CLIENT_ID` in `~/.config/x-api/env` (from console.x.com → your
  app → User authentication settings → OAuth 2.0; a Native App / public client
  works with PKCE and no secret; register callback `http://127.0.0.1/callback`).
- Scopes requested: `tweet.read users.read bookmark.read offline.access`.
- Durable: the access token (~2h life) **auto-refreshes** via a stored refresh
  token, so owned reads keep working without re-login. Tokens are never printed.
- `x auth` must be run by a human in a TTY (the browser approval can't be automated).
- NOT available: likes/favorites (X API doesn't expose them) and DMs (no scope).
- Owned reads cost ~$0.001 each. `x status` shows whether they're enabled.

## Output contract (stable)
- Default output is **JSON** to stdout; diagnostics go to stderr.
- `research` returns: `intent, provider, postsConsidered, cost,
  signalBreakdown {pain,win,question,neutral}, clusters[], topVoices[],
  topPosts[], rawPosts[]`. Analysis (clusters/topPosts/topVoices) is kept
  separate from raw material (rawPosts).
- Every post carries `id` + `url` so you can cite it directly.
- `--md` gives a human-readable report; `--yaml` for YAML; `--compact` for
  minimal JSON.

## Cost & limits (2026 pay-per-use)
- Post reads cost **$0.005** each (owned reads $0.001); the `cookie` provider
  reads are **free**. A typical `research` run is well under $0.50.
- Search is limited to the **last 7 days** (no full archive on this tier).
- Reads dedup within a 24h UTC window, so the real cost is the unique-post
  count, not the upper-bound estimate.

## Secrets — hard rules
- All tokens live in the environment / `~/.config/x-api/env`: the app
  `X_API_BEARER_TOKEN`, and (for owned reads) `X_API_CLIENT_ID` plus the
  `x auth`-managed `X_API_ACCESS_TOKEN` / `X_API_REFRESH_TOKEN`. **Never** read,
  print, echo, or pass any of them as a flag. `x` never emits them.
- Never ask the user to paste a token into chat. If `x status` says a provider
  isn't ready, tell the user to set the env var or run `x auth` themselves.

## Providers
- `--provider official` (default): paid X API, stable, legit.
- `--provider cookie`: free reads via a local `twitter-cli` (must be installed
  + logged in); ToS-grey and can break — opt-in only.
- `--provider auto`: prefer free cookie reads if available, else official.
