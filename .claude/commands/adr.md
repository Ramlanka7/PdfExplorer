---
description: Record an architecture decision in docs/decisions.md
argument-hint: <the decision, e.g. "use Vite instead of webpack">
---

Record this architecture decision: **$ARGUMENTS**

1. Read `docs/decisions.md` and check whether an existing entry already covers or contradicts this.
   If one does, the new entry must **explicitly supersede** it — append `, superseded by DN` to the
   old entry's date line. Never rewrite or delete the old entry.
2. Take the next `D<n>` and append an entry in the same shape as the others:
   - **Heading:** `### D<n> — <decision in a few words> · *Accepted <YYYY-MM-DD>*`
   - **Body:** the forces that made a decision necessary — facts, not preferences — then the choice
     in active voice. If there was only ever one real option, this doesn't need an entry.
   - **Cost accepted:** what this buys you and what it costs. Be honest; a judgement call recorded
     as a judgement call is more useful later than one that pretends the answer was obvious.
   - **Rules out / Open upgrade / Follow-up:** what a future change would have to supersede, and any
     concrete task this creates.
   Keep it to the length of the existing entries — a screenful, not an essay.
3. Cite the requirement IDs it constrains inline, as the other entries do.
4. If the decision changes `docs/02-architecture.md` or `docs/03-client.md`, edit them in the same
   change. If it bends a rule in `CLAUDE.md`, update that rule too.
