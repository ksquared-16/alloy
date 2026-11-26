# BOS Command coverage ledger

Mission: `msn_188e8bea6fb6de28dd21` — BOS Command Runtime Convergence  
**Status:** Complete for Mission 1 (honest dispositions). Canonical summary:  
[`docs/platform/milestones/bos-command-runtime-convergence-closeout.md`](../../docs/platform/milestones/bos-command-runtime-convergence-closeout.md) §9.  
Updated: 2026-07-28  
Authority: Capability Registry + process `command_set_v1` + Command Runtime.  
BOS disposition is honest — Runtime-executable ≠ BOS-ready.

**BOS-ready (family proofs):** `create_lead`, `update_lead_status`, `add_parent_guardian`, `cancel_tour`  
All four execute only through `executePlatformCommandViaActionsApi` → `/api/admin/actions/execute` → `executeCommandInvocation`.

---

## Summary counts

| Disposition | Count |
|-------------|------:|
| BOS Ready | 4 |
| Needs domain adapter | 18 |
| Needs generic preparation | 6 |
| Confirmation / destructive adapter | 3 |
| Requires Conversation Runtime | 2 |
| Navigation only | 2 |
| Operator only / Focus Panel | 2 |
| Not conversational | 4 |
| Unsupported / unavailable / placeholder | ~20 |
| Processing-only (not BOS Commands) | 14 |

---

## Full ledger

