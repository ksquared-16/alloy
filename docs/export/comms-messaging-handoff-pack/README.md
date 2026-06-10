# Alloy — Communications & Messaging Handoff Pack

**Generated:** June 2026  
**Purpose:** Portable bundle of active docs for communications, messaging, inbox, Task Assist, and BOS comms drafting. Copy or zip this folder and take it offline.

**Canonical live source:** `docs/product/communications.md` in the repo always wins on conflict.

---

## Recommended reading order

1. **`01-canonical/communications.md`** — current product truth (Messaging V2 + Communications V1)
2. **`02-messaging-v2/`** — audit → design → architecture → implementation plan
3. **`03-shipped-closeouts/`** — what was built (BOS drafting, tour comms, Communications V1 sprint)
4. **`01-canonical/roadmap-and-gaps.md`** — sequencing and open gaps
5. **`04-future-planning/`** — BOS Phase 2–4 comms enhancements (not implemented)
6. **`05-audits-retirement/`** — legacy `messages` retirement path
7. **`06-task-assist-agents/`** — Orchestrator + Task Assist execution model
8. **`07-archived-runbooks/`** — May 2026 provider/setup runbooks (historical)

---

## Folder map

| Folder | Contents |
|--------|----------|
| `01-canonical/` | Product + system + roadmap docs |
| `02-messaging-v2/` | June 2026 Messaging V2 planning trilogy + perf hardening plan |
| `03-shipped-closeouts/` | Sprint closeouts + Communications V1 card log |
| `04-future-planning/` | Forward BOS operational intelligence packs |
| `05-audits-retirement/` | Legacy messages retirement audit |
| `06-task-assist-agents/` | Task Assist + agent interaction layer |
| `07-archived-runbooks/` | Archived implementation runbooks (Twilio/Resend/RLS) |

---

## Key code entry points (not included — repo only)

| Concern | Path |
|---------|------|
| Admin Inbox | `web/app/adminV2/components/InboxModal.tsx`, `InboxPanel.tsx` |
| Thread list API | `web/lib/communications/inboxThreadsService.ts` |
| Composer | `web/components/adminV2/messaging/MessagingComposerFrame.tsx` |
| Send path | `web/lib/communications/executeCommunicationsSend.ts` |
| BOS drafts | `web/lib/adminV2/bos/communication/` |
| Drawer comms | `web/components/admin/communications/CommunicationsDrawerSection.tsx` |
| Worker | `backend/app/services/communication_message_sender.py` |

---

## Known open gaps (summary)

See `01-canonical/communications.md` § Known gaps. Headlines: BOS Enhance LLM wiring, rich text toolbar, send-later beyond opportunity+person, attachments/templates, notification center, provider OAuth, legacy `messages` cutover.
