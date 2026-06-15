"""P4 — inbound SMS fixes: G1 replied_at, G2 last_message_at, G4 canonical thread reuse, G6 attention_state."""
import json
import pytest

import app.services.communication_inbound as ci

ORG = "11111111-1111-4111-8111-111111111111"
PERSON = "22222222-2222-4222-8222-222222222222"


class FakeResp:
    def __init__(self, data=None, ok=True, status=200):
        self.ok = ok
        self.status_code = status
        self._data = data if data is not None else []
        self.text = json.dumps(self._data)

    def json(self):
        return self._data


class FakeRequests:
    def __init__(self, *, persons, existing_threads, outbound_msgs):
        self.persons = persons
        self.existing_threads = existing_threads
        self.outbound_msgs = outbound_msgs
        self.created_threads = []
        self.inserted_messages = []
        self.thread_patches = []
        self.msg_patches = []
        self.recipient_patches = []
        self._mid = 0

    def get(self, url, headers=None, params=None, timeout=None):
        if "/persons" in url:
            return FakeResp(self.persons)
        if "/communication_threads" in url:
            return FakeResp(list(self.existing_threads))
        if "/communication_messages" in url and params and params.get("direction") == "eq.outbound":
            return FakeResp(list(self.outbound_msgs))
        return FakeResp([])

    def post(self, url, headers=None, json=None, timeout=None):
        if "/communication_threads" in url:
            self.created_threads.append(json)
            return FakeResp([{"id": "thread-created-1"}])
        if "/communication_messages" in url:
            self._mid += 1
            self.inserted_messages.append(json)
            row = dict(json)
            row["id"] = f"inbound-msg-{self._mid}"
            row["created_at"] = "2026-06-15T10:00:00+00:00"
            return FakeResp([row])
        return FakeResp([{"id": "x"}])

    def patch(self, url, headers=None, json=None, timeout=None):
        if "/communication_threads" in url:
            self.thread_patches.append((url, json))
        elif "/communication_message_recipients" in url:
            self.recipient_patches.append((url, json))
        elif "/communication_messages" in url:
            self.msg_patches.append((url, json))
        return FakeResp([])


@pytest.fixture(autouse=True)
def _stub(monkeypatch):
    monkeypatch.setattr(ci, "emit_for_communication_message", lambda **k: None)
    monkeypatch.setattr(ci, "_get_base_url", lambda: "http://fake")
    monkeypatch.setattr(ci, "_get_headers", lambda: {})


def _run(fr, from_num="+15551234567"):
    monkey = ci.requests
    ci.requests = fr
    try:
        return ci.persist_inbound_communication_sms(
            org_id=ORG, binding_id=None, from_num=from_num, to_num="+15557654321",
            body="hi", external_sid="SM1",
        )
    finally:
        ci.requests = monkey


def test_g4_reuses_existing_thread_and_g1_g2_g6():
    fr = FakeRequests(
        persons=[{"id": PERSON}],
        existing_threads=[{"id": "opp-thread", "primary_entity_type": "opportunities",
                           "last_message_at": "2026-06-14T00:00:00Z", "created_at": "2026-06-10T00:00:00Z"}],
        outbound_msgs=[{"id": "outbound-1", "replied_at": None}],
    )
    row = _run(fr)
    assert row and row["id"].startswith("inbound-msg")
    assert fr.created_threads == []  # G4: reused
    assert fr.inserted_messages[0]["thread_id"] == "opp-thread"
    assert any(p[1].get("attention_state") == "needs_response" for p in fr.thread_patches)  # G6
    assert any("last_message_at" in p[1] for p in fr.thread_patches)  # G2
    assert any(p[1].get("replied_at") for p in fr.msg_patches)  # G1 message
    assert any(p[1].get("status") == "replied" for p in fr.recipient_patches)  # G1 recipient


def test_g4_prefers_person_anchored_thread():
    fr = FakeRequests(
        persons=[{"id": PERSON}],
        existing_threads=[
            {"id": "opp-thread", "primary_entity_type": "opportunities", "last_message_at": "2026-06-14T00:00:00Z", "created_at": "2026-06-10T00:00:00Z"},
            {"id": "person-thread", "primary_entity_type": "persons", "last_message_at": "2026-06-13T00:00:00Z", "created_at": "2026-06-09T00:00:00Z"},
        ],
        outbound_msgs=[],
    )
    _run(fr)
    assert fr.inserted_messages[0]["thread_id"] == "person-thread"


def test_creates_person_thread_when_none_exists():
    fr = FakeRequests(persons=[{"id": PERSON}], existing_threads=[], outbound_msgs=[])
    _run(fr)
    assert len(fr.created_threads) == 1
    assert fr.created_threads[0]["primary_entity_type"] == "persons"


def test_unknown_sender_persists_with_surrogate_anchor():
    fr = FakeRequests(persons=[], existing_threads=[], outbound_msgs=[])
    row = _run(fr, from_num="+15559999999")
    assert row and row["id"]
    assert fr.created_threads[0]["primary_entity_type"] == "communications_unknown"


def test_already_replied_outbound_not_repatched():
    fr = FakeRequests(
        persons=[{"id": PERSON}],
        existing_threads=[{"id": "person-thread", "primary_entity_type": "persons", "last_message_at": "2026-06-14T00:00:00Z", "created_at": "2026-06-10T00:00:00Z"}],
        outbound_msgs=[{"id": "outbound-9", "replied_at": "2026-06-14T00:00:00Z"}],
    )
    _run(fr)
    assert fr.msg_patches == []