| Command | Family | Process selectable | Runtime executable | BOS discoverable | Preparation model | Confirmation | Result model | BOS disposition | Blocker |
|---------|--------|--------------------|--------------------|------------------|-------------------|--------------|--------------|-----------------|---------|
| create_lead | record_creation | yes | yes (RegisteredAction) | yes | create_lead_conversation_intake | session preview + confirm | Processing review | **BOS Ready (reference)** | Accepted by owner — do not polish |
| update_lead_status | status | yes | yes (mutation) | yes | generic_payload_fields | session confirm | status mutation | **BOS Ready (mutation proof)** | Subject + target_state |
| add_parent_guardian | relationships | yes | yes (relationship) | yes | relationship_subject | session confirm (client summary) | relationship | **BOS Ready (relationship proof)** | Subject + customer + identity |
| cancel_tour | tours | yes | yes (destructive tour) | yes | confirmation_only | strong confirm + preview token | tour cancel | **BOS Ready (confirmation proof)** | Active booking + preview token |
| close_lead | status | yes | yes (mutation) | no | generic_payload_fields | strong_confirm | status mutation | Needs domain adapter | Reuse update_lead_status adapter pattern with fixed outcome |
| update_child_enrollment_status | enrollment | yes | yes | no | generic_payload_fields | confirm | enrollment mutation | Needs generic preparation | OCM subject grain |
| waitlist_child | enrollment | yes | yes | no | generic_payload_fields | confirm | enrollment mutation | Needs domain adapter | Child subject + target |
| enroll_child | enrollment | yes | yes | no | generic_payload_fields | confirm | enrollment mutation | Needs domain adapter | Child subject + target |
| add_emergency_contact | relationships | yes | yes | no | relationship_subject | confirm | relationship | Needs domain adapter | Same pattern as add_parent_guardian |
| add_authorized_pickup | relationships | yes | yes | no | relationship_subject | confirm | relationship | Needs domain adapter | Same pattern |
| add_billing_contact | relationships | yes | yes | no | relationship_subject | confirm | relationship | Needs domain adapter | Same pattern |
| add_child | relationships | yes | yes | no | relationship_subject | confirm | relationship | Needs domain adapter | Child draft / link |
| link_existing_person | relationships | yes | yes | no | relationship_subject | confirm | relationship | Needs domain adapter | Person picker |
| link_existing_child | relationships | yes | yes | no | relationship_subject | confirm | relationship | Needs domain adapter | Child picker |
| make_primary_contact | relationships | yes | yes (replacement) | no | confirmation_only | strong_confirm + preview token | replacement | Needs confirmation adapter | Destructive/replacement UX |
| add_family_member | relationships | yes | partial | no | relationship_subject | confirm | relationship | Needs domain adapter | Admin-action owner |
| add_sibling | relationships | yes | partial | no | relationship_subject | confirm | relationship | Needs domain adapter | Admin-action owner |
| confirm_tour | tours | yes | yes (RegisteredAction) | no | confirmation_only | confirm | tour confirm | Needs domain adapter | Booking subject |
| schedule_tour | tours | yes | domain (not fully cut over) | no | Needs Conversation Runtime | domain_owned | tour booking | Requires Conversation Runtime | Slot/time collection |
| reschedule_tour | tours | yes | yes (tour facade) | no | confirmation_only + slot | domain_owned | tour reschedule | Needs domain adapter | New slot selection |
| complete_tour | tours | yes | yes | no | confirmation_only | domain_owned | tour complete | Needs confirmation adapter | Booking subject |
| no_show_tour | tours | yes | yes | no | confirmation_only | domain_owned | tour no-show | Needs confirmation adapter | Booking subject |
| reopen_tour | tours | no | no | no | — | — | — | Unsupported | Maturity unavailable |
| delete_lead | destructive | internal | yes (typed confirm) | no | confirmation_only | typed_confirm | delete | Needs confirmation adapter | Typed confirm UX — do not invent |
| archive_lead | destructive | no | no | no | — | — | — | Unsupported | Maturity unavailable |
| reopen_lead | status | no | no | no | — | — | — | Unsupported | Maturity unavailable |
| withdraw_child | enrollment | no | no | no | — | — | — | Unsupported | Policy-only / unavailable |
| update_status | status | internal | yes (RegisteredAction) | no | generic_payload_fields | confirm | status | Operator only | Prefer domain verbs |
| schedule.create | scheduling | yes | yes | no | generic_payload_fields | confirm | schedule | Needs domain adapter | Schedule subject |
| assignment.create | scheduling | yes | yes | no | generic_payload_fields | confirm | assignment | Needs domain adapter | Assignment fields |
| assignment.change_room | scheduling | yes | yes | no | generic_payload_fields | confirm | assignment | Needs domain adapter | Room selection |
| assignment.set_primary | scheduling | yes | yes | no | confirmation_only | confirm | assignment | Needs domain adapter | Subject |
| assignment.archive | scheduling | yes | yes | no | confirmation_only | confirm | assignment | Needs confirmation adapter | Subject |
| assignment.promote_proposed | scheduling | yes | yes | no | confirmation_only | confirm | assignment | Needs confirmation adapter | Subject |
| assignment.delete_proposed | scheduling | yes | yes | no | confirmation_only | confirm | assignment | Needs confirmation adapter | Subject |
| open_record | navigation | n/a | navigation_only | no | not_conversational | none | navigate | Navigation only | Not a mutation Command |
| ask_bos | administration | n/a | navigation_only | no | not_conversational | none | focus BOS | Navigation only | Not a mutation Command |
| quick_message | communications | yes | partial | no | Requires Conversation Runtime | none | message | Requires Conversation Runtime | Compose UX |
| send_message | communications | no | no | no | — | — | — | Unsupported | Unavailable |
| send_form | documents | yes | partial | no | Not conversational | confirm | form send | Operator only | Focus Panel / packet flows |
| send_enrollment_packet | documents | yes | partial | no | Not conversational | confirm | packet | Operator only | Packet runtime |
| update_enrollment_status | status | yes | legacy admin_action | no | generic_payload_fields | confirm | status | Needs generic preparation | Legacy owner |
| update_status_add_note | status | no | legacy | no | — | — | — | Not conversational | Hidden legacy |
| mark_won | enrollment | yes | legacy | no | confirmation_only | confirm | status | Needs domain adapter | Legacy owner |
| workflow.effect | workflow | no | workflow_only | no | — | — | — | Not conversational | Workflow engine only |
| configuration.maintenance | configuration | no | config runtime | no | — | — | — | Not conversational | Config maintenance |
| send_message_placeholder | communications | no | placeholder | no | — | — | — | Placeholder | Honesty |
| send_paperwork_placeholder | documents | no | placeholder | no | — | — | — | Placeholder | Honesty |
| add_to_waitlist_placeholder | enrollment | no | placeholder | no | — | — | — | Placeholder | Honesty |
| convert_to_enrolled_placeholder | enrollment | no | placeholder | no | — | — | — | Placeholder | Honesty |
| qualify_opportunity | status | no | no | no | — | — | — | Unsupported | Unavailable |
| start_quote | unknown | no | no | no | — | — | — | Unsupported | Unavailable |
| create_inquiry | record_creation | no | no | no | — | — | — | Unsupported | Unavailable |
| processing.* (14 keys) | processing | no | processing_only | no | — | — | — | Not conversational | Processing Identity — not BOS slash Commands |

---

## Honesty rules

1. Do **not** mark BOS Ready solely because Runtime can execute.
2. Do **not** invent conversational UX for every Command.
3. Process `command_set_v1` remains discovery authority — BOS cannot invent unselected Commands.
4. Conversation Runtime (universal) is a separate mission — Create Lead intake adapter stays Create-Lead-specific until that lands.
