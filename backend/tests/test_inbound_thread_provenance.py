"""
A reply joins the conversation it was actually a reply to.

Thread selection used to be "the first thread with a matching phone number",
which was wrong in two ways it could not detect. A parent with an Enrollment
thread and a Billing thread got whichever thread was found first, regardless of
what Alloy had just said to them. And a parent texting two different Alloy numbers
collapsed into one conversation, because the sender matched and the destination
was never considered.

Twilio inbound SMS carries only From, To, Body and MessageSid — there is no
email-style In-Reply-To, and inventing one would be inventing evidence. The
strongest truthful provenance is the endpoint pair: the most recent outbound
message Alloy sent to THIS sender FROM THIS destination is what is being replied
to, and its thread is the conversation.

Where that evidence does not separate the candidates, it stays unseparated.
"""
import json

import app.services.communication_inbound as ci

ORG = "11111111-1111-4111-8111-111111111111"
PARENT = "+15551234567"
ALLOY_A = "+15559990000"
ALLOY_B = "+15559991111"


class FakeResp:
    def __init__(self, data=None, ok=True, status=200):
        self.ok = ok
        self.status_code = status
        self._data = data if data is not None else []
        self.text = json.dumps(self._data)

    def json(self):
        return self._data


class FakeRequests:
    def __init__(self, outbound):
        self.outbound = outbound

    def get(self, url, headers=None, params=None, timeout=None):
        params = params or {}
        if "/communication_messages" in url and params.get("direction") == "eq.outbound":
            return FakeResp(list(self.outbound))
        return FakeResp([])


def _resolve(monkeypatch, outbound, sender=PARENT, destination=ALLOY_A):
    fake = FakeRequests(outbound)
    monkeypatch.setattr(ci, "requests", fake)
    return ci.find_thread_by_outbound_provenance(
        "http://fake", {}, org_id=ORG, sender=sender, destination=destination
    )


def ob(thread, at, to=PARENT, frm=ALLOY_A, mid="m1"):
    return {"id": mid, "thread_id": thread, "to_address": to, "from_address": frm, "created_at": at}


def test_one_sender_one_thread_resolves(monkeypatch):
    tid, meta = _resolve(monkeypatch, [ob("thread-enroll", "2026-08-10T10:00:00Z")])

    assert tid == "thread-enroll"
    assert meta["thread_provenance"] == "outbound_endpoint_pair"


def test_most_recent_outbound_thread_wins(monkeypatch):
    # Enrollment + Billing. Alloy last spoke from Billing, so the reply is to Billing.
    tid, meta = _resolve(
        monkeypatch,
        [
            ob("thread-billing", "2026-08-10T12:00:00Z", mid="m-billing"),
            ob("thread-enroll", "2026-08-09T09:00:00Z", mid="m-enroll"),
        ],
    )

    assert tid == "thread-billing"
    assert meta["provenance_outbound_message_id"] == "m-billing"
    assert meta["provenance_candidate_thread_count"] == 2


def test_destination_separates_two_alloy_numbers(monkeypatch):
    # Same parent, two Alloy numbers. A sender match alone would have merged these.
    outbound = [
        ob("thread-on-A", "2026-08-10T12:00:00Z", frm=ALLOY_A),
        ob("thread-on-B", "2026-08-10T13:00:00Z", frm=ALLOY_B),
    ]

    tid_a, _ = _resolve(monkeypatch, outbound, destination=ALLOY_A)
    tid_b, _ = _resolve(monkeypatch, outbound, destination=ALLOY_B)

    assert tid_a == "thread-on-A"
    assert tid_b == "thread-on-B"


def test_newer_outbound_on_another_number_does_not_steal_the_reply(monkeypatch):
    # The B conversation is newer, but the parent replied to A.
    tid, _ = _resolve(
        monkeypatch,
        [
            ob("thread-on-B", "2026-08-10T13:00:00Z", frm=ALLOY_B),
            ob("thread-on-A", "2026-08-10T12:00:00Z", frm=ALLOY_A),
        ],
        destination=ALLOY_A,
    )

    assert tid == "thread-on-A"


def test_equally_recent_threads_stay_ambiguous(monkeypatch):
    # Same instant, two conversations. Recency cannot separate them, so nothing does.
    tid, meta = _resolve(
        monkeypatch,
        [
            ob("thread-one", "2026-08-10T12:00:00Z", mid="m1"),
            ob("thread-two", "2026-08-10T12:00:00Z", mid="m2"),
        ],
    )

    assert tid is None
    assert meta["thread_provenance"] == "ambiguous"
    assert meta["candidate_thread_ids"] == ["thread-one", "thread-two"]


def test_no_prior_outbound_yields_no_provenance(monkeypatch):
    tid, meta = _resolve(monkeypatch, [])

    assert tid is None
    assert meta["thread_provenance"] == "none"


def test_outbound_to_someone_else_is_not_provenance(monkeypatch):
    # A shared household phone must not inherit a sibling's conversation just
    # because Alloy texted that number about someone else.
    tid, meta = _resolve(monkeypatch, [ob("thread-other", "2026-08-10T12:00:00Z", to="+15558887777")])

    assert tid is None
    assert meta["reason"] == "no_outbound_on_this_endpoint_pair"


def test_address_formatting_does_not_defeat_provenance(monkeypatch):
    # Stored as authored; "+15551234567" and "5551234567" are one number.
    tid, _ = _resolve(
        monkeypatch,
        [ob("thread-enroll", "2026-08-10T12:00:00Z", to="5551234567", frm="5559990000")],
    )

    assert tid == "thread-enroll"


def test_lookup_failure_is_not_a_guess(monkeypatch):
    class Failing:
        def get(self, *a, **k):
            return FakeResp([], ok=False, status=500)

    monkeypatch.setattr(ci, "requests", Failing())
    tid, meta = ci.find_thread_by_outbound_provenance(
        "http://fake", {}, org_id=ORG, sender=PARENT, destination=ALLOY_A
    )

    assert tid is None
    assert meta["thread_provenance"] == "unavailable"


def test_missing_endpoint_yields_no_provenance(monkeypatch):
    tid, meta = _resolve(monkeypatch, [ob("t", "2026-08-10T12:00:00Z")], destination="")

    assert tid is None
    assert meta["reason"] == "missing_endpoint"
