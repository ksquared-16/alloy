# Family conversation vs transport threads — decision (UI-5 / pre-send)

**Operator model:** the Family Communication Workspace presents **one unified family
conversation**. The operator thinks "I am talking to the Rivera family", not "thread A to
mom, thread B to dad, thread C on SMS".

**Transport model:** `communication_threads` is keyed by `(org, primary_entity_type,
primary_entity_id, channel, recipient_key)`. So the underlying transport may create
**one thread per recipient and per channel** (mom-email, dad-email, mom-sms, an
opportunity thread, a customer thread, …).

**Reconciliation (what the UI does):**
- The workspace **merges** all of a family's transport threads into a single chronological
  **family timeline** (`aggregateFamilyThreads` unions threads across the customer, every
  family person, and every family opportunity; `buildTimelineEvents` merges their messages).
- The default conversation view is the **merged** family timeline.
- Selecting a thread (`thread_id`) **filters** the conversation to that recipient/channel
  sub-conversation, without leaving the family workspace (snapshot preserved).

**Send implication (NOT implemented here):** sending to multiple recipients fans out into
multiple per-recipient/channel threads + messages (`composerModel.buildSendPayloads` already
produces one payload per recipient). The operator still sees one merged conversation; the
fan-out is a transport detail. Multi-recipient send + the single-recipient send route are the
known blockers documented for the send phase — see UI5_Batch2 notes.

This decision is also referenced from `aggregateFamilyTimeline.ts` (the merge point).
