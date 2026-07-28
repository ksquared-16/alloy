# Phase 7 — slot 4 session handoff (QA → Slice 3)

Paste the block below to start a fresh session on this same slot.

---

Continue the Phase 7 Document-to-Packet mission on the EXISTING managed slot 4. Do not bootstrap a new slot; do not push/merge/rebase without my explicit say-so.

**Environment (confirm first):**
- Canonical root: `/Users/Kelly/Alloy`. Toolkit commands live at `/Users/Kelly/bin/alloy-dev/` (add to PATH if `alloy-*` "command not found": `export PATH="/Users/Kelly/bin/alloy-dev:$PATH"`).
- Slot 4 worktree: `/Users/Kelly/Code/alloy-worktrees/wt4-phase7-slice3-participant-runtime`
- Branch: `agent/claude/4-phase7-slice3-participant-runtime` (off staging, which now CONTAINS promoted Slice 1+2 AND the import-dialog z-fix — PR #252, merge `a2b20f373`).
- Dev server: slot 4, port 3014, http://localhost:3014. **GOTCHA: the server needs Node ≥20; the toolkit shell may default to Node 16 and fail with "Node.js version >=20.9.0 is required."** Always start it with Node 22 on PATH:
  `export PATH="/Users/Kelly/.nvm/versions/node/v22.21.1/bin:/Users/Kelly/bin/alloy-dev:$PATH" && alloy-dev-start wt4-phase7-slice3-participant-runtime`
- Auth for browser QA: log in as admin at :3014 (the in-app browser pane can't hold the operator Supabase session; Playwright certs use `playwright/helpers/adminSessionAuth.ts` with service-role env from `/Users/Kelly/Alloy/web/.env.local`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3014`, run with Node 22).

**State so far:**
- Slice 1 (governed OCR document→published form) + Slice 2 (packet composition + requirement responsibility) are COMPLETE, CERTIFIED, and **PROMOTED to origin/staging** (PR #251, merge `8179a246f`).
- QA in progress. One QA bug fixed and **MERGED TO STAGING** (PR #252, merge `a2b20f373`, fix commit `395026bf8`): the Processing import dialogs opened BEHIND the BOS modal shell — `ProcessingAlloyDialog` was `z-[80]` vs the shell's panel `z=97` (raised to `z-[110]`; fixes all 7 nested Processing dialogs). **RE-VERIFY:** open Processing → Overview "Import document" tile ("Open →") and Work→Queue "Import document" — both should now open a clickable intent modal.

**Do now:**
1. Continue QA of Slice 1+2 through the real UI on :3014. Log each finding; fix small QA bugs on this branch (commit coherently, don't push). Bugs in promoted staging code are fair game to fix here.
   - Slice 1: Processing intake → upload native PDF / scanned image / scanned PDF → OCR-derived review (banner + operator-language confidence) → correct a field → generate → publish.
   - Slice 2: Studio → Packets (definition manager) → "New packet" opens the responsibility composer → select a published form → requirements enumerate → configure Applies-to / Who completes it / When (real-world language) → household preview (Guardian A/B, per-child) → blocking validation disables launch → save. Launch a packet link, complete it → one Processing Case lands in Work.
2. Only after QA is accepted, begin **Slice 3 — Participant Conversation Runtime + distinct multi-guardian completion.** Root cause + plan in `docs/sprints/active/phase-7-slice-3-handoff.md`: today two distinct guardians can't independently complete the same requirement in one family session because `crm_snapshot.person_id` is pinned to the first launcher (`lib/forms/packets/formPacketService.ts` ~:259; submit merge in `app/api/public/forms/[token]/submissions/route.ts` ~:134) and the session is sequential single-active-step. Minimal unlocks: per-recipient submission attribution + per-recipient step instances.

**Consume, don't re-implement (the frozen Slice-2 seam):** `lib/pos/packet/{requirementResponsibility,packetResponsibilityProjection,loadPacketProjection,loadParticipantProjection,loadFormRequirements,loadPacketPreview,requirementResponsibilityLabels}.ts`; endpoints `GET …/pos/packets/requirements`, `POST …/preview`, `GET …/[id]/projection`, `GET …/sessions/[sessionId]/participant-projection`; on-ramp `maybeOpenProcessingCaseFromPacketCompletionSafe`. Cert: `web/playwright/tests/phase7-packet-responsibility.spec.ts` (operator + live-handoff, both green).

**Do NOT:** reopen the responsibility/packet/forms architecture; create separate guardian packets; add a second responsibility/assignment engine; redesign Processing; push/merge/rebase without my explicit instruction.

On your first reply, print the compact assignment card (root+class, sprint, slot, provider, worktree, branch, port, localhost, server status, operator commands), confirm the server is up on :3014 with Node 22, then wait for my QA direction.
