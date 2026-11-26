"""
Which RECORD a communication lifecycle event is filed against.

The dispatcher recorded its policy decisions durably and then filed them under
`entity_id = org_id`, so an activity query for the opportunity — which matches
`workflow_events.entity_type` / `entity_id` exactly — could never find them. A
refusal was written down and still invisible.

These tests pin the subject model at the canonical producer.
"""

import pytest

from app.services.communication_workflow_events import (
    UNKNOWN_ENTITY_TYPE,
    emit_for_communication_message,
    resolve_communication_event_subject,
)

ORG = "aaaaaaa1-0000-4000-8000-000000000001"
OPPORTUNITY = "bbbbbbb2-0000-4000-8000-000000000002"
PERSON = "ccccccc3-0000-4000-8000-000000000003"
MESSAGE = "ddddddd4-0000-4000-8000-000000000004"
THREAD_ID = "eeeeeee5-0000-4000-8000-000000000005"


def opportunity_thread():
    return {"primary_entity_type": "opportunities", "primary_entity_id": OPPORTUNITY}


@pytest.fixture
def emitted(monkeypatch):
    """Capture what would reach workflow_events, without a network."""
    calls = []
    monkeypatch.setattr(
        "app.services.communication_workflow_events.emit_communication_workflow_event",
        lambda **kw: calls.append(kw),
    )
    return calls


# --- 1. authoritative thread fields ----------------------------------------


def test_thread_primary_entity_is_the_subject():
    subject = resolve_communication_event_subject(org_id=ORG, thread=opportunity_thread())

    assert subject["entity_type"] == "opportunities"
    assert subject["entity_id"] == OPPORTUNITY
    assert subject["org_scoped"] is False


def test_no_entity_type_is_assumed():
    # A thread may belong to a person, a job, or anything else a caller made
    # canonical. Nothing here may special-case opportunities.
    subject = resolve_communication_event_subject(
        org_id=ORG, thread={"primary_entity_type": "persons", "primary_entity_id": PERSON}
    )

    assert subject["entity_type"] == "persons"
    assert subject["entity_id"] == PERSON


# --- 2. entity type vocabulary ---------------------------------------------


def test_entity_type_is_echoed_verbatim_not_pluralized():
    # The admin API normalises singular aliases on the QUERY PARAMETER only,
    # never on stored rows. Translating here would file message_blocked under
    # "opportunities" while this thread's message_sent sits under "opportunity",
    # splitting one conversation across two entity_types.
    subject = resolve_communication_event_subject(
        org_id=ORG, thread={"primary_entity_type": "opportunity", "primary_entity_id": OPPORTUNITY}
    )

    assert subject["entity_type"] == "opportunity"


# --- 3 + 4. no valid primary entity ----------------------------------------


@pytest.mark.parametrize(
    "thread",
    [
        None,
        {},
        {"primary_entity_type": "opportunities", "primary_entity_id": ""},
        {"primary_entity_type": "opportunities", "primary_entity_id": "not-a-uuid"},
        {"primary_entity_type": "", "primary_entity_id": OPPORTUNITY},
    ],
    ids=["missing", "empty", "blank-id", "non-uuid-id", "blank-type"],
)
def test_unusable_primary_entity_falls_back_to_the_org(thread):
    subject = resolve_communication_event_subject(org_id=ORG, thread=thread)

    # Durable, not dropped: losing the record is worse than filing it imprecisely.
    assert subject["entity_id"] == ORG
    assert subject["org_scoped"] is True


def test_org_scoped_events_are_marked_as_degraded(emitted):
    emit_for_communication_message(
        org_id=ORG,
        thread={"primary_entity_type": "opportunities", "primary_entity_id": "not-a-uuid"},
        event_type="message_blocked",
        message_id=MESSAGE,
        thread_id=THREAD_ID,
        channel="sms",
        direction="outbound",
        body_text=None,
        extra={"outcome": "blocked", "reason": "SUPPRESSED"},
    )

    payload = emitted[0]["payload"]
    # An event filed against the org is NOT on the record it concerns, and an
    # operator surface must be able to say so rather than show a normal event.
    assert payload["subject_scope"] == "org_fallback"
    assert payload["thread_primary_entity_type"] == "opportunities"
    assert payload["thread_primary_entity_id"] == "not-a-uuid"


