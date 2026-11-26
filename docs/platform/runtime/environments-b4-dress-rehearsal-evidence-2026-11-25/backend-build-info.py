# B4 rehearsal only: the candidate backend's GET /build-info handler (app.server.build_info), called directly with the
# RENDER_GIT_* values a Render deploy of the candidate carries. FastAPI's TestClient is not usable in this venv
# (its starlette requires the uninstalled httpx2 package: an environment limit), so the route function is called
# without HTTP; it raises HTTPException(503) where the route would answer 503.
# Run with backend/.venv/bin/python from <candidate>/backend.
import json, os, sys
sys.path.insert(0, os.getcwd())   # <candidate>/backend, so `app` is the candidate's
from fastapi import HTTPException
from app.server import build_info

try:
    print(json.dumps({"status": 200, "body": build_info()}))
except HTTPException as e:
    print(json.dumps({"status": e.status_code, "body": e.detail}))
    sys.exit(1)
