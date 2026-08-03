# Conversation Convergence Matrix

**One place to understand duplication.** For every communications capability:
what is canonical, what is a compatibility layer, what is legacy, and when the
legacy goes away.

Column meanings:

- **Canonical** — the implementation that should exist long-term. New code uses this.
- **Compatibility** — a deliberate adapter bridging old data or old callers. Has a named removal condition.
- **Legacy** — a second implementation that should not exist. Duplication.
- **Planned removal** — the phase that deletes the legacy/compatibility entry.

`—` means "none", which is good in the Legacy column and neutral elsewhere.

---

## Send and dispatch

| Capability | Canonical | Compatibility | Legacy | Planned removal |
| --- | --- | --- | --- | --- |
| **Enqueue / send gate** | `enqueueCanonicalOutboundMessage` | `executeCommunicationsSend` (wrapper; gate inert) | 4 send paths bypassing both | **Phase 1** |
| **Dispatch worker** | `process_communication_messages` (Python) | — | — | n/a |
| **Dispatch revalidation** | `dispatch_eligibility.revalidate_for_dispatch` | — | — | n/a |
| **Scheduled sends** | `communicationScheduledSendsService` | — | no lease → double-send risk | **Phase 2** |
| **Legacy GHL dispatch** | — | `legacy_dispatch_guard.py` (containment) | `routes/dispatch.py` — writes **no** message row | **decommission** (see R-4/R-5) |
| **Provider adapters** | `v2/providers/registry.ts` + Resend/Twilio adapters | `deferredAdapters.ts` | `ghl_client.send_conversation_sms` | **decommission** |

## Authoring surfaces

| Capability | Canonical | Compatibility | Legacy | Planned removal |
| --- | --- | --- | --- | --- |
| **Composer** | `composer/ComposerV2.tsx` + `v2/composerModel.ts` | `ComposeNewCommunicationModal.tsx`, `QuickMessageModal.tsx` | family-workspace composer path (`orchestrateFamilySend`, `composerSelection`) | **Phase 2** |
| **Composer channel availability** | `composerChannels.ts` | `drawerComposerChannelAvailability.ts` | — | Phase 2 |
| **Recipient selection** | `drawerEmailRecipients.ts` + `recipientKey.ts` | `familyWorkspace/recipientTierPolicy.ts` | — | Phase 2 |
| **Send orchestration** | `enqueueCanonicalOutboundMessage` | `orchestrateFamilySend.ts` | `/family-note`, `/family-send` routes | **Phase 2** |

> **Composer is the largest single duplication in the platform.** Three surfaces
> compose messages with three different recipient models. This is WS4 and it is
> Phase 2's main body of work.

## Rendering and templates

| Capability | Canonical | Compatibility | Legacy | Planned removal |
| --- | --- | --- | --- | --- |
| **Outbound renderer** | `render/renderOutboundMessage.ts` | — | — | n/a |
| **Preview renderer** | *(should be the same)* | — | `templateService.buildTemplatePreview` → `templateTokens.renderCommunicationTemplate` | **Phase 3** |
| **Render snapshot** | `communication_messages.rendered_snapshot` | — | — | n/a |
| **Token catalogue** | `templateTokens.ts` (catalogue) | `OPTIONAL_TOKEN_PATHS` hard-coded list | — | **Phase 3** |
| **Templates** | `communication_templates` + `communication_template_versions` | `templatesAnnouncements.ts` | `opportunityComposeTemplates.ts`, `communicationTemplateDraftSeed.ts` | **Phase 3** |
| **Snippets** | `communication_snippets` | — | — | n/a |

> **Preview/send divergence is the highest-value convergence remaining.** Parity
> is currently proven by unit test (`previewOutboundMessage === renderOutboundMessage`)
> but the preview *endpoint* does not call it.

## Classification, eligibility, preferences

| Capability | Canonical | Compatibility | Legacy | Planned removal |
| --- | --- | --- | --- | --- |
| **Classification vocabulary** | `contracts/communications/dispatch-decisions.json` | `recordCategoryFallback` telemetry | — | Phase 1 (when fallbacks reach zero) |
| **Eligibility evaluator** | `eligibility/evaluateEligibility.ts` (pure, versioned) | — | — | n/a |
| **Eligibility I/O** | `eligibility/loadEligibilityContext.ts` | — | — | n/a |
| **Consent enforcement** | eligibility gate at enqueue | `v2/consentGate.ts`, `v2/consentEnforcement.ts` | — | **Phase 1** |
| **Preferences store** | `communication_preferences` + `communication_preference_events` | `householdCommunicationPreferences.ts` | — | Phase 4 |
| **Preference loading** | `v2/loadCommunicationPreferences.ts` | `v2/preferences.ts`, `v2/preferenceMutations.ts` | — | Phase 4 |
| **SMS keywords** | `contracts/communications/sms-keywords.json` + `sms_keywords.py` | — | — | n/a |

## Identity

