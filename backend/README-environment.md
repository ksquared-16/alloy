# Backend environment

The virtual environment is **not** in Git. `backend/.venv/` was tracked — 2,719 files,
plus 1,185 `__pycache__` artifacts — which meant every clone carried one machine's
interpreter paths and every checkout could silently disagree with the declared
dependencies. `.gitignore` already listed `.venv/`; the files predated the rule, and
Git ignores only paths it is not already tracking.

## Canonical definition

| File | Role |
|---|---|
| `requirements.txt` | the dependency contract — the only source of truth |
| `.python-version` | interpreter pin (3.10.5, taken from the removed `pyvenv.cfg`) |

## Create the environment

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

`.venv/` and `__pycache__/` are ignored. Do not commit either; `test-tracked-artifact-guard`
fails the build if they reappear.