def test_a_record_scoped_event_carries_no_degradation_marker(emitted):
    emit_for_communication_message(
        org_id=ORG,
        thread=opportunity_thread(),
        event_type="message_blocked",
        message_id=MESSAGE,
        thread_id=THREAD_ID,
        channel="sms",
        direction="outbound",
        body_text=None,
    )

    assert "subject_scope" not in emitted[0]["payload"]


def test_unknown_entity_type_when_the_thread_declares_none():
    subject = resolve_communication_event_subject(org_id=ORG, thread={})
    assert subject["entity_type"] == UNKNOWN_ENTITY_TYPE


# --- 5. lands on the right record, and only that one ------------------------


def test_blocked_event_lands_on_the_opportunity_and_no_other_record(emitted):
    emit_for_communication_message(
        org_id=ORG,
        thread=opportunity_thread(),
        event_type="message_blocked",
        message_id=MESSAGE,
        thread_id=THREAD_ID,
        channel="sms",
        direction="outbound",
        body_text=None,
        extra={"outcome": "blocked", "reason": "SUPPRESSED", "operator_message": "Suppressed after a hard bounce."},
    )

    assert len(emitted) == 1
    call = emitted[0]
    assert call["entity_type"] == "opportunities"
    assert call["entity_id"] == OPPORTUNITY
    # The org is tenancy, never the subject, when a real record exists.
    assert call["org_id"] == ORG
    assert call["entity_id"] != ORG
    assert call["payload"]["operator_message"] == "Suppressed after a hard bounce."


def test_inbound_anchor_wins_over_a_reused_thread(emitted):
    # Inbound reuses a canonical SMS thread by recipient key, whose primary
    # entity may be an older business object. Its own resolved anchor is the
    # subject; deriving from the thread would refile it onto the wrong record.
    emit_for_communication_message(
        org_id=ORG,
        thread=opportunity_thread(),
        subject_entity=("persons", PERSON),
        event_type="message_received",
        message_id=MESSAGE,
        thread_id=THREAD_ID,
        channel="sms",
        direction="inbound",
        body_text="STOP",
    )

    assert emitted[0]["entity_type"] == "persons"
    assert emitted[0]["entity_id"] == PERSON


# --- 6. blocked and deferred stay distinct ----------------------------------


def test_blocked_and_deferred_are_distinct_event_types(emitted):
    for event_type, outcome in (("message_blocked", "blocked"), ("message_deferred", "defer_until")):
        emit_for_communication_message(
            org_id=ORG,
            thread=opportunity_thread(),
            event_type=event_type,
            message_id=MESSAGE,
            thread_id=THREAD_ID,
            channel="sms",
            direction="outbound",
            body_text=None,
            extra={"outcome": outcome},
        )

    assert [c["event_type"] for c in emitted] == ["message_blocked", "message_deferred"]
    assert emitted[0]["payload"]["outcome"] == "blocked"
    assert emitted[1]["payload"]["outcome"] == "defer_until"
    # Both reach the same record — an operator reads one timeline.
    assert {c["entity_id"] for c in emitted} == {OPPORTUNITY}


# --- 7. history survives a later success ------------------------------------


def test_a_later_success_does_not_erase_the_earlier_refusal(emitted):
    """
    workflow_events is append-only: a deferred message that later dispatches
    emits message_sent ALONGSIDE the earlier message_deferred. The operator can
    still see that the platform held it and why.
    """
    emit_for_communication_message(
        org_id=ORG,
        thread=opportunity_thread(),
        event_type="message_deferred",
        message_id=MESSAGE,
        thread_id=THREAD_ID,
        channel="sms",
        direction="outbound",
        body_text=None,
        extra={"outcome": "defer_until", "reason": "QUIET_HOURS"},
    )
    emit_for_communication_message(
        org_id=ORG,
        thread=opportunity_thread(),
        event_type="message_sent",
        message_id=MESSAGE,
        thread_id=THREAD_ID,
        channel="sms",
        direction="outbound",
        body_text="Your tour is confirmed.",
    )

    assert [c["event_type"] for c in emitted] == ["message_deferred", "message_sent"]
    # Same message id, two durable events, neither overwritten.
    assert {c["payload"]["communication_message_id"] for c in emitted} == {MESSAGE}
    assert emitted[0]["payload"]["reason"] == "QUIET_HOURS"
