"""
ALY-14 — staging email/SMS reach only test recipients or the owner allowlist.

Proves the guard at the provider adapters (send_resend_email, send_sms,
send_sms_with_credentials): a staging refusal happens before any Twilio client or
Resend request exists, allowed recipients still reach the (faked) provider, a
dispatcher path inherits the refusal, and production is unchanged. No network:
Twilio's Client and requests.post are always faked.
"""
from __future__ import annotations

import os
import re
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.integrations import resend_client, twilio_client
from app.integrations import staging_outbound_guard as g
from app.services import message_sender as ms
from app.services.dispatch_eligibility import DispatchDecision

STAGING_URL = f"https://{g.ALLOY_STAGING_SUPABASE_PROJECT_REF}.supabase.co"
PRODUCTION_URL = "https://vslwnntzzgpnmrpjipat.supabase.co"

# Every environment signal the guard reads, cleared so a developer's backend/.env cannot leak in.
_SIGNALS = {
    "APP_ENV": "",
    "ALLOY_ENVIRONMENT": "",
    "NEXT_PUBLIC_APP_ENV": "",
    "VERCEL_ENV": "",
    "SUPABASE_URL": "",
    g.STAGING_EMAIL_ALLOWLIST_ENV: "",
    g.STAGING_SMS_ALLOWLIST_ENV: "",
}


def staging(**extra: str) -> dict:
    return {**_SIGNALS, "SUPABASE_URL": STAGING_URL, **extra}


def production(**extra: str) -> dict:
    return {**_SIGNALS, "SUPABASE_URL": PRODUCTION_URL, **extra}


class TestEnvironmentDetection(unittest.TestCase):
    def test_staging_project_ref_restricts(self):
        self.assertTrue(g.is_staging_outbound_runtime(staging()))

    def test_any_staging_label_restricts_even_on_production_ref(self):
        self.assertTrue(g.is_staging_outbound_runtime(production(APP_ENV="staging")))
        self.assertTrue(g.is_staging_outbound_runtime(production(ALLOY_ENVIRONMENT="Staging")))
        self.assertTrue(g.is_staging_outbound_runtime(production(VERCEL_ENV="preview")))

    def test_production_and_local_are_not_restricted(self):
        self.assertFalse(g.is_staging_outbound_runtime(production()))
        self.assertFalse(g.is_staging_outbound_runtime(production(APP_ENV="production")))
        self.assertFalse(g.is_staging_outbound_runtime({**_SIGNALS, "SUPABASE_URL": "http://127.0.0.1:54421"}))


class TestRecipientRules(unittest.TestCase):
    def test_controlled_test_email(self):
        for addr in (
            "parent@example.com",
            "Ops <ops@example.org>",
            "a@firefly.test",
            "x@sub.example",
            "delivered@resend.dev",
            "delivered+aly14@resend.dev",
        ):
            self.assertTrue(g.is_controlled_test_email(addr), addr)
        for addr in ("parent@gmail.com", "onboarding@resend.dev", "x@example.com.evil.io", "@example.com", "nobody"):
            self.assertFalse(g.is_controlled_test_email(addr), addr)

    def test_controlled_test_phone(self):
        for num in ("+12125550100", "(212) 555-0199", "2125550142"):
            self.assertTrue(g.is_controlled_test_phone(num), num)
        for num in ("+12125550200", "+15551234567", "+447700900123", "+15005550006"):
            self.assertFalse(g.is_controlled_test_phone(num), num)

    def test_owner_allowlist_is_exact(self):
        env = staging(**{
            g.STAGING_EMAIL_ALLOWLIST_ENV: "Owner@Alloy.dev, second@alloy.dev",
            g.STAGING_SMS_ALLOWLIST_ENV: "+1 (415) 555-1234;+14155559876",
        })
        self.assertTrue(g.is_owner_allowlisted_email("owner@alloy.dev", env))
        self.assertTrue(g.is_owner_allowlisted_email("Kelly <SECOND@alloy.dev>", env))
        self.assertFalse(g.is_owner_allowlisted_email("owner+x@alloy.dev", env))
        self.assertFalse(g.is_owner_allowlisted_email("someone@alloy.dev", env))
        self.assertTrue(g.is_owner_allowlisted_phone("4155551234", env))
        self.assertTrue(g.is_owner_allowlisted_phone("+14155559876", env))
        self.assertFalse(g.is_owner_allowlisted_phone("+14155550000", env))


