# Communications → Work Items decision matrix (Slice 6)

| State | Operational work? | Work Items projection? | Authority | Projection | Resolves via | Opens to |
| --- | --- | --- | --- | --- | --- | --- |
| Needs Reply (`needs_response`, `awaiting_parent_reply`) | Yes | Yes (Slice 6 lane) | Communications thread | Virtual `communications:{threadId}` | Operator reply, triage resolve, attention transition | Communications workspace (exact thread) |
| Unread only | No | No | Communications | — | Read/mark read | Communications |
| Assigned thread (no needs reply) | Maybe later | No (Slice 6) | Communications assignment | — | Assignment change | Communications |
| Waiting on Family | No | No | Communications attention | — | Parent reply | Communications |
| Failed delivery | Maybe later | No (Slice 6) | Communications delivery | — | Retry/resend flows | Communications |
| Provider exception | Maybe later | No (Slice 6) | Communications provider | — | Provider recovery | Communications |
| Scheduled-send failure | Maybe later | No (Slice 6) | Communications scheduler | — | Reschedule/cancel | Communications |
| Consent exception | Maybe later | No (Slice 6) | Communications consent | — | Preference update | Communications |
| Unresolved inbound (without needs reply) | No | No | Communications | — | Triage | Communications |
| Draft response | No | No | Communications composer | — | Send/discard | Communications |
| Completed conversation | No | No | Communications | — | Already resolved | Communications |
| Archived thread | No | No | Communications | — | Archive state | Communications |

## Selected first lane

**Needs Reply** — authoritative predicate mirrors Command Center `requiresResponse` semantics:

- `attention_state` is `needs_response` or `awaiting_parent_reply`
- conversation is not resolved
- `scope_status === "resolved"` (loadable thread)

Communications remains system of record. Work Items provides execution surfacing, provenance, and deep links only.
