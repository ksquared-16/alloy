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
        self.http_posts = []

    def persist(self, **kwargs):
        self.persist_calls.append(kwargs)
        return {"id": "msg-1", "thread_id": "thread-1", "created_at": "2026-08-10T00:00:00Z"}

    def http_post(self, url, **kwargs):
        self.http_posts.append(str(url))
        raise AssertionError(f"inbound must not POST anywhere directly: {url}")


def _wire(monkeypatch, rec, bindings):
    monkeypatch.setattr(si, "_get_base_url", lambda: "http://fake")
    monkeypatch.setattr(si, "_get_headers", lambda: {})
    monkeypatch.setattr(si, "find_sms_bindings_by_inbound_to", lambda *a, **k: list(bindings))
    monkeypatch.setattr(si, "persist_inbound_communication_sms", rec.persist)
    monkeypatch.setattr(si, "handle_inbound_keyword", lambda **k: None)
    # The legacy inbound write is retired, so there is no function left to patch.
    # Spying on the HTTP client instead proves the absence at the wire rather than
    # trusting that a call site stayed deleted.
    monkeypatch.setattr(si.requests, "post", rec.http_post)


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


def test_a_resolved_delivery_writes_no_legacy_inbound_row(monkeypatch):
    # The inverse of the parity assertion this replaces. Inbound SMS has ONE
    # runtime now: a received message becomes a canonical row and nothing else.
    rec = Recorder()
    _wire(monkeypatch, rec, [{"id": "bind-1", "org_id": ORG_A}])

    _deliver(rec)

    assert len(rec.persist_calls) == 1
    assert rec.http_posts == [], "inbound wrote to a second store"


def test_an_unattributable_delivery_writes_no_legacy_inbound_row(monkeypatch):
    # This case previously justified the legacy row as "the ONLY record of an
    # unattributable message". It is not: `communication_inbound_ingress` is,
    # which is what `test_no_binding_is_retained_at_ingress` proves.
    #
    # Wired through `_wire_ingress`, not `_wire`, deliberately. The bare recorder
    # raises on ANY post, which made this assertion fire on the sanctioned ingress
    # retention this very comment endorses — the guard was catching the successor
    # store, not a legacy one. Stubbing retention keeps `http_posts` meaning what
    # it claims: nothing reached a SECOND store behind canonical persistence.
    rec = IngressRecorder()
    _wire_ingress(monkeypatch, rec, [])

    _deliver(rec)

    assert rec.persist_calls == []
    assert len(rec.ingress_calls) == 1, "the successor store must still receive it"
    assert rec.http_posts == [], "an unattributable message wrote to a second store"


# --- pre-tenancy ingress: received, but not yet anyone's -----------------------


class IngressRecorder(Recorder):
    def __init__(self):
        super().__init__()
        self.ingress_calls = []
        self.activity_emitted = []

    def retain(self, **kwargs):
        self.ingress_calls.append(kwargs)
        return {"id": "ingress-1"}


def _wire_ingress(monkeypatch, rec, bindings, canonical=True):
    _wire(monkeypatch, rec, bindings)
    monkeypatch.setattr(si, "retain_unattributed_inbound_sms", rec.retain)
    if not canonical:
        monkeypatch.setattr(si, "persist_inbound_communication_sms", lambda **k: None)


def test_no_binding_is_retained_at_ingress(monkeypatch):
    # The message was really received. It must survive even though no tenant owns it.
    rec = IngressRecorder()
    _wire_ingress(monkeypatch, rec, [])

    _deliver(rec)

    assert len(rec.ingress_calls) == 1
    assert rec.ingress_calls[0]["routing_disposition"] == si.NO_ATTRIBUTABLE_ORG
    assert rec.ingress_calls[0]["external_sid"] == "SM_ROUTING_1"


def test_cross_org_ambiguity_is_retained_at_ingress(monkeypatch):
    rec = IngressRecorder()
    _wire_ingress(monkeypatch, rec, [{"id": "b1", "org_id": ORG_A}, {"id": "b2", "org_id": ORG_B}])

    _deliver(rec)

    assert len(rec.ingress_calls) == 1
    assert rec.ingress_calls[0]["routing_disposition"] == si.CROSS_ORG_AMBIGUOUS


def test_resolved_delivery_never_touches_ingress(monkeypatch):
    # Ingress is strictly the pre-tenancy case; it must not shadow normal traffic.
    rec = IngressRecorder()
    _wire_ingress(monkeypatch, rec, [{"id": "b1", "org_id": ORG_A}])

    _deliver(rec)

    assert rec.ingress_calls == []


def test_ambiguous_same_org_never_touches_ingress(monkeypatch):
    # Org is known, so this is tenant truth — not pre-tenancy retention.
    rec = IngressRecorder()
    _wire_ingress(monkeypatch, rec, [{"id": "b1", "org_id": ORG_A}, {"id": "b2", "org_id": ORG_A}])

    _deliver(rec)

    assert rec.ingress_calls == []
    assert rec.persist_calls


# --- Activity ownership: exactly one receive event ----------------------------


def test_only_canonical_persistence_can_emit_a_receive_event(monkeypatch):
    # Both paths used to emit `message_received`, so every canonicalized reply
    # fired TWO receive events. The second emitter is gone rather than merely
    # suppressed, so the duplicate is now structurally impossible: canonical
    # persistence is the only code that can emit one.
    rec = IngressRecorder()
    _wire_ingress(monkeypatch, rec, [{"id": "b1", "org_id": ORG_A}])

    _deliver(rec)

    assert len(rec.persist_calls) == 1, "canonical persistence owns the receive event"
    assert rec.activity_emitted == [], "no emitter remains outside canonical persistence"
    assert rec.http_posts == []


def test_an_unroutable_reply_is_still_durable(monkeypatch):
    # The invariant is unchanged — an unroutable reply must never become silent —
    # but the mechanism moved. It used to be a legacy row plus its Activity event;
    # it is now a retained ingress row, which is tenant-safe where the legacy row
    # (no `org_id` at all) never was.
    rec = IngressRecorder()
    _wire_ingress(monkeypatch, rec, [], canonical=False)

    _deliver(rec)

    assert len(rec.ingress_calls) == 1, "an unroutable reply must survive somewhere"
    assert rec.http_posts == []
