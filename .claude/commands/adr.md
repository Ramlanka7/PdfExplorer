---
description: Record an architecture decision in docs/decisions.md
argument-hint: <the decision, e.g. "use Vite instead of webpack">
---

Record this architecture decision: **$ARGUMENTS**

1. Read `docs/decisions.md` and check whether an existing entry already covers this choice. If one
   does and the reasoning changed, edit that entry in place — this file isn't append-only, git
   history already keeps the old version. Add a new entry only for a genuinely new choice.
2. Add (or edit) a section in the same shape as the others:
   - **Heading:** the decision in a few words, no numbering.
   - **Body:** the forces that made a decision necessary — facts, not preferences — then the choice
     in active voice. If there was only ever one real option, this doesn't need an entry.
   - **Cost:** what this buys you and what it costs, folded into a short paragraph. Be honest; a
     judgement call recorded as a judgement call is more useful later than one that pretends the
     answer was obvious.
   Keep it to the length of the existing entries — a few sentences, not an essay.
3. If the decision changes `docs/02-architecture.md` or `docs/03-client.md`, edit them in the same
   change. If it bends a rule in `CLAUDE.md`, update that rule too.
