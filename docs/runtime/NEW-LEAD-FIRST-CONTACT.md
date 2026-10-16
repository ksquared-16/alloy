# New lead → first communication

The first operational loop after a lead is created: the lead arrives and needs attention, someone (or an
automation) contacts the family, the message is actually delivered, the lead's activity shows it, and the
first-contact work records it. Each step has one owner; every surface reads from that owner.

## Processing attention: NEW / UNWORKED

`lib/pos/processingCaseAttention.ts`. A case is **new / unworked** while two things are true:

- it is actionable (`PROCESSING_ACTIONABLE_STATUSES`);
- it has no operator-authored decision. That means no `processing_resolutions` row with
  `decided_by = 'operator'`, and no form created from it.

Engine decisions made at intake don't count. Opening or reading a case doesn't count either.

The rule drives two surfaces:

- the **Processing nav badge**, via `/api/admin/processing/attention`. It re-reads on
  `ADMIN_V2_PROCESSING_QUEUE_REFRESH` and every 60 s, because a public submission arrives from outside the
  session;
- the queue row's **New** marker.

Approving a case concludes it, so it leaves the count.

## Template messages render from the recipient's records

`lib/communications/render/buildRecordRenderContext.ts`. The canonical renderer (`renderOutboundMessage`)
reads tokens only from owner-scoped buckets and refuses a message whose catalogued tokens it cannot fill.
The builder fills those buckets from canonical rows:

- recipient person;
- household;
- lead;
- the child, only when the lead has exactly one;
- location;
- organization.

Internal ids are deliberately left unfilled, so a template that names one is refused rather than sent.

`family-send` passes the context through `canonicalSend` into the canonical enqueue. Preflight renders the
same way, so a refusal is named before confirm. The confirmation dialog shows success only when at least
one message was queued. Each confirmed send carries its own client token, so resending the same template
to the same person is not mistaken for a duplicate.

## A lead's messages are part of its activity

A family send threads on the recipient (a person), so its message events are emitted on that person. The
lead's activity loader (`loadOpportunityActivityEvents`) joins the lead's own messages, linked by
`communication_messages.metadata.opportunity_id` and the events' `payload.communication_message_id`, and
attaches the recipient's name ("SMS to Jane").

Duplicate collapse is **per send**:

- queued and delivered rows fold into the same message's sent row;
- a tour invitation hides only its own delivery, meaning messages within a minute of it.

The Focus Panel reloads on the send's refresh. The Activity tab listens to the same event.

## Last action

The process card shows the newest meaningful row of the same timeline (`selectLastAction`), directly above
Record outcome. Record bookkeeping (created / updated) and preparatory steps are skipped. There is no store
of its own.

## Automation: lead created → send a template

- **Event.** `lead_created` (`lib/opportunities/emitLeadCreatedEvent.ts`), emitted by Processing approval
  and BOS Create Lead.
  - It fires only for a genuinely created lead. A sibling joining the family's open lead is not a new lead.
  - It fires once per lead.
  - Its payload carries `new_family` and `actor_user_id`.
  - Matching enabled workflows run in-process.
- **Action.** `send_communication_template`
  (`lib/workflows/actions/executeSendCommunicationTemplateWorkflowAction.ts`).
  - The template is referenced by id or `system_key`, never copied, and its current version is resolved at
    send time.
  - It renders with the same record context and sends to the lead's primary person through `canonicalSend`
    (purpose `automated_family_message`).
  - It is idempotent per workflow, lead, template and channel.
  - A successful send is associated with the lead's open contact work, exactly like an operator's send.
- **Authoring.** On the Workflows page, "When a new lead is created, send a message" picks a template and,
  by default, adds the condition `new_family = true`. Conditions can now read the event's own root facts.

## First contact is provider acceptance

`lib/communications/contactAttemptOnProviderAcceptance.ts`. A send that declares contact work records
`work_consequence`, `opportunity_id` and `author_user_id` on the message. Three senders do this: family send,
communications send and the automation.

The contact attempt is recorded only when the provider **accepts** the message, meaning
`communication_messages.status` is `sent` or `delivered` and a `provider_message_id` is present.

- Queued inside Alloy is not contact.
- A synchronous provider rejection (e.g. Twilio 400, invalid number) records nothing, so the work stays open.
- Later carrier delivery is telemetry.

The reconciler runs at three points:

- inline, after the send hands messages to the provider;
- from the provider webhooks (`applyOutboundProviderDeliveryPatch`);
- from the 5-minute scheduled wake.

It runs once per message: the message is stamped, and a stamped message is never associated again.

## First-contact work: completion is configuration

A successful send (accepted for delivery) is associated with the lead's open Contact Family work through
`sufficient_command_results` (`associateOutboundCommunicationToContactAttempt`). What it does next is the
tenant's published Business Process.

The platform default maps `communications_send/sent → left_message`. A tenant whose Contact Family means
"reach the family" (for example `min_attempts: 3`, `left_message → reopen_work`) records the send as an
attempt and moves the work's due date. It does not close the work. Closing on a send requires the tenant to
map `communications_send/sent` to a successful outcome.

## A confirmed tour moves the family (E2E-25)

Every path that confirms a booking runs the same Business Process step (`runConfirmedTourStageWork` in
`tourBookingService`): `schedule_tour/confirmed`, then the stage's mapped outcome (`tour_scheduled`), then its
rule (`lead_to_tour`). This covers operator create, public-link create and confirm-from-pending.

The step used to require a staff user, so a family's public booking never reached the Business Process. With
no staff user, the platform's system actor records it.

Tour is **family-grain**: Lead, Tour and Decision are family; Waitlist, Enrolling and Enrolled are child. Before
Decision a child has no stage of its own and rides the family's. So the child label reads the family stage
before any intake status (`childEnrollmentProcessStageLabel`). No child state is written.

## Workflow conditions are stored and enforced

`workflow_conditions` is `field / operator / value (text) / org_id`.

- **Authoring:** the API writes those columns. It replaces safely: insert first, then delete. Failures are
  reported, not swallowed.
- **Runtime:** it reads `*` and fails a run **closed** when conditions cannot be read. It used to name absent
  columns, discard the error, and run every conditioned workflow as unconditioned.
- **Automation creator:** it creates the workflow disabled and enables it last.

## Tours from tomorrow

`lib/tours/bookings/tourEarliestDate.ts`, enforced in `tourBookingService` create and reschedule. A tour
may start no earlier than tomorrow in the site's calendar (the booking's IANA timezone), never the browser's
or UTC's. Existing same-day bookings are never invalidated. The slot picker and the manual date input mirror
the rule.
