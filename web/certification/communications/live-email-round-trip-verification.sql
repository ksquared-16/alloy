-- Live Email round trip — the read-only proof.
--
-- Run against the tenant that actually received the mail, AFTER the Director has completed
-- the journey in `docs/platform/communications/live-email-routing-test.md`. Every statement
-- is a SELECT. Nothing here writes, and nothing here should be run before the round trip:
-- an empty result before the test proves nothing and reads like a failure afterwards.
--
-- Set these two first. The subject is the only thing tying the journey together from the
-- outside, which is why the runbook makes it unique.
--
--   \set org_id 'ORG-UUID-HERE'
--   \set subject_like '%Routing proof 2026-08-19%'
--
-- Each query is numbered to the claim it settles. A claim with no query under it is a claim
-- nobody checked.

-- ---------------------------------------------------------------------------
-- 1. RESEND RECEIVED IT — the provider event, before anything canonical exists.
--    `resolved_message_id` non-null is what says retrieval and persistence completed;
--    a receipt without one is a message that arrived and could not be read.
-- ---------------------------------------------------------------------------
select 'receipt' as claim, i.provider, i.provider_message_id, i.from_address, i.to_address,
       i.received_at, i.routing_disposition, i.resolved_org_id is not null as attributed,
       i.resolved_message_id is not null as persisted, i.resolution_note
from public.communication_inbound_ingress i
where i.channel = 'email'
  and i.received_at > now() - interval '2 days'
order by i.received_at desc
limit 10;

-- ---------------------------------------------------------------------------
-- 2. EXACTLY ONE CANONICAL INBOUND MESSAGE — the duplicate count, stated as a count
--    rather than eyeballed. Exactly-once is structural (a unique index), so more than
--    one row here means the index is not doing what it is believed to do.
-- ---------------------------------------------------------------------------
select 'duplicate_count' as claim, m.provider_message_id, count(*) as canonical_rows
from public.communication_messages m
where m.org_id = :'org_id' and m.channel = 'email' and m.direction = 'inbound'
  and m.subject ilike :'subject_like'
group by m.provider_message_id;

-- ---------------------------------------------------------------------------
-- 3-9. THE MESSAGE ITSELF — sender resolution, the visible recipient, and the three RFC
--    headers the whole architecture rests on.
--
--    `to_address` MUST read the visible identity (kelly@workwithalloy.com), never the
--    hidden ingress destination. It becomes a thread endpoint and is compared against
--    outbound `from_address`, so the transport address appearing here would both split the
--    conversation and leak the destination into canonical history.
--
--    `email_in_reply_to` is the one that decides whether an administrative forwarding hop
--    preserves reply correlation. If it is null, the hop stripped it — a real outcome, not
--    a test failure, and the branded-subdomain fallback returns as a decision.
-- ---------------------------------------------------------------------------
select 'message' as claim, m.id as message_id, m.thread_id, m.from_address, m.to_address,
       m.subject, m.email_message_id, m.email_in_reply_to, m.email_references,
       m.status, m.audience, m.category,
       m.metadata->>'correlation_method' as correlation_method,
       m.metadata->>'inbound_resolution' as inbound_resolution,
       m.metadata->>'routing_ambiguous' as routing_ambiguous,
       coalesce((m.metadata->>'attachment_count')::int, 0) as attachments
from public.communication_messages m
where m.org_id = :'org_id' and m.channel = 'email' and m.direction = 'inbound'
  and m.subject ilike :'subject_like';

-- ---------------------------------------------------------------------------
-- 4. SENDER PERSON RESOLUTION — who Alloy decided wrote it, and on what basis.
--    `single_person_match` is the only value that asserts a Person. `ambiguous_sender`
--    means the address is shared and names nobody; `unknown_sender` means no Person holds
--    it. Both are correct outcomes, and both must be reported rather than smoothed over.
-- ---------------------------------------------------------------------------
select 'person_resolution' as claim, t.primary_entity_type, t.primary_entity_id,
       p.full_name is not null as person_named, p.email as person_email
from public.communication_messages m
join public.communication_threads t on t.id = m.thread_id
left join public.persons p on p.id = t.primary_entity_id and t.primary_entity_type = 'persons'
where m.org_id = :'org_id' and m.channel = 'email' and m.direction = 'inbound'
  and m.subject ilike :'subject_like';