| Capability | Canonical | Compatibility | Legacy | Planned removal |
| --- | --- | --- | --- | --- |
| **Addressable identity** | `communication_identities` | — | — | n/a |
| **Inbound resolution** | `identity/inboundResolveIdentity.ts` | — | — | n/a |
| **Address normalization** | `identity/normalizeAddress.ts` | — | — | n/a |
| **Outbound sender** | `identity/resolveOutboundSender.ts` | `identity/resolveSenderIdentity.ts` | — | Phase 2 |
| **Thread identity** | `inboxThreadIdentity.ts` | `inboxThreadPersonContext.ts` | — | Phase 2 |
| **Grants / scoping** | `communication_identity_grants`, `..._location_bindings` | — | — | n/a |

## Threads, inbox, read models

| Capability | Canonical | Compatibility | Legacy | Planned removal |
| --- | --- | --- | --- | --- |
| **Thread store** | `communication_threads` | — | — | n/a |
| **Thread loading** | `inboxThreadsService.ts` | `commandCenterThreadMessages.ts`, `familyWorkspace/assembleFamilyWorkspace.ts` | — | **Phase 2** |
| **Thread caches** | `inboxFolderCache.ts` | `commandCenterPrefetchCache.ts`, `drawerFamilyWorkspacePrefetchCache.ts` | — | Phase 2 |
| **Conversation entity** | **does not exist** | Thread stands in for it | — | **Phase 1 creates it** |
| **Timeline** | `familyWorkspace/timelinePresentation.ts` | — | — | n/a |
| **Read state** | `communication_message_reads` | — | — | n/a |
| **Current Work / queue** | `commandCenterQueueProjection.ts` | `commandCenterViewModel.ts` | — | n/a (read model) |

> Three prefetch caches and three thread-loading paths exist because three
> surfaces (Command Center, drawer, family workspace) were built independently.
> This is duplication of *reads*, so it is lower risk than the composer, but it is
> the reason a thread can appear differently in two places.

## Tracking and telemetry

| Capability | Canonical | Compatibility | Legacy | Planned removal |
| --- | --- | --- | --- | --- |
| **Delivery receipts** | `communication_delivery_events` | — | — | n/a |
| **Delivery state** | `deliveryStateAdapter.ts` | — | — | n/a |
| **Receipt persistence** | `providerDeliveryPersistence.ts` | — | — | n/a |
| **Status webhook** | `twilioSmsStatusWebhook.ts` | — | — | n/a |
| **Open/click tracking** | **does not exist** | — | — | **Phase 4** |
| **Analytics** | **does not exist** — WS13 | — | — | **Phase 5** |

## Documents, attachments, media

| Capability | Canonical | Compatibility | Legacy | Planned removal |
| --- | --- | --- | --- | --- |
| **Document authorization** | `assertDocumentAccess` | — | — | n/a |
| **Signed URL expiry** | `signedUrlExpirySeconds` (≤15 min) | — | — | n/a |
| **Profile photo resolution** | `resolveProfilePhotosForActor` | `resolveIdentityPhotoUrl.ts` adapter, `RESOLVED_PHOTO_URL_KEY` | `persons.metadata.photo_url` legacy values | **Phase 2** + data migration |
| **Legacy URL classification** | — | `classifyLegacyPhotoUrl` | — | after data migration |
| **Vendor object paths** | row-driven signing | `vendorObjectPathRemediation.ts` (dry-run) | 6 unowned objects | on disposition |
| **Message attachments** | **does not exist** — WS11 | — | — | **Phase 4** |

## Announcements

| Capability | Canonical | Compatibility | Legacy | Planned removal |
| --- | --- | --- | --- | --- |
| **Announcement model** | `announcementModel.ts` / `announcementService.ts` | — | — | n/a |
| **Targets** | `announcement_targets` (canonical shape, repaired in P0-4) | — | pre-repair `target_spec`-only shape | **done** |
| **Audience resolution** | `audienceResolver.ts` + `audienceSpec.ts` | `audienceHierarchy.ts`, `resolveAnnouncementAudience.ts` | — | Phase 4 |
| **Fan-out** | `announcementFanout.ts` | `scheduleAnnouncementSendout.ts` | — | Phase 4 |

## Intelligence

| Capability | Canonical | Compatibility | Legacy | Planned removal |
| --- | --- | --- | --- | --- |
| **BOS signals** | `bosIntelligence.ts`, `bosRailCards.ts` | — | — | n/a |
| **Identity discovery signals** | `identity/bosDiscoverySignals.ts` | — | — | n/a |
| **AI assist send** | routes through `executeCommunicationsSend` | — | `ai/task-assist/apply` | **Phase 1** (converge to enqueue) |

---

## Summary — where duplication actually is

Ranked by risk, not by count:

| Rank | Duplication | Why it matters | Phase |
| --- | --- | --- | --- |
| 1 | **4 send paths bypass the enqueue gate** | eligibility is not universal | 1 |
| 2 | **Preview vs send renderer** | a template can preview differently from how it sends | 3 |
| 3 | **3 composer surfaces** | 3 recipient models, 3 chances to diverge | 2 |
| 4 | **Legacy GHL dispatch writes no message row** | structurally invisible to every gate | decommission |
| 5 | **3 thread-loading paths + 3 prefetch caches** | same thread renders differently by surface | 2 |
| 6 | **Legacy photo URLs in person metadata** | needs adapter + data migration to retire | 2 |

Everything else in this matrix is either already canonical or is a compatibility
layer with a named removal condition in the Retirement Ledger.
