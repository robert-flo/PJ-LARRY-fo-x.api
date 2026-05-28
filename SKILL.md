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
x mentions                           # your mentions   (needs user token)
x bookmarks                          # your bookmarks  (needs user token)
x status                             # which providers are live (no secrets)
```

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
- The API token lives in the environment (`X_API_BEARER_TOKEN`). **Never** read,
  print, echo, or pass it as a flag. `x` never emits it; keep it that way.
- Never ask the user to paste their token into chat. If `x status` says a
  provider isn't ready, tell the user to set the env var themselves.

## Providers
- `--provider official` (default): paid X API, stable, legit.
- `--provider cookie`: free reads via a local `twitter-cli` (must be installed
  + logged in); ToS-grey and can break — opt-in only.
- `--provider auto`: prefer free cookie reads if available, else official.
