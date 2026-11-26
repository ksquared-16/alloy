"""Python certification tests for Communications Identity resolver."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from app.services.communications.identity_resolver import (
    binding_dict_from_identity,
    resolve_persisted_outbound_identity,
)


class IdentityResolverTests(unittest.TestCase):
    def test_binding_dict_from_identity_maps_fields(self) -> None:
        identity = {
            "id": "ident-1",
            "org_id": "org-1",
            "channel": "sms",
            "normalized_address": "+15551234567",
            "display_name": "Campus SMS",
            "status": "active",
            "legacy_binding_id": "bind-1",
            "provider_account_id": "acct-1",
        }
        account = {
            "id": "acct-1",
            "org_id": "org-1",
            "provider_type": "twilio",
            "secret_ref": "env:TWILIO",
            "config": {"messaging_service_sid": "MG1", "twilio_account_sid": "AC1"},
        }
        out = binding_dict_from_identity(identity, account)
        self.assertEqual(out["id"], "bind-1")
        self.assertEqual(out["provider"], "twilio")
        self.assertEqual(out["communication_identity_id"], "ident-1")
        self.assertEqual(out["communication_provider_account_id"], "acct-1")
        self.assertEqual(out["secret_ref"], "env:TWILIO")

    @patch("app.services.communications.identity_resolver.find_identity_by_id")
    @patch("app.services.communications.identity_resolver.find_provider_account_by_id")
    def test_resolve_persisted_outbound_identity_success(
        self, mock_acct: MagicMock, mock_ident: MagicMock
    ) -> None:
        mock_ident.return_value = {
            "id": "ident-1",
            "org_id": "org-1",
            "channel": "sms",
            "provider_account_id": "acct-1",
            "legacy_binding_id": "bind-1",
            "status": "active",
        }
        mock_acct.return_value = {
            "id": "acct-1",
            "org_id": "org-1",
            "provider_type": "twilio",
            "secret_ref": "env:TWILIO",
            "config": {},
        }
        row = {
            "org_id": "org-1",
            "communication_identity_id": "ident-1",
            "communication_provider_account_id": "acct-1",
        }
        out = resolve_persisted_outbound_identity("http://x", {}, row)
        self.assertIsNotNone(out)
        assert out is not None
        self.assertEqual(out["communication_identity_id"], "ident-1")

    @patch("app.services.communications.identity_resolver.find_identity_by_id")
    def test_resolve_persisted_outbound_identity_tenant_mismatch_fails(
        self, mock_ident: MagicMock
    ) -> None:
        mock_ident.return_value = {
            "id": "ident-1",
            "org_id": "org-other",
            "provider_account_id": "acct-1",
        }
        row = {
            "org_id": "org-1",
            "communication_identity_id": "ident-1",
            "communication_provider_account_id": "acct-1",
        }
        out = resolve_persisted_outbound_identity("http://x", {}, row)
        self.assertIsNone(out)

    def test_resolve_persisted_outbound_identity_missing_id_returns_none(self) -> None:
        out = resolve_persisted_outbound_identity("http://x", {}, {"org_id": "org-1"})
        self.assertIsNone(out)


if __name__ == "__main__":
    unittest.main()