-- ---------------------------------------------------------------------------
-- 5. HIDDEN INGRESS DESTINATION IS TRANSPORT ONLY — it proved ownership and then
--    disappeared. It must appear on the ROUTE and nowhere in canonical history.
-- ---------------------------------------------------------------------------
select 'ingress_route' as claim, r.destination, r.verification_state, r.last_inbound_at,
       b.inbound_address as visible_identity
from public.communication_ingress_routes r
join public.communication_provider_bindings b on b.id = r.communication_provider_binding_id
where r.org_id = :'org_id';

select 'destination_leak_check' as claim, count(*) as canonical_rows_naming_the_destination
from public.communication_messages m
where m.org_id = :'org_id'
  and exists (
      select 1 from public.communication_ingress_routes r
      where r.org_id = m.org_id
        and (lower(m.to_address) = lower(r.destination) or lower(m.from_address) = lower(r.destination))
  );
-- Expected: 0. Any other number means the transport address became somebody's endpoint.

-- ---------------------------------------------------------------------------
-- 6. ONE CANONICAL THREAD — the outbound Alloy sent and the inbound reply share it.
--    Two rows with different thread_ids is the failure this whole correlation model
--    exists to prevent.
-- ---------------------------------------------------------------------------
select 'thread_composition' as claim, m.thread_id, m.direction, m.from_address, m.to_address,
       m.subject, m.email_message_id, m.created_at
from public.communication_messages m
where m.org_id = :'org_id' and m.channel = 'email'
  and m.thread_id in (
      select m2.thread_id from public.communication_messages m2
      where m2.org_id = :'org_id' and m2.channel = 'email' and m2.subject ilike :'subject_like'
  )
order by m.created_at;

-- ---------------------------------------------------------------------------
-- 7. THE CORRELATION ACTUALLY USED — did the minted id survive the hop, or did the
--    thread resolve by the weaker endpoint provenance? Both file the message correctly;
--    only one proves RFC correlation through a forwarding hop.
-- ---------------------------------------------------------------------------
select 'correlation_proof' as claim,
       m.metadata->>'correlation_method' as method,
       case m.metadata->>'correlation_method'
           when 'in_reply_to' then 'STRONGEST — the minted Message-ID survived the forwarding hop'
           when 'references'  then 'STRONG — the chain survived even though In-Reply-To did not'
           when 'endpoint_provenance' then 'WEAK — filed by sender+recipient, NOT by RFC correlation. The hop stripped our headers.'
           else 'NONE — a new conversation was created'
       end as what_it_proves
from public.communication_messages m
where m.org_id = :'org_id' and m.channel = 'email' and m.direction = 'inbound'
  and m.subject ilike :'subject_like';

-- ---------------------------------------------------------------------------
-- 8. THE OPERATOR IS ACTUALLY TOLD — attention state on the thread, and the single
--    receive event. Exactly one `message_received` per canonical message: the Activity is
--    exactly-once structurally, so two rows would mean ingestion ran twice.
-- ---------------------------------------------------------------------------
select 'attention' as claim, t.id as thread_id, t.attention_state, t.last_message_at,
       t.primary_entity_type, t.location_id
from public.communication_threads t
where t.id in (
    select m.thread_id from public.communication_messages m
    where m.org_id = :'org_id' and m.channel = 'email' and m.subject ilike :'subject_like'
);

select 'workflow_event' as claim, w.event_type, w.entity_type, w.entity_id, w.occurred_at,
       w.payload->>'thread_id' as thread_id, w.payload->>'correlation_method' as correlation_method,
       count(*) over () as event_rows
from public.workflow_events w
where w.org_id = :'org_id' and w.event_type = 'message_received'
  and w.occurred_at > now() - interval '2 days'
order by w.occurred_at desc;

-- ---------------------------------------------------------------------------
-- 9. THE OBSERVE-ONLY GATE SAW IT — and changed nothing. This is the first LIVE
--    observation the corpus has ever held; every existing row is `historical_replay`.
--    Its presence proves the hook fires on real traffic; its irrelevance to everything
--    above proves the gate is still not enforcing.
-- ---------------------------------------------------------------------------
select 'ingress_gate_observation' as claim, o.evaluation_mode, o.decision, o.lane,
       o.reason_code, o.matched_relationship_type, o.sender_assertion,
       o.sender_authentication, o.sender_authentication_evidence, o.policy_version
from public.communication_ingress_eligibility_observations o
where o.org_id = :'org_id'
  and o.evaluated_at > now() - interval '2 days'
order by o.evaluated_at desc;