def _twilio_client_fake():
    client = MagicMock()
    client.messages.create.return_value = MagicMock(sid="SMfake000001", status="queued")
    return MagicMock(return_value=client), client


class TestSmsAdapterBoundary(unittest.TestCase):
    def _send(self, env: dict, to: str):
        factory, client = _twilio_client_fake()
        with (
            patch.dict(os.environ, env, clear=False),
            patch.object(twilio_client, "Client", factory),
            patch.object(twilio_client, "TWILIO_ACCOUNT_SID", "ACfake"),
            patch.object(twilio_client, "TWILIO_AUTH_TOKEN", "fake"),
            patch.object(twilio_client, "TWILIO_MESSAGING_SERVICE_SID", "MGfake"),
        ):
            try:
                out = twilio_client.send_sms(to, "hello")
            except g.StagingRecipientRefused as e:
                return e, factory, client
        return out, factory, client

    def test_staging_blocks_real_number_before_client_exists(self):
        out, factory, client = self._send(staging(), "+14155550000")
        self.assertIsInstance(out, g.StagingRecipientRefused)
        self.assertTrue(str(out).startswith(g.STAGING_RECIPIENT_REFUSED))
        self.assertNotIn("4155550000", str(out))  # masked in the error that lands on the row
        factory.assert_not_called()
        client.messages.create.assert_not_called()

    def test_staging_allows_test_number(self):
        out, _, client = self._send(staging(), "+12125550123")
        self.assertEqual(out["sid"], "SMfake000001")
        client.messages.create.assert_called_once()

    def test_staging_allows_owner_allowlisted_number(self):
        out, _, client = self._send(staging(**{g.STAGING_SMS_ALLOWLIST_ENV: "+14155551234"}), "+14155551234")
        self.assertEqual(out["sid"], "SMfake000001")
        self.assertEqual(client.messages.create.call_args.kwargs["to"], "+14155551234")

    def test_binding_credentials_path_is_guarded_too(self):
        factory, client = _twilio_client_fake()
        with patch.dict(os.environ, staging(), clear=False), patch.object(twilio_client, "Client", factory):
            with self.assertRaises(g.StagingRecipientRefused):
                twilio_client.send_sms_with_credentials(
                    "+14155550000", "hi", account_sid="ACx", auth_token="t", messaging_service_sid="MGx"
                )
        factory.assert_not_called()

    def test_production_unchanged_for_any_number(self):
        out, _, client = self._send(production(), "+14155550000")
        self.assertEqual(out["sid"], "SMfake000001")
        self.assertEqual(client.messages.create.call_args.kwargs["to"], "+14155550000")


class TestEmailAdapterBoundary(unittest.TestCase):
    def _send(self, env: dict, to: str):
        post = MagicMock()
        post.return_value = MagicMock(ok=True, text='{"id":"re_fake"}', json=MagicMock(return_value={"id": "re_fake"}))
        with patch.dict(os.environ, env, clear=False), patch.object(resend_client.requests, "post", post):
            try:
                out = resend_client.send_resend_email(
                    to_email=to,
                    subject="s",
                    html_body=None,
                    text_body="t",
                    from_email="ops@alloy.dev",
                    api_key="re_fake_key",
                )
            except g.StagingRecipientRefused as e:
                return e, post
        return out, post

    def test_staging_blocks_real_inbox_before_request(self):
        out, post = self._send(staging(), "parent@gmail.com")
        self.assertIsInstance(out, g.StagingRecipientRefused)
        post.assert_not_called()

    def test_staging_allows_test_inbox(self):
        out, post = self._send(staging(), "delivered@resend.dev")
        self.assertEqual(out["id"], "re_fake")
        self.assertEqual(post.call_args.kwargs["json"]["to"], ["delivered@resend.dev"])

    def test_staging_allows_owner_allowlisted_inbox(self):
        out, post = self._send(staging(**{g.STAGING_EMAIL_ALLOWLIST_ENV: "owner@alloy.dev"}), "owner@alloy.dev")
        self.assertEqual(out["id"], "re_fake")
        post.assert_called_once()

    def test_production_unchanged_for_any_inbox(self):
        out, post = self._send(production(), "parent@gmail.com")
        self.assertEqual(out["id"], "re_fake")
        self.assertEqual(post.call_args.kwargs["json"]["to"], ["parent@gmail.com"])


