---
name: commit
description: Draft a git commit message that doesn't sound like AI wrote it. Synthesizes anti-slop rules from avoid-ai-writing, voice rules from AI-Vibe-Writing-Skills, and the severity/diff conventions from academic-writing-skills. Invoke with /commit when the user wants to commit staged (or unstaged) changes.
---

# /commit — the no-slop commit message skill

Most AI-written commits are detectable from across the room. Vague verbs, inflated nouns, marketing language, "this commit" preambles, generic closers. Don't write one of those.

A commit message has one reader: someone running `git log` six months from now trying to understand why the diff in front of them exists. Write for that person.

## Procedure

1. Run these in parallel:
   - `git status` — what's staged, unstaged, untracked
   - `git diff --staged` — the actual change to describe
   - `git log -10 --oneline` — the repo's existing tone/format
2. If nothing is staged: show unstaged changes with `git diff`, ask the user what to stage. Don't auto-stage everything.
3. Match the existing log's conventions: Conventional Commits (`feat:`, `fix:`...), gitmoji, lowercase vs sentence case, scope tags. If the repo is new and there's no log yet, default to lowercase imperative without a prefix.
4. Draft the message following every rule below.
5. Show the message in a fenced block. Ask: **"commit this, edit, or rewrite?"** Wait for approval.
6. After approval, `git commit -m "..."`. For multi-line messages use a HEREDOC.
7. Run `git status` after the commit to confirm it landed.

## Subject line rules

- **Imperative mood.** `add X`, `fix Y`, `drop Z`. Not `added`, `adding`, `this adds`.
- **Aim for 50 chars, hard cap 72.** GitHub truncates past that.
- **No trailing period.**
- **Specific verb + specific noun.** `fix login` is bad. `fix race in session refresh` is good.
- **Avoid generic openers**: `update`, `change`, `modify`, `improve`. They say nothing. Pick a verb that names the action: *rename, extract, inline, hoist, swap, drop, gate, debounce, narrow, broaden, port, pin, unpin, stub, wire, unwire, vendor, unvendor, gate, dedupe, batch, unbatch*.

## Body rules

Include a body when the change isn't self-explanatory from the subject + diff. Skip it for typo fixes, formatting, version bumps.

- **Explain *why*, not *what*.** The diff shows what. The body says why this change, why now, what constraint forced this shape.
- **Wrap at 72 chars.**
- **Blank line between subject and body.**
- **Don't restate the subject.** If the subject is `drop legacy auth shim`, the body doesn't open with "This commit drops the legacy auth shim."
- **Issue/PR refs go on their own line at the end.** `Fixes #123`. Not in the prose.

## Banned phrases

These are AI tells. Treat them as compile errors.

| Don't write | Write instead |
|---|---|
| serves as | is |
| leverages, utilizes | uses |
| facilitates, enables | (just name the action: "lets X do Y") |
| comprehensive, holistic, robust, seamless | cut entirely |
| streamline, optimize | name the change: "drop N+1", "cache the lookup" |
| in order to | to |
| due to the fact that | because |
| a number of, various, several | give a count or a list |
| revolutionary, groundbreaking, cutting-edge, state-of-the-art | cut |
| best-in-class, world-class, next-generation | cut |
| unlock, empower, supercharge, accelerate | cut |
| game-changing, paradigm-shifting | cut |
| this commit, this change, this PR | start with the verb |
| basically, essentially, fundamentally | cut (filler) |
| it's worth noting that | just say the thing |
| we should consider, it might be useful to | just do it or don't |

Also forbidden:
- **Chatbot openers** — `Certainly!`, `Sure!`, `Let's...`, `I'll go ahead and...`
- **Sycophantic framing** — `a nice cleanup`, `a great improvement`, `much better now`
- **Numbered lists when prose works** — three trivial bullets read worse than one sentence
- **Em-dash carpet-bombing** — one or two per body, not eight
- **Bold/italic** — `git log` renders plain text; markup turns into literal asterisks
- **Emoji** — unless the existing log already uses them
- **`🤖 Generated with Claude Code` trailer** — leave it off unless the user explicitly asks for attribution
- **`Co-Authored-By:` for the AI** — only humans who actually contributed go there

