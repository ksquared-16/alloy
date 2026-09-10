# Follow-up slice — Participant Runtime ephemeral execution / safe preview

**Status:** accepted follow-up platform work. **Not Thread 2 implementation.**
**Raised by:** the safe-admin-preview audit at the end of Thread 2 certification.

---

## What is missing

An administrator can preview a single published **Form** safely today (see the certified
per-Form preview). What does not exist is a non-operational preview of the **whole configured
Enrollment participant experience** — the conversation shell, the three derived requirements in
order, known-information behaviour, gather turns, evidence requirement, Review, signature
progression and completion.

Seeing that today requires launching a real packet, which creates a real operational session.

## Why it was not built in Thread 2

The requirement is that preview be non-operational **by construction** — incapable of operational
consequence, rather than safe because ten side effects were each remembered and suppressed. That
requirement is right, and the current runtime cannot satisfy it:

1. **There is no persistence seam.** Every participant function takes a raw `SupabaseClient` and
   queries tables directly. Measured across `lib/forms/packets`, `lib/public/forms`,
   `lib/enrollment/participantRuntime` and `app/api/public/forms`:

   | Table | Direct call sites | Files |
   | --- | --- | --- |
   | `form_packet_sessions` | 26 | 10 |
   | `form_packet_session_items` | 18 | 11 |
   | `form_submissions` | 9 | 7 |
   | `documents` | 6 | 5 |

   18 distinct files in the participant path touch this state. There is no deps-injection pattern
   anywhere in it — the Processing side has `makeProcessingCaseDbDeps`; the participant side has no
   equivalent.

2. **A write-trapping client cannot progress.** The runtime is read-modify-write over session
   state. `applyParticipantTurnResponse` states it directly: *"A turn is a read-modify-write over
   `shared_values` / `metadata`."* Neuter the writes and every later turn reads back state that was
   never written, so the conversation stops after the first turn — no Review, no signature, no
   upload, no completion.

3. **Per-side-effect suppression was rejected**, correctly. Across ~59 call sites, a suppression
   list is a safety property nobody can verify by reading it.

## Working architectural direction

```
Participant Runtime
        |
ParticipantSessionStore
        |
   ----------------
   |              |
SupabaseStore   InMemoryStore
operational     preview
```

One runtime, one orchestration, one renderer. Preview changes only the persistence binding.

### The state the seam must cover

The obvious rows are the packet session, its session items, and form submissions. **Do not treat
that list as complete.** A dedicated audit must establish the full set before implementation —
candidates the Thread 2 audit noticed but did not confirm as exhaustive include submission
documents and signatures, generated document rows, and anything the artifact/document render path
persists or caches. The estimate above is a starting point for that audit, not its conclusion.

## What the future slice must prove

- the operational implementation remains **behaviour-identical** (the existing participant suites
  are the regression net);
- preview uses the **same** runtime, orchestration and components;
- preview progresses through conversation → Review → signature → evidence → completion;
- no operational persistence;
- no canonical mutation;
- no Communications or delivery history;
- no Processing work;
- no stage or outcome mutation;
- no durable legal attestation;
- no metrics or readiness contamination.

## Scope note

This is a platform slice with its own audit, not a tail-end of a certification run. It should not
be started opportunistically alongside other work.
