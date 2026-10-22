"""
Legacy public.messages SMS sender — Shared QA no-send at dispatch.

Proves process_queued_messages resolves org via workflow_runs, refuses both
frozen QA orgs, fails closed when org is unresolvable, never calls Twilio on
refusal, and still sends for authorized non-QA orgs.
"""
from __future__ import annotations

import os
import unittest
from typing import Dict, Optional
from unittest.mock import MagicMock, patch

from app.services.dispatch_eligibility import REGISTERED_QA_ORG_IDS
from app.services import message_sender as ms

QA_SHARED = "4acc9386-c485-486f-aa1f-05d83499d142"
QA_SECONDARY = "ad53fee2-2570-460f-9300-f0e106c473b6"
NON_QA = "11111111-1111-4111-8111-111111111111"
WR_QA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
WR_NON = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
MSG_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"


def _queued_row(*, workflow_run_id: Optional[str], msg_id: str = MSG_ID) -> dict:
    return {
        "id": msg_id,
        "to_value": "+15551234567",
        "body": "hello",
        "workflow_run_id": workflow_run_id,
        "status": "queued",
        "channel": "sms",
        "direction": "outbound",
    }


class TestMessageSenderQaRefuse(unittest.TestCase):
    def setUp(self) -> None:
        self.assertIn(QA_SHARED, REGISTERED_QA_ORG_IDS)
        self.assertIn(QA_SECONDARY, REGISTERED_QA_ORG_IDS)

    def _run(self, rows, org_by_wr: Dict[str, Optional[str]], send_sms=None):
        send = send_sms or MagicMock(return_value={"sid": "SMdeadbeef"})

        def fake_get(url, headers=None, params=None, timeout=None):  # noqa: ARG001
            resp = MagicMock()
            resp.ok = True
            resp.raise_for_status = MagicMock()
            if url.endswith("/messages"):
                resp.json.return_value = rows
            elif url.endswith("/workflow_runs"):
                wr = (params or {}).get("id", "").removeprefix("eq.")
                org = org_by_wr.get(wr)
                if org is None and wr not in org_by_wr:
                    resp.json.return_value = []
                elif org is None:
                    resp.json.return_value = [{"id": wr, "org_id": None}]
                else:
                    resp.json.return_value = [{"id": wr, "org_id": org}]
            else:
                resp.json.return_value = []
            return resp

        def fake_patch(url, headers=None, params=None, json=None, timeout=None):  # noqa: ARG001
            resp = MagicMock()
            resp.ok = True
            resp.text = ""
            resp.status_code = 200
            return resp

        with (
            patch.object(ms, "_get_base_url", return_value="https://example.invalid/rest/v1"),
            patch.object(ms, "_get_headers", return_value={"Authorization": "Bearer x"}),
            patch.object(ms.requests, "get", side_effect=fake_get),
            patch.object(ms.requests, "patch", side_effect=fake_patch) as patch_mock,
            patch.object(ms, "send_sms", send),
            patch.object(ms, "emit_message_lifecycle_event", MagicMock()),
        ):
            out = ms.process_queued_messages(limit=10)
            return out, send, patch_mock

    def test_qa_shared_refused_before_twilio(self):
        out, send, _ = self._run(
            [_queued_row(workflow_run_id=WR_QA)],
            {WR_QA: QA_SHARED},
        )
        self.assertEqual(out["sent"], 0)
        self.assertEqual(out["refused"], 1)
        self.assertEqual(out["failed"], 1)
        self.assertIn("QA_ORG_OUTBOUND_REFUSED", out["errors"][0])
        send.assert_not_called()

    def test_qa_secondary_refused_before_twilio(self):
        out, send, _ = self._run(
            [_queued_row(workflow_run_id=WR_QA, msg_id="dddddddd-dddd-4ddd-8ddd-dddddddddddd")],
            {WR_QA: QA_SECONDARY},
        )
        self.assertEqual(out["refused"], 1)
        self.assertIn("QA_ORG_OUTBOUND_REFUSED", out["errors"][0])
        send.assert_not_called()

    def test_missing_workflow_run_fails_closed(self):
        out, send, _ = self._run(
            [_queued_row(workflow_run_id=None)],
            {},
        )
        self.assertEqual(out["refused"], 1)
        self.assertIn("QA_ORG_OUTBOUND_ORG_UNRESOLVABLE", out["errors"][0])
        send.assert_not_called()

    def test_unknown_workflow_run_fails_closed(self):
        out, send, _ = self._run(
            [_queued_row(workflow_run_id=WR_QA)],
            {},  # lookup returns empty
        )
        self.assertEqual(out["refused"], 1)
        self.assertIn("QA_ORG_OUTBOUND_ORG_UNRESOLVABLE", out["errors"][0])
        send.assert_not_called()

    def test_null_org_on_run_fails_closed(self):
        out, send, _ = self._run(
            [_queued_row(workflow_run_id=WR_QA)],
            {WR_QA: None},
        )
        self.assertEqual(out["refused"], 1)
        self.assertIn("QA_ORG_OUTBOUND_ORG_UNRESOLVABLE", out["errors"][0])
        send.assert_not_called()

    def test_non_qa_still_sends(self):
        out, send, patch_mock = self._run(
            [_queued_row(workflow_run_id=WR_NON)],
            {WR_NON: NON_QA},
        )
        self.assertEqual(out["sent"], 1)
        self.assertEqual(out["refused"], 0)
        send.assert_called_once_with("+15551234567", "hello")
        # Final patch should be status=sent
        sent_patches = [
            c.kwargs.get("json") or (c.args[3] if len(c.args) > 3 else None)
            for c in patch_mock.call_args_list
        ]
        self.assertTrue(any(isinstance(p, dict) and p.get("status") == "sent" for p in sent_patches))


class TestBuildInfo(unittest.TestCase):
    def test_build_info_ok_with_render_env(self):
        from fastapi.testclient import TestClient
        from app.server import app

        with patch.dict(
            "os.environ",
            {
                "RENDER_GIT_COMMIT": "4582348c3d8f697a25f0176ae77919f01427f760",
                "RENDER_GIT_BRANCH": "staging",
            },
            clear=False,
        ):
            client = TestClient(app)
            res = client.get("/build-info")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["service"], "alloy-dispatcher")
        self.assertEqual(body["git_commit"], "4582348c3d8f697a25f0176ae77919f01427f760")
        self.assertEqual(body["git_branch"], "staging")

    def test_build_info_fails_closed_without_commit(self):
        from fastapi.testclient import TestClient
        from app.server import app

        with patch.dict(os.environ, {"RENDER_GIT_COMMIT": "", "RENDER_GIT_BRANCH": ""}, clear=False):
            client = TestClient(app)
            res = client.get("/build-info")
        self.assertEqual(res.status_code, 503)
        detail = res.json()["detail"]
        self.assertEqual(detail["error"], "revision_identity_unavailable")
        self.assertIsNone(detail["git_commit"])

    def test_build_info_rejects_untrustworthy_commit(self):
        from fastapi.testclient import TestClient
        from app.server import app

        with patch.dict("os.environ", {"RENDER_GIT_COMMIT": "not-a-sha", "RENDER_GIT_BRANCH": "staging"}, clear=False):
            client = TestClient(app)
            res = client.get("/build-info")
        self.assertEqual(res.status_code, 503)


if __name__ == "__main__":
    unittest.main()
