"""Vercel Python entrypoint.

Vercel's Python builder will use an ASGI app if the module exposes a top-level
`app` variable. We already define `app` in `backend/server.py` so simply import
and re-export it here.
"""

from server import app  # re-export the FastAPI app for Vercel's ASGI handler
