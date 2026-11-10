"""Offline proof of q2_hosted_verdict_cert.py against a fake HTTP layer (no network, no staging, no session).

The fake answers the two staff routes the way the deployed guards do (releaseVerdictGate: 409 MALWARE_UNSAFE /
MALWARE_SCAN_PENDING; restore through the same gate; 403 without documents.write), so the driver's verdicts are
checked in both directions: the expected answers pass, and every way a guard could be broken fails a named case.

    python3 certification/documents-v1/test_q2_hosted_verdict_cert.py -v   (from the repository root)
"""
import io, json, os, sys, tempfile, unittest, urllib.error, urllib.request
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import q2_hosted_verdict_cert as Q  # noqa: E402

RUN = "qar_00000000q2ok"


class _Resp:
    def __init__(self, status, body):
        self.status, self._b = status, json.dumps(body).encode()

    def read(self):
        return self._b

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def server(broken=None):
    """A stand-in of the two routes. `broken` names one guard to break."""
    state = {doc: ("archived" if name == "archived" else "quarantined") for name, doc in Q.DOCS.items()}
    unsafe = {Q.DOCS["infected"], Q.DOCS["suspicious"], Q.DOCS["archived"]}
    pending = {Q.DOCS["pending"]}
    writes = []

    def answer(req, timeout=None):
        url = req.full_url
        persona = "doc_reader" if "persona=doc_reader" in (req.headers.get("Cookie") or "") else "fixture_admin"
        doc = url.split("/api/admin/documents/")[1].split("/")[0]
        route = url.rsplit("/", 1)[1]
        if persona == "doc_reader" and broken != "no_write_check":
            raise urllib.error.HTTPError(url, 403, "f", {}, io.BytesIO(b'{"error":{"code":"INSUFFICIENT_ROLE"}}'))
        if doc in unsafe and broken != "unsafe":
            raise urllib.error.HTTPError(url, 409, "c", {}, io.BytesIO(b'{"error":{"code":"MALWARE_UNSAFE"}}'))
        if doc in pending and broken != "pending":
            raise urllib.error.HTTPError(url, 409, "c", {}, io.BytesIO(b'{"error":{"code":"MALWARE_SCAN_PENDING"}}'))
        if broken == "clean_refused" and doc == Q.DOCS["clean"]:
            raise urllib.error.HTTPError(url, 409, "c", {}, io.BytesIO(b'{"error":{"code":"MALWARE_UNSAFE"}}'))
        expected = "archived" if route == "restore" else "quarantined"
        if state[doc] != expected:
            raise urllib.error.HTTPError(url, 409, "c", {}, io.BytesIO(b'{"error":{"code":"NOT_QUARANTINED"}}'))
        state[doc] = "uploaded"
        writes.append((route, doc))
        return _Resp(200, {"ok": True, "status": "uploaded"})

    return answer, writes


def run_certify(broken=None):
    answer, writes = server(broken)
    out = []
    with tempfile.TemporaryDirectory() as d, \
            mock.patch.object(Q, "HERE", d), \
            mock.patch.object(Q, "cookie", lambda run, persona: f"persona={persona}"), \
            mock.patch.object(urllib.request, "urlopen", answer):
        summary = Q.certify(RUN, out=out.append)
        with open(os.path.join(d, f"q2_hosted_verdict_cert_results.{RUN}.json")) as f:
            receipt = json.load(f)
    failed = [r["case"] for r in receipt["results"] if not r["pass"]]
    return summary, failed, writes


class Q2Driver(unittest.TestCase):
    def test_the_deployed_guards_pass_every_case(self):
        summary, failed, writes = run_certify()
        self.assertEqual(failed, [])
        self.assertEqual((summary["passed"], summary["total"]), (7, 7))
        self.assertEqual(writes, [("screening", Q.DOCS["clean"])])  # only the clean control was ever released

    def test_an_unsafe_release_that_succeeds_fails_its_case(self):
        _, failed, _ = run_certify("unsafe")
        self.assertIn("release refused: infected version", failed)
        self.assertIn("release refused: suspicious version", failed)
        self.assertIn("restore refused: archived document with an unsafe version", failed)

    def test_a_pending_release_that_succeeds_fails_its_case(self):
        _, failed, _ = run_certify("pending")
        self.assertEqual(failed, ["release refused: awaiting a verdict"])

    def test_a_missing_write_check_fails_the_negative_control(self):
        _, failed, _ = run_certify("no_write_check")
        self.assertTrue(any(c.startswith("doc_reader cannot") for c in failed), failed)

    def test_a_guard_that_refuses_clean_content_fails_the_control(self):
        _, failed, _ = run_certify("clean_refused")
        self.assertEqual(failed, ["release allowed: clean version (control)"])


if __name__ == "__main__":
    unittest.main()
