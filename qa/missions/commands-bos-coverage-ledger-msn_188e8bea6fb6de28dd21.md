# BOS Command coverage ledger (draft)

Mission: `msn_188e8bea6fb6de28dd21` — BOS Command Runtime Convergence  
Updated: 2026-07-28  
Authority: Capability Registry + process `command_set_v1` + Command Runtime.  
BOS disposition is honest — Runtime-executable ≠ BOS-ready.

| Command | Family | Process selectable | Runtime executable | BOS discoverable | Preparation model | Confirmation | Result model | BOS disposition | Blocker |
|---------|--------|--------------------|--------------------|------------------|-------------------|--------------|--------------|-----------------|---------|
| create_lead | record_creation | yes | yes (RegisteredAction facade) | yes (adapter registry) | create_lead_conversation_intake | session preview + confirm | Processing review / opportunity | **BOS-ready (reference)** | Live process gate wired; intake remains Create-Lead-specific |
| close_lead | status | yes | yes | no adapter | needs generic_payload_fields or confirmation_only | Runtime + session | status mutation | Needs domain preparation adapter | Subject + outcome fields |
| update_lead_status | status | yes | yes (mutation adapter) | no | generic_payload_fields | Runtime | status mutation | Needs domain preparation adapter | Bounded status input |
| add_parent_guardian | relationships | yes | yes (relationship adapter) | no | relationship_subject | Runtime | relationship | Needs domain preparation adapter | Subject + role |
| cancel_tour | tours / destructive | yes | yes (destructive) | no | confirmation_only | strong confirm / preview | tour cancel | Needs conversation-plan + confirmation | Safety UX |
| schedule_tour | tours | yes | partial / domain | no | needs conversation-plan | Runtime | tour booking | Needs conversation-plan support | Slot/time collection |
| open_record | navigation | n/a | navigation_only | no | not_conversational | none | navigate | Navigation-only | Not a mutation Command |
| archive_lead | destructive | possible | unavailable | no | — | — | — | Unavailable | Capability maturity |
| message / placeholders | communications | varies | placeholder/unavailable | no | — | — | — | Unsupported / Not conversational | Honesty |

Dispositions to expand as adapters ship. Do not mark BOS-ready solely because Runtime can execute.
