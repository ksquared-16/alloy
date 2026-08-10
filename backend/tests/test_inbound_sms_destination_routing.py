"""
A reply Alloy cannot route must still become canonical truth.

Before this, an inbound SMS whose destination number matched no active binding —
or matched several — was skipped entirely: it landed only in legacy
`public.messages`, which no operator Communications surface reads. The parent's
reply was received and then effectively lost, and the compliance keyword handler,
which runs inside the canonical branch, never executed.

The split that matters is between "we don't know which BINDING received this" and
"we don't know which ORGANIZATION received this". `org_id` is NOT NULL on both
threads and messages, so the second case cannot be canonicalized without
attributing a real parent's words to a tenant that never received them — and
fabricating that is worse than surfacing the gap. The first case is fully
recoverable: the org is known, so the message becomes canonical and carries its
ambiguity instead of a guess.
"""
import json

import app.routes.sms_inbound as si

ORG_A = "11111111-1111-4111-8111-111111111111"
ORG_B = "22222222-2222-4222-8222-222222222222"


class Recorder:
    def __init__(self):
        self.persist_calls = []
        self.legacy_calls = []

    def persist(self, **kwargs):
        self.persist_calls.append(kwargs)
        return {"id": "msg-1", "thread_id": "thread-1", "created_at": "2026-08-10T00:00:00Z"}

    def legacy(self, **kwargs):
        self.legacy_calls.append(kwargs)
        return {"id": "legacy-1"}


def _wire(monkeypatch, rec, bindings):
    monkeypatch.setattr(si, "_get_base_url", lambda: "http://fake")
    monkeypatch.setattr(si, "_get_headers", lambda: {})
    monkeypatch.setattr(si, "find_sms_bindings_by_inbound_to", lambda *a, **k: list(bindings))
    monkeypatch.setattr(si, "persist_inbound_communication_sms", rec.persist)
    monkeypatch.setattr(si, "_insert_legacy_messages", rec.legacy)
    monkeypatch.setattr(si, "handle_inbound_keyword", lambda **k: None)


def _deliver(rec):
    return si._handle_inbound_with_optional_binding(
        binding_id=None,
        binding_row=None,
        from_num="+15551234567",
        to_num="+15559876543",
        body="Yes that works",
        message_sid="SM_ROUTING_1",
    )


def _routing(rec):
    assert rec.persist_calls, "canonical persistence was skipped entirely"
    return rec.persist_calls[0]["destination_routing"]


def test_single_binding_is_resolved(monkeypatch):
    rec = Recorder()
    _wire(monkeypatch, rec, [{"id": "bind-1", "org_id": ORG_A}])

    _deliver(rec)

    assert _routing(rec)["destination_routing_state"] == "resolved"
    assert rec.persist_calls[0]["binding_id"] == "bind-1"
    assert rec.persist_calls[0]["org_id"] == ORG_A


def test_ambiguous_binding_same_org_still_persists_canonically(monkeypatch):
    # The decisive case: binding undecidable, organization known. The reply
    # becomes canonical truth instead of disappearing.
    rec = Recorder()
    _wire(monkeypatch, rec, [{"id": "bind-1", "org_id": ORG_A}, {"id": "bind-2", "org_id": ORG_A}])

    _deliver(rec)

    r = _routing(rec)
    assert r["destination_routing_state"] == "ambiguous"
    assert r["destination_routing_reason"] == "multiple_active_bindings_for_destination"
    assert rec.persist_calls[0]["org_id"] == ORG_A


def test_ambiguous_binding_chooses_no_binding(monkeypatch):
    # Requirement 7: no routing branch may pick an arbitrary candidate.
    rec = Recorder()
    _wire(monkeypatch, rec, [{"id": "bind-1", "org_id": ORG_A}, {"id": "bind-2", "org_id": ORG_A}])

    _deliver(rec)

    assert rec.persist_calls[0]["binding_id"] is None


def test_ambiguous_binding_records_its_candidates(monkeypatch):
    # An operator resolving this later needs to know what the options were.
    rec = Recorder()
    _wire(monkeypatch, rec, [{"id": "bind-2", "org_id": ORG_A}, {"id": "bind-1", "org_id": ORG_A}])

    _deliver(rec)

    r = _routing(rec)
    assert r["candidate_binding_ids"] == ["bind-1", "bind-2"]
    assert r["candidate_binding_count"] == 2


def test_cross_org_ambiguity_never_picks_an_org(monkeypatch):
    # Requirement 12: org isolation. Handing this to either tenant would be worse
    # than surfacing that Alloy cannot attribute it.
    rec = Recorder()
    _wire(monkeypatch, rec, [{"id": "bind-1", "org_id": ORG_A}, {"id": "bind-2", "org_id": ORG_B}])

    _deliver(rec)

    assert rec.persist_calls == []


def test_no_binding_is_not_silently_dropped_from_the_legacy_record(monkeypatch):
    # Until an org-less canonical home exists, the legacy row is the ONLY record
    # of an unattributable message. It must still be written.
    rec = Recorder()
    _wire(monkeypatch, rec, [])

    _deliver(rec)

    assert rec.persist_calls == []
    assert len(rec.legacy_calls) == 1


def test_resolved_delivery_keeps_writing_legacy_during_parity(monkeypatch):
    # Legacy retirement is the END of convergence, not the first step.
    rec = Recorder()
    _wire(monkeypatch, rec, [{"id": "bind-1", "org_id": ORG_A}])

    _deliver(rec)

    assert len(rec.legacy_calls) == 1
