"""
Phone formatting must not decide identity.

THE LIVE DEFECT. A Director texted from a number an Alloy Person already owned
and got "Unidentified sender". `persons.phone` held `6022904816`; the inbound
number normalized to `+16022904816`; the resolver compared them with string
equality. Exactly one canonical Person owned the endpoint and Alloy could not
see it.

The fix widens what counts as the SAME number. It must never widen what counts
as a MATCH — zero stays unresolved, many stays ambiguous, and nothing crosses a
tenant boundary.
"""

import app.services.communication_inbound as ci


class Recorder:
    """Captures the PostgREST query the resolver actually issues."""

    def __init__(self, rows):
        self.rows = rows
        self.params = None

    def get(self, url, headers=None, params=None, timeout=None):
        self.params = params
        rows = self.rows

        class R:
            ok = True

            @staticmethod
            def json():
                return rows

        return R()


ORG = "org-1"


def test_every_stored_format_collapses_to_one_canonical_endpoint():
    canonical = "6022904816"
    for raw in [
        "6022904816",
        "(602) 290-4816",
        "602-290-4816",
        "602.290.4816",
        "+1 602 290 4816",
        "+16022904816",
        "1-602-290-4816",
        "  +1 (602) 290-4816  ",
    ]:
        assert ci.canonical_phone_identity(raw) == canonical, raw


def test_short_or_malformed_numbers_never_produce_a_lookup_key():
    # A false match would file one family's message on another family's record.
    for raw in ["", "   ", "abc", "911", "12345", "+1", "0000"]:
        assert ci.canonical_phone_identity(raw) == ""


def test_the_resolver_queries_the_canonical_column_org_scoped(monkeypatch):
    rec = Recorder([{"id": "person-1"}])
    monkeypatch.setattr(ci.requests, "get", rec.get)
    out = ci._persons_by_phone_org("http://fake", {}, ORG, "+16022904816")
    assert out == [{"id": "person-1"}]
    # Canonical, not the E.164 string — and never without the tenant.
    assert rec.params["phone_canonical"] == "eq.6022904816"
    assert rec.params["org_id"] == f"eq.{ORG}"
    assert "phone" not in rec.params


def test_a_ten_digit_stored_row_is_reachable_from_an_e164_inbound(monkeypatch):
    """The exact Director case, at the query layer."""
    rec = Recorder([{"id": "kelly"}])
    monkeypatch.setattr(ci.requests, "get", rec.get)
    assert ci._persons_by_phone_org("http://fake", {}, ORG, "+16022904816") == [{"id": "kelly"}]
    assert rec.params["phone_canonical"] == "eq.6022904816"


def test_a_malformed_inbound_number_never_reaches_the_database(monkeypatch):
    called = {"n": 0}

    def explode(*a, **k):
        called["n"] += 1
        raise AssertionError("must not query on an unusable number")

    monkeypatch.setattr(ci.requests, "get", explode)
    assert ci._persons_by_phone_org("http://fake", {}, ORG, "12345") == []
    assert ci._persons_by_phone_org("http://fake", {}, ORG, "") == []
    assert called["n"] == 0


def test_zero_matches_stays_unresolved(monkeypatch):
    rec = Recorder([])
    monkeypatch.setattr(ci.requests, "get", rec.get)
    et, eid, tm, mm = ci.resolve_inbound_sms_anchor_with_metadata("http://fake", {}, ORG, "+16025550000")
    assert et == "communications_unknown"
    assert tm["inbound_resolution"] == "unknown_sender"


def test_exactly_one_match_resolves_to_that_person(monkeypatch):
    rec = Recorder([{"id": "kelly"}])
    monkeypatch.setattr(ci.requests, "get", rec.get)
    et, eid, tm, mm = ci.resolve_inbound_sms_anchor_with_metadata("http://fake", {}, ORG, "+16022904816")
    assert et == "persons"
    assert eid == "kelly"
    assert tm.get("inbound_resolution") != "unknown_sender"


def test_two_persons_sharing_the_endpoint_stay_ambiguous(monkeypatch):
    """Widening the match must not become guessing."""
    rec = Recorder([{"id": "a"}, {"id": "b"}])
    monkeypatch.setattr(ci.requests, "get", rec.get)
    et, eid, tm, mm = ci.resolve_inbound_sms_anchor_with_metadata("http://fake", {}, ORG, "+16022904816")
    assert et == "communications_unknown"
    candidates = tm.get("candidate_person_ids") or mm.get("candidate_person_ids")
    assert candidates is not None, "ambiguity must be preserved, not discarded"
    assert set(candidates) == {"a", "b"}


def test_the_tenant_filter_is_not_optional(monkeypatch):
    """The same number in another org must not be reachable."""
    rec = Recorder([{"id": "other-org-person"}])
    monkeypatch.setattr(ci.requests, "get", rec.get)
    ci._persons_by_phone_org("http://fake", {}, "org-2", "+16022904816")
    assert rec.params["org_id"] == "eq.org-2"
