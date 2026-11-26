"""
The `vault:` grammar, from the Python side.

Alloy's credentials were all deployment environment variables, which made provider
setup an Alloy-employee act. `vault:` names an ORGANIZATION-owned credential
resolved through `public.org_provider_credential_resolve`.

These tests pin the two properties that make it safe rather than merely new:
an org-owned reference is never resolvable without an organization, and a
resolution failure never falls back to somebody else's credential.
"""

import app.services.communications.secret_ref as sr


class FakeResponse:
    def __init__(self, ok=True, status_code=200, payload=None):
        self.ok = ok
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def test_the_existing_grammar_is_unchanged():
    assert sr.resolve_secret_plaintext("") is None
    assert sr.resolve_secret_plaintext("unconfigured") is None
    assert sr.resolve_secret_plaintext("legacy_global_twilio") is None
    assert sr.resolve_secret_plaintext("not_a_convention") is None


def test_env_refs_still_resolve_and_ignore_org(monkeypatch):
    monkeypatch.setenv("SOME_DEPLOYMENT_KEY", "deployment-value")
    assert sr.resolve_secret_plaintext("env:SOME_DEPLOYMENT_KEY") == "deployment-value"
    # An org id is accepted and irrelevant for a deployment credential.
    assert sr.resolve_secret_plaintext("env:SOME_DEPLOYMENT_KEY", "org-1") == "deployment-value"


def test_an_org_owned_ref_without_an_org_is_refused_before_any_request(monkeypatch):
    """The authority would refuse anyway; refusing first avoids sending the
    reference anywhere it does not need to go."""
    called = {"n": 0}

    def explode(*a, **k):
        called["n"] += 1
        raise AssertionError("must not call the authority without an organization")

    monkeypatch.setattr(sr, "_resolve_org_owned", sr._resolve_org_owned)
    import requests

    monkeypatch.setattr(requests, "post", explode)
    assert sr.resolve_secret_plaintext("vault:11111111-1111-4111-8111-111111111111") is None
    assert sr.resolve_secret_plaintext("vault:11111111-1111-4111-8111-111111111111", "  ") is None
    assert called["n"] == 0


def test_an_org_owned_ref_resolves_through_the_authority(monkeypatch):
    seen = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        seen["url"] = url
        seen["json"] = json
        return FakeResponse(payload="re_live_value")

    monkeypatch.setattr("app.supabase_client._get_base_url", lambda: "http://fake")
    monkeypatch.setattr("app.supabase_client._get_headers", lambda: {})
    import requests

    monkeypatch.setattr(requests, "post", fake_post)

    got = sr.resolve_secret_plaintext("vault:22222222-2222-4222-8222-222222222222", "org-7")
    assert got == "re_live_value"
    # The org travels WITH the reference — tenancy is enforced by the authority.
    assert seen["url"].endswith("/rpc/org_provider_credential_resolve")
    assert seen["json"] == {
        "p_org_id": "org-7",
        "p_secret_ref": "vault:22222222-2222-4222-8222-222222222222",
    }


def test_a_refusal_yields_none_rather_than_an_exception(monkeypatch):
    monkeypatch.setattr("app.supabase_client._get_base_url", lambda: "http://fake")
    monkeypatch.setattr("app.supabase_client._get_headers", lambda: {})
    import requests

    monkeypatch.setattr(requests, "post", lambda *a, **k: FakeResponse(ok=False, status_code=403))
    assert sr.resolve_secret_plaintext("vault:33333333-3333-4333-8333-333333333333", "org-9") is None


def test_an_unreachable_authority_never_raises_into_a_send(monkeypatch):
    monkeypatch.setattr("app.supabase_client._get_base_url", lambda: "http://fake")
    monkeypatch.setattr("app.supabase_client._get_headers", lambda: {})
    import requests

    def boom(*a, **k):
        raise ConnectionError("down")

    monkeypatch.setattr(requests, "post", boom)
    assert sr.resolve_secret_plaintext("vault:44444444-4444-4444-8444-444444444444", "org-9") is None


def test_a_null_answer_is_not_mistaken_for_a_secret(monkeypatch):
    """The authority returns NULL for a reference the organization does not own."""
    monkeypatch.setattr("app.supabase_client._get_base_url", lambda: "http://fake")
    monkeypatch.setattr("app.supabase_client._get_headers", lambda: {})
    import requests

    monkeypatch.setattr(requests, "post", lambda *a, **k: FakeResponse(payload=None))
    assert sr.resolve_secret_plaintext("vault:55555555-5555-4555-8555-555555555555", "org-9") is None
    monkeypatch.setattr(requests, "post", lambda *a, **k: FakeResponse(payload="   "))
    assert sr.resolve_secret_plaintext("vault:55555555-5555-4555-8555-555555555555", "org-9") is None


def test_the_reference_is_never_logged(monkeypatch, caplog):
    """A log line pairing an organization with a credential reference is a small
    leak of its own, so the refusal path names neither."""
    caplog.set_level("WARNING")
    sr.resolve_secret_plaintext("vault:66666666-6666-4666-8666-666666666666")
    joined = " ".join(r.getMessage() for r in caplog.records)
    assert "66666666" not in joined
    assert "vault:" not in joined


def test_is_org_owned_secret_ref():
    assert sr.is_org_owned_secret_ref("vault:abc") is True
    assert sr.is_org_owned_secret_ref("env:RESEND_API_KEY") is False
    assert sr.is_org_owned_secret_ref("unconfigured") is False
    assert sr.is_org_owned_secret_ref(None) is False