class TestDispatcherInheritsGuard(unittest.TestCase):
    """The legacy SMS dispatcher calls the REAL send_sms: a staging refusal fails the row, Twilio untouched."""

    def _run(self, env: dict):
        row = {
            "id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            "to_value": "+14155550000",
            "body": "hello",
            "workflow_run_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            "status": "queued",
            "channel": "sms",
            "direction": "outbound",
        }

        def fake_get(url, headers=None, params=None, timeout=None):  # noqa: ARG001
            resp = MagicMock(ok=True)
            if url.endswith("/messages"):
                resp.json.return_value = [row]
            elif url.endswith("/workflow_runs"):
                resp.json.return_value = [{"id": row["workflow_run_id"], "org_id": "11111111-1111-4111-8111-111111111111"}]
            else:
                resp.json.return_value = []
            return resp

        factory, client = _twilio_client_fake()
        patch_resp = MagicMock(ok=True, text="", status_code=200)
        with (
            patch.dict(os.environ, env, clear=False),
            patch.object(ms, "_get_base_url", return_value="https://example.invalid/rest/v1"),
            patch.object(ms, "_get_headers", return_value={"Authorization": "Bearer x"}),
            patch.object(ms.requests, "get", side_effect=fake_get),
            patch.object(ms.requests, "patch", return_value=patch_resp) as patch_mock,
            patch.object(ms, "revalidate_for_dispatch", return_value=DispatchDecision("send_now")),
            patch.object(ms, "emit_message_lifecycle_event", MagicMock()),
            patch.object(twilio_client, "Client", factory),
            patch.object(twilio_client, "TWILIO_ACCOUNT_SID", "ACfake"),
            patch.object(twilio_client, "TWILIO_AUTH_TOKEN", "fake"),
            patch.object(twilio_client, "TWILIO_MESSAGING_SERVICE_SID", "MGfake"),
        ):
            out = ms.process_queued_messages(limit=10)
        return out, client, patch_mock

    def test_staging_row_fails_closed_without_twilio(self):
        out, client, patch_mock = self._run(staging())
        self.assertEqual(out["sent"], 0)
        self.assertEqual(out["failed"], 1)
        self.assertIn(g.STAGING_RECIPIENT_REFUSED, out["errors"][0])
        client.messages.create.assert_not_called()
        statuses = [(c.kwargs.get("json") or {}).get("status") for c in patch_mock.call_args_list]
        self.assertIn("failed", statuses)
        self.assertNotIn("sent", statuses)

    def test_production_row_still_sends(self):
        out, client, _ = self._run(production())
        self.assertEqual(out["sent"], 1)
        client.messages.create.assert_called_once()


class TestNoUnguardedProviderCalls(unittest.TestCase):
    """Only the guarded adapters may build a Twilio client or POST to Resend's send endpoint."""

    def test_provider_calls_live_only_in_guarded_adapters(self):
        app = Path(__file__).resolve().parents[1] / "app"
        offenders = []
        for path in app.rglob("*.py"):
            rel = path.relative_to(app).as_posix()
            if rel in ("integrations/twilio_client.py", "integrations/resend_client.py"):
                continue
            src = path.read_text(encoding="utf-8")
            if re.search(r"from\s+twilio\.rest\s+import|twilio\.rest\.Client|api\.resend\.com/emails", src):
                offenders.append(rel)
        self.assertEqual(offenders, [])

    def test_guard_precedes_provider_call_in_each_adapter(self):
        integ = Path(__file__).resolve().parents[1] / "app" / "integrations"
        twilio_src = (integ / "twilio_client.py").read_text(encoding="utf-8")
        for fn in ("def send_sms(", "def send_sms_with_credentials("):
            body = twilio_src[twilio_src.index(fn):]
            self.assertLess(body.index('guard_outbound_recipients("sms"'), body.index("Client("))
        resend_src = (integ / "resend_client.py").read_text(encoding="utf-8")
        self.assertLess(resend_src.index('guard_outbound_recipients("email"'), resend_src.index("requests.post("))


if __name__ == "__main__":
    unittest.main()
