"""Documents Q2 — hosted proof of the malware-verdict release and restore guards (authz_q1 run, QA Shared).

Needs the registered TEST-ONLY fixture qa_documents_q2_verdict_fixture_ensure (certification/fixtures/
qa-documents-q2-verdict-ensure.sql) applied for THIS run, after qa_authz_subject_fixture_ensure. Plan:
certification/documents-v1/finish/Q2-VERDICT-FIXTURE-PLAN.md.

    python3 q2_hosted_verdict_cert.py <qa_run_id> certify

Every request is real HTTP from the persona's own run-scoped session, read from
  <authRoot>/qa-runs/<qa_run_id>/<persona>/storage-state.json
written by environment.qa_run_open. Never prints a cookie, a signed URL or document content: statuses and codes only.
Each refusal is sent twice; the second answer must equal the first, which shows the refused call changed nothing.
Writes q2_hosted_verdict_cert_results.<run>.json. Exit 0 only when every case passes.
"""
import json, os, sys, time, urllib.error, urllib.request

BASE = os.environ.get("Q2_BASE_URL", "https://staging.workwithalloy.com")
AUTH = os.path.expanduser("~/.local/state/alloy-dev/gateway/auth/qa-runs")
HERE = os.path.dirname(os.path.abspath(__file__))

DOCS = {
    "infected": "ae000000-0000-4000-8000-000000000001",
    "suspicious": "ae000000-0000-4000-8000-000000000002",
    "pending": "ae000000-0000-4000-8000-000000000003",
    "archived": "ae000000-0000-4000-8000-000000000004",
    "clean": "ae000000-0000-4000-8000-000000000005",
}
RELEASE_REASON = "QA Q2 hosted proof: verdict guard"
RESTORE_REASON = "QA Q2 hosted proof: restore guard"

_cookies = {}


def cookie(run, persona):
    if persona not in _cookies:
        with open(os.path.join(AUTH, run, persona, "storage-state.json")) as f:
            st = json.load(f)
        _cookies[persona] = "; ".join(f"{c['name']}={c['value']}" for c in st["cookies"] if "workwithalloy" in c.get("domain", ""))
    return _cookies[persona]


def call(run, path, persona, method="POST", body=None):
    h = {"accept": "application/json", "cookie": cookie(run, persona), "origin": BASE, "referer": BASE + "/admin"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h["content-type"] = "application/json"
    req = urllib.request.Request(BASE + path, method=method, headers=h, data=data)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw, status = r.read(), r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read(), e.code
    try:
        b = json.loads(raw or b"null")
    except ValueError:
        b = None
    return status, b


def code_of(b):
    if not isinstance(b, dict):
        return None
    e = b.get("error")
    return (e.get("code") if isinstance(e, dict) else None) or b.get("code")


def release(run, doc, persona="fixture_admin"):
    return call(run, f"/api/admin/documents/{doc}/screening", persona, body={"action": "release", "reason": RELEASE_REASON})


def restore(run, doc, persona="fixture_admin"):
    return call(run, f"/api/admin/documents/{doc}/restore", persona, body={"reason": RESTORE_REASON})


def certify(run, out=print):
    results = []

    def check(case, persona, ok, status, code, **extra):
        results.append({"case": case, "persona": persona, "pass": bool(ok), "status": status, "code": code, **extra})
        out(("PASS " if ok else "FAIL ") + f"[{persona}] {case} :: status={status} code={code}")

    # Negative control first: an actor without documents.write is refused before any verdict is read.
    for name in ("infected", "archived"):
        fn = restore if name == "archived" else release
        s, b = fn(run, DOCS[name], "doc_reader")
        check(f"doc_reader cannot {'restore' if name == 'archived' else 'release'} ({name})", "doc_reader", s in (403, 404), s, code_of(b))
    # Q2-1: unsafe current version → 409 MALWARE_UNSAFE, twice (state unchanged).
    for name in ("infected", "suspicious"):
        first = release(run, DOCS[name])
        second = release(run, DOCS[name])
        check(f"release refused: {name} version", "fixture_admin",
              first[0] == 409 and code_of(first[1]) == "MALWARE_UNSAFE" and second[0] == 409 and code_of(second[1]) == "MALWARE_UNSAFE",
              first[0], code_of(first[1]), second_status=second[0])
    # Q2-2: held awaiting a verdict → 409 MALWARE_SCAN_PENDING, twice.
    first = release(run, DOCS["pending"])
    second = release(run, DOCS["pending"])
    check("release refused: awaiting a verdict", "fixture_admin",
          first[0] == 409 and code_of(first[1]) == "MALWARE_SCAN_PENDING" and second[0] == 409 and code_of(second[1]) == "MALWARE_SCAN_PENDING",
          first[0], code_of(first[1]), second_status=second[0])
    # Q2-3: archived with an unsafe version → restore refused 409 MALWARE_UNSAFE, twice.
    first = restore(run, DOCS["archived"])
    second = restore(run, DOCS["archived"])
    check("restore refused: archived document with an unsafe version", "fixture_admin",
          first[0] == 409 and code_of(first[1]) == "MALWARE_UNSAFE" and second[0] == 409 and code_of(second[1]) == "MALWARE_UNSAFE",
          first[0], code_of(first[1]), second_status=second[0])
    # Q2-4: control — a clean current version releases (200), and a second release is no longer a quarantine release.
    first = release(run, DOCS["clean"])
    second = release(run, DOCS["clean"])
    check("release allowed: clean version (control)", "fixture_admin", first[0] == 200 and second[0] != 200, first[0], code_of(first[1]),
          second_status=second[0], second_code=code_of(second[1]))

    summary = {"passed": sum(r["pass"] for r in results), "total": len(results), "qa_run_id": run,
               "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    out("\nSUMMARY " + json.dumps(summary))
    with open(os.path.join(HERE, f"q2_hosted_verdict_cert_results.{run}.json"), "w") as f:
        json.dump({"summary": summary, "results": results}, f, indent=2)
    return summary


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[2] != "certify" or not sys.argv[1].startswith("qar_"):
        sys.exit(__doc__)
    s = certify(sys.argv[1])
    sys.exit(0 if s["passed"] == s["total"] else 1)
