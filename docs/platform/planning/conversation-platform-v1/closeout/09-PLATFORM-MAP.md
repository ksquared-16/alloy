# Conversation Platform Map

**Glance at this and know where every capability is in its lifecycle.**

Legend: **✅ Done** · **🔵 Active in that phase** · **⚪ Not started** · **⛔ Removed/decommissioned** · `—` no change in that phase

---

## The map

| Capability | Current (post-P0) | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | V1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Enqueue gate** | 10/14 paths ✅⚠️ | 🔵 **14/14** | — | — | — | — | ✅ |
| **Classification** | columns exist, optional | 🔵 **mandatory** | — | — | — | — | ✅ |
| **Eligibility** | 2 layers at the choke point | 🔵 universal | — | — | — | — | ✅ |
| **`executeCommunicationsSend`** | wrapper, gate inert | 🔵 **retire** | ⛔ | — | — | — | ⛔ |
| **Conversation entity** | ⚪ none (Thread stands in) | 🔵 **create** | 🔵 adopt | — | — | — | ✅ |
| **Message model** | body string + snapshot | 🔵 **structured** | — | 🔵 interactive | — | — | ✅ |
| **Interactive messages** | ⚪ none | 🔵 structured model | 🔵 renderer | 🔵 **tour slice** | — | — | ✅ |
| **Composer** | ❌ **3 implementations** | — | 🔵 **1 runtime** | — | — | — | ✅ |
| **Thread loading** | ❌ 3 paths, 3 caches | — | 🔵 **1 service** | — | — | — | ✅ |
| **Send pipeline / scheduler** | no lease → double-send | — | 🔵 **lease + scheduler** | — | — | — | ✅ |
| **Renderer (send)** | ✅ canonical | — | — | — | — | — | ✅ |
| **Renderer (preview)** | ❌ **separate engine** | — | — | 🔵 **converge** | — | — | ✅ |
| **Templates** | store ✅, tokens partial | — | — | 🔵 **platform** | — | — | ✅ |
| **Token catalogue** | hard-coded optionality | — | — | 🔵 declarative | — | — | ✅ |
| **Provider adapters** | ✅ registry | — | 🔵 harden | — | — | — | ✅ |
| **Delivery receipts** | ✅ events table | — | — | — | 🔵 enrich | — | ✅ |
| **Open/click tracking** | ⚪ none | — | — | — | 🔵 **build** | — | ✅ |
| **Preferences** | ✅ store + STOP/START/HELP | 🔵 wire to classification | — | — | 🔵 **UI + hierarchy** | — | ✅ |
| **Attachments** | ⚪ none (doc auth ✅) | — | — | — | 🔵 **build** | — | ✅ |
| **Announcements** | ✅ targets repaired | — | — | — | 🔵 converge audience | — | ✅ |
| **Identity** | ✅ resolution works | — | 🔵 sender convergence | — | — | 🔵 inbound email | ✅ |
| **Inbox (SMS)** | ✅ working | — | 🔵 unify loading | — | — | — | ✅ |
| **Inbox (email ingestion)** | ⚪ none | — | — | — | — | 🔵 **build** | ✅ |
| **Internal conversations** | `audience` exists, unused | — | — | — | — | 🔵 **build** | ✅ |
| **Timeline** | ✅ presentation | — | 🔵 conversation-aware | — | — | — | ✅ |
| **Current Work** | ✅ queue projection | — | 🔵 conversation-aware | — | — | — | ✅ |
| **Activity** | ✅ via Transaction Contract | — | — | — | — | — | ✅ |
| **BOS** | ✅ advisory only | — | — | — | — | 🔵 assistant | ✅ |
| **Analytics** | ⚪ none | — | — | — | — | 🔵 **build** | ✅ |
| **Signed URLs** | ✅ row-driven, ≤15 min | — | — | — | — | — | ✅ |
| **Avatar read path** | adapter + resolver | — | 🔵 **adopt + retire** | — | — | — | ✅ |
| **Legacy GHL dispatch** | contained 🔒 | — | — | — | — | — | ⛔ **decommission** |

---

## Worked examples, in the shape you asked for

**Composer**
```
Current   3 implementations (Command Center, drawer, family workspace)
   ↓
Phase 2   1 runtime — ComposerV2 + composerModel; others become callers
   ↓
Done
```

**Interactive Messages**
```
Current   None
   ↓
Phase 1   Structured message model
   ↓
Phase 2   Renderer
   ↓
Phase 3   Tour scheduling vertical slice
   ↓
Done
```

**Eligibility**
```
Current   2 layers, enforced on 10 of 14 send paths
   ↓
Phase 1   14 of 14 — no asterisk
   ↓
Done
```

**Renderer**
```
Current   Send path canonical ✅ · Preview uses a different engine ❌
   ↓
Phase 3   One renderer; preview endpoint calls previewOutboundMessage
   ↓
Done
```

**Legacy GHL dispatch**
```
Current   Contained — authenticated, rate-limited, bounded sends, no secrets in SMS
   ↓
(gated on one operational check inside GoHighLevel)
   ↓
Decommissioned — routes and guard deleted
```

---

## Reading the map

**Three capabilities are `⚪ none` today and are the platform's actual body of
work:** interactive messages, attachments, and analytics. Everything else is
either working, duplicated, or contained.

**Phase 1 is narrow on purpose.** It touches five rows. Four of them are about
removing asterisks — making eligibility universal and classification mandatory —
rather than adding features. That is deliberate: every later phase's claims
depend on those being unconditional.

**Phase 2 is the heaviest phase.** It carries composer convergence, thread-loading
convergence, the send pipeline/scheduler, and the avatar read path. If schedule
pressure appears, it will appear here.

**Only one row ends in ⛔.** The legacy GHL vertical is the sole capability whose
end state is deletion rather than convergence — because its state machine lives
in GoHighLevel and adopting it would import four foreign models into the
Conversation Runtime.

**Rows that are already ✅ and never change again** — signed URLs, activity,
delivery receipts, document authorization — are Phase 0's durable contribution.
They should not be reopened.
