-- A provider event may now be quarantined for being nobody's business.
--
-- Live certification produced the case this exists for: a stranger's Google Calendar
-- invitation, forwarded from a mixed human mailbox, became a permanent canonical
-- Communications message with `unknown_sender` — a conversation with nobody, and unread
-- family work for an operator who has no business with it.
--
-- The runtime now refuses exactly one class: an unrecognised sender, at a `conversation`
-- identity, with no Alloy conversation behind them. That refusal needs somewhere honest to
-- land, and the ingress receipt already IS the place where "a message arrived and did not
-- become canonical" is recorded — `no_attributable_org` and `cross_org_ambiguous` are the
-- same shape of fact. So this widens that vocabulary rather than inventing a second store.
--
-- QUARANTINE, NOT DELETION. The receipt keeps the provider id, the sender, the destination
-- and the time, so the event stays auditable and recoverable. What it does not become is a
-- conversation, an unread family row, or a `communication_messages` row. The reason code
-- travels in `resolution_note` as `ineligible:<REASON>`; no new column is needed, and a
-- reason recorded next to the disposition cannot drift away from it.
--
-- Deliberately NOT a general enforcement of the ingress gate. Lane B's general enforcement
-- is unproven and Lanes C/D have never been measured, so nothing here refuses staff, vendor,
-- former-family, purpose or acquisition mail. See `conversationIdentityAdmission.ts`.
--
-- Additive: one CHECK widened, every existing value preserved, no data mutation.

do $$
declare
    v_conname text;
begin
    select con.conname into v_conname
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    where c.relname = 'communication_inbound_ingress'
      and pg_get_constraintdef(con.oid) ilike '%routing_disposition%';

    if v_conname is not null then
        execute format('alter table public.communication_inbound_ingress drop constraint %I', v_conname);
    end if;

    alter table public.communication_inbound_ingress
        add constraint communication_inbound_ingress_routing_disposition_check
        check (routing_disposition = any (array[
            'no_attributable_org',
            'cross_org_ambiguous',
            'retrieval_pending',
            'ineligible_unrecognized_sender'
        ]));
end $$;

comment on column public.communication_inbound_ingress.routing_disposition is
    'Why this provider event did not become canonical. no_attributable_org / cross_org_ambiguous = ownership could not be proven. retrieval_pending = content not yet fetched. ineligible_unrecognized_sender = ownership WAS proven, and the runtime refused it: an unrecognised sender at a conversation identity with no Alloy ancestry. Quarantine, never deletion — the event stays auditable and recoverable, and the reason code travels in resolution_note.';
