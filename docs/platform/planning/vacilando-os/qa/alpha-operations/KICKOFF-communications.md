# Next-session kickoff prompt — Vacilando Alpha Operations: Communications

Paste the block below into a **fresh Claude session** to begin Day 1 of Alpha Operations. Do not run it in this session.

---

```
Vacilando Alpha Operations — Communications

Vacilando Alpha is promoted, validated, and reset to a clean operating state. This
is no longer discovery, architecture, or a staged demo. Vacilando is now the
PRIMARY interface for this engineering work. Claude, Cursor, worktrees, branches,
servers, and terminals are execution infrastructure BENEATH it.

Environment (reconcile before acting; do not assume):
- Sanctioned worktree: /Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def
  (branch agent/claude/6-vacilando-os-product-def, clean, synced to origin/staging).
- Server: Vacilando on http://localhost:3020 (restart from scripts/local-dev with
  node22 if needed: `node lib/vacilando-server.mjs --port 3020`). Data at
  ~/.local/state/alloy-dev/vacilando/. The Director inbox is empty; 7 capabilities
  are available (incl. Communications and Scheduling).

The work: operate ONE real capability — Communications — entirely through Vacilando,
and collect evidence of where the operating EXPERIENCE succeeds or creates friction.
The Communications implementation result matters less than the operating evidence.

Do this, through Director, in Vacilando:
1. Begin from the clean Director workspace (http://localhost:3020/#/director).
2. Open or initiate Communications through Director (name the work; let Director prepare).
3. Let Director surface the V1-versus-V2 frontier (Communications is a "V2" with no V1
   on record). Do not let it be buried.
4. Resolve the Shared Understanding WITH the operator: decide the V1-vs-V2 question
   honestly before proceeding — record the decision through the conversation.
5. Start work ONLY after the operator approves the direction (readiness is the
   operator's judgment, informed by Director).
6. Monitor the work THROUGH Vacilando — the operational band (state, progress =
   what changed, needs-you). Watch it in the Director workspace.
7. Do NOT open the provider console/terminal/branch unless Vacilando FAILS to give
   you what you need.
8. Treat EVERY required escape from Vacilando as an Operational Learning observation.
   Record it in docs/platform/planning/vacilando-os/qa/alpha-operations/FRICTION-LOG.md,
   product-centered ("Vacilando did not show X, so I had to…"), never about the person.
9. Review the completed work THROUGH Director (the assembled review: what changed,
   evidence vs. acceptance, risks, recommendation).
10. Accept and close the work THROUGH Vacilando (Accept, then Close).
11. Report TWO things separately: (a) the Communications implementation result, and
    (b) the operating experience — where Vacilando helped, where it created friction,
    and every escape you had to make.

Governance: do not push, merge, tag, or promote to staging without explicit
authorization. Local commits are fine. If the frozen architecture and runtime
reality conflict, stop and report rather than hiding it.

Rule of the day: engineering work begins in Vacilando. Every time you have to leave
it, that is the product's next lesson — capture it.
```

---

## Notes for whoever runs it
- **Recommended second capability:** Scheduling — its low confidence and thin support exercise the weak-support path (a different operating experience than Communications' clear frontier). Do not start it automatically; the operator chooses.
- **Do not** build the Operational Learning runtime, telemetry, a dashboard, or an automatic nightly reflection during Day 1. The goal is trustworthy evidence, captured by hand in the friction log.