## Anti-patterns from the source guides

From `conorbronsdon/avoid-ai-writing` and the AI-Vibe review pass:

- **Significance inflation.** `Massively improves performance` → `cuts p95 from 800ms to 120ms`. Numbers beat adjectives.
- **Vague attribution.** `Refactor the auth module` → `extract token refresh into its own service`. Name the unit.
- **Formulaic openings.** Don't open every commit with the same verb. Vary based on what the change actually is.
- **Synonym cycling.** If the thing is `the auth service`, call it `the auth service` every time. Don't drift to `the authentication module` → `the login layer` → `the credentials system`. Repetition isn't a bug here.
- **Sentence-length uniformity.** Vary. Some sentences are short. Others can carry a dependent clause that adds the *why* without earning a new bullet.
- **Copula avoidance.** `The function serves as a wrapper` → `the function wraps X`.
- **False ranges.** `5-10x faster` is suspicious. Give the real number or don't claim one.

## Format examples

**Good** — non-obvious change, body explains why

```
extract token refresh into its own service

session middleware was doing fetch + parse + validate + refresh in
one handler; refresh would silently fail when the parse step threw.
moving refresh to a dedicated worker so we can retry without
re-entering the request path.

Fixes #482
```

**Good** — trivial, no body

```
fix typo in readme
```

**Good** — performance change with a number

```
cache provider lookup in llm router

cuts cold-path latency from 340ms to 12ms; provider table is
read-only at runtime, so a once-per-process map is safe.
```

**Bad** — every AI tell at once

```
🚀 Comprehensive refactor of authentication system

This commit introduces a robust and seamless authentication overhaul
that leverages a modern architecture to facilitate better performance
and a more streamlined user experience. The changes serve as a
foundation for future enhancements and unlock new capabilities for
the platform.

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>
```

Why it's bad — almost everything: the rocket emoji, `comprehensive`, `robust`, `seamless`, `leverages`, `facilitates`, `streamlined`, `serve as`, `unlock`, `this commit`, the unprompted trailer, and a body that doesn't tell the future reader anything the diff doesn't already show.

## Conventional Commits

If the existing log uses Conventional Commits, follow it. The anti-slop rules still apply inside each part.

```
feat(ingest): pull arxiv via the OAI-PMH endpoint
fix(dedupe): handle empty embedding response from voyage
refactor(scoring): move the risk model behind a feature flag
chore: pin pnpm to 9.12.0
docs: add the master plan and license
```

Scopes should match the directory or service the change touches (`ingest`, `dedupe`, `scoring`, `ann-web`, `workers`). Don't invent new scopes per commit — pick from what the log already uses.

## Approval flow

After drafting, print the message inside a fenced block, then ask one question:

> commit this, edit, or rewrite?

Three valid responses:
- **commit / yes / lgtm** → run the commit, then `git status`
- **edit: <new text>** → use exactly the text the user supplies
- **rewrite / try again [with notes]** → draft a new version, ask again

Never auto-commit without an approval signal. The user clicks publish.

## Safety

- Don't `git add -A` or `git add .` — it sweeps in `.env`, credentials, build artifacts. Stage specific paths.
- Never use `--no-verify`, `--no-gpg-sign`, or `-c commit.gpgsign=false` unless the user explicitly asked. If a pre-commit hook fails, fix the underlying issue and create a NEW commit. Don't `--amend` to paper over a hook failure.
- Never `git push` from this skill. Push is a separate decision.
- If the commit you're about to make would include a file matching `.env*`, `*.pem`, `*.key`, `id_rsa*`, `*secret*`, or `*credentials*` — stop and warn the user before proceeding.

## When the user invokes /commit with arguments

- `/commit` — full procedure above.
- `/commit <message>` — use the user's message verbatim as the subject; still run the staging/diff check and warn if their message violates the rules, but defer to the human.
- `/commit --amend` — only if explicitly requested. Otherwise create a new commit.

## What this skill does *not* do

- Doesn't write the code or fix the bug.
- Doesn't run tests.
- Doesn't push.
- Doesn't open a PR. (Use `gh pr create` separately.)
- Doesn't summarize the entire branch. (Use a separate `/pr` skill for that.)

One commit, one message. Keep the scope tight.
