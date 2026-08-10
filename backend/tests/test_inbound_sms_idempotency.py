"""
Duplicate provider delivery converges to one canonical inbound message.

Twilio retries an inbound webhook until it receives a 2xx, and may redeliver the
same MessageSid regardless. Nothing prevented that from creating a second
canonical row, which would have meant a duplicated reply in the operator's
conversation, a second unread, a second Activity entry, and — worst — a second
execution of STOP.

The database owns the invariant (migration 20260810120000, a partial unique index
scoped to `direction = 'inbound'` so outbound provider-message behaviour is
untouched). These tests cover the application half: recognising a replay before
any work begins, and resolving the race when two deliveries pass that check at
once.
"""
import json

import app.services.communication_inbound as ci

ORG = "11111111-1111-4111-8111-111111111111"
SID = "SM0123456789abcdef0123456789abcdef"


class FakeResp:
    def __init__(self, data=None, ok=True, status=200):
        self.ok = ok
        self.status_code = status
        self._data = data if data is not None else []
        self.text = json.dumps(self._data)

    def json(self):
        return self._data


class FakeRequests:
    """Records every write so 'exactly once' can be asserted, not assumed."""

    def __init__(self, *, existing_inbound=None, insert_conflicts=False):
        self.existing_inbound = list(existing_inbound or [])
        self.insert_conflicts = insert_conflicts
        self.inserted_messages = []
        self.created_threads = []
        self.thread_patches = []
        self.inbound_lookups = []

    def get(self, url, headers=None, params=None, timeout=None):
        params = params or {}
        if "/communication_messages" in url and params.get("direction") == "eq.inbound":
            self.inbound_lookups.append(params)
            return FakeResp(list(self.existing_inbound))
        if "/communication_threads" in url:
            return FakeResp([{"id": "thread-1", "primary_entity_type": "persons"}])
        return FakeResp([])

    def post(self, url, headers=None, json=None, timeout=None):
        if "/communication_threads" in url:
            self.created_threads.append(json)
            return FakeResp([{"id": "thread-created-1"}])
        if "/communication_messages" in url:
            if self.insert_conflicts:
                # What PostgREST returns when the inbound identity index rejects
                # the row: the concurrent delivery already inserted it.
                self.existing_inbound = [
                    {"id": "msg-winner", "thread_id": "thread-1", "provider_message_id": SID}
                ]
                return FakeResp({"message": "duplicate key value"}, ok=False, status=409)
            self.inserted_messages.append(json)
            return FakeResp([{"id": "msg-new", "thread_id": "thread-1", "created_at": "2026-08-10T00:00:00Z"}])
        return FakeResp([])

    def patch(self, url, headers=None, json=None, params=None, timeout=None):
        self.thread_patches.append((url, json))
        return FakeResp([])


def _persist(monkeypatch, fake):
    monkeypatch.setattr(ci, "requests", fake)
    monkeypatch.setattr(ci, "_get_base_url", lambda: "http://fake")
    monkeypatch.setattr(ci, "_get_headers", lambda: {})
    return ci.persist_inbound_communication_sms(
        org_id=ORG,
        binding_id=None,
        from_num="+15551234567",
        to_num="+15559876543",
        body="Yes that works",
        external_sid=SID,
        primary_entity_hint=None,
    )


def test_redelivered_sid_creates_no_second_message(monkeypatch):
    fake = FakeRequests(
        existing_inbound=[{"id": "msg-first", "thread_id": "thread-1", "provider_message_id": SID}]
    )

    row = _persist(monkeypatch, fake)

    assert row is not None
    assert row["id"] == "msg-first"
    assert row[ci.IDEMPOTENT_REPLAY_KEY] is True
    assert fake.inserted_messages == []


def test_replay_creates_no_second_thread(monkeypatch):
    # The replay check runs BEFORE thread resolution precisely so a duplicate
    # cannot fork the conversation.
    fake = FakeRequests(
        existing_inbound=[{"id": "msg-first", "thread_id": "thread-1", "provider_message_id": SID}]
    )

    _persist(monkeypatch, fake)

    assert fake.created_threads == []


def test_replay_touches_no_thread_state(monkeypatch):
    # last_message_at bumps and outbound reply-stamping are side effects; running
    # them again would reorder the operator's inbox for a message already seen.
    fake = FakeRequests(
        existing_inbound=[{"id": "msg-first", "thread_id": "thread-1", "provider_message_id": SID}]
    )

    _persist(monkeypatch, fake)

    assert fake.thread_patches == []


def test_first_delivery_still_persists(monkeypatch):
    # The guard must not swallow genuine first deliveries.
    fake = FakeRequests(existing_inbound=[])

    row = _persist(monkeypatch, fake)

    assert row is not None
    assert row.get(ci.IDEMPOTENT_REPLAY_KEY) is None
    assert len(fake.inserted_messages) == 1
    assert fake.inserted_messages[0]["provider_message_id"] == SID
    assert fake.inserted_messages[0]["direction"] == "inbound"


def test_identity_lookup_is_org_and_direction_scoped(monkeypatch):
    fake = FakeRequests(existing_inbound=[])

    _persist(monkeypatch, fake)

    assert fake.inbound_lookups, "the replay check must actually query"
    q = fake.inbound_lookups[0]
    assert q["org_id"] == f"eq.{ORG}"
    assert q["direction"] == "eq.inbound"
    assert q["provider"] == "eq.twilio"
    assert q["channel"] == "eq.sms"
    assert q["provider_message_id"] == f"eq.{SID}"


def test_concurrent_delivery_losing_the_race_resolves_to_a_replay(monkeypatch):
    # Both deliveries pass the pre-check; the database rejects the loser. A 409
    # is the invariant working, so it must resolve to the winning row rather than
    # surfacing as a failure that makes Twilio retry forever.
    fake = FakeRequests(existing_inbound=[], insert_conflicts=True)

    row = _persist(monkeypatch, fake)

    assert row is not None
    assert row["id"] == "msg-winner"
    assert row[ci.IDEMPOTENT_REPLAY_KEY] is True


def test_body_is_not_identity(monkeypatch):
    # Two distinct messages saying the same thing are two messages. Identity is
    # the provider's id and nothing else.
    fake = FakeRequests(existing_inbound=[])
    monkeypatch.setattr(ci, "requests", fake)
    monkeypatch.setattr(ci, "_get_base_url", lambda: "http://fake")
    monkeypatch.setattr(ci, "_get_headers", lambda: {})

    ci.persist_inbound_communication_sms(
        org_id=ORG, binding_id=None, from_num="+15551234567", to_num="+15559876543",
        body="ok", external_sid="SMaaaa1111", primary_entity_hint=None,
    )
    ci.persist_inbound_communication_sms(
        org_id=ORG, binding_id=None, from_num="+15551234567", to_num="+15559876543",
        body="ok", external_sid="SMbbbb2222", primary_entity_hint=None,
    )

    assert len(fake.inserted_messages) == 2
