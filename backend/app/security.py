from __future__ import annotations

from app.settings import Settings


def security_headers(settings: Settings | None) -> dict[str, str]:
    # SIP WSS URL is user-entered in the browser, so allow ws/wss broadly.
    connect_src = "'self' ws: wss:"
    csp = (
        "default-src 'self'; "
        f"connect-src {connect_src}; "
        "media-src 'self' blob:; "
        "img-src 'self'; "
        "script-src 'self'; "
        "style-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    return {
        "Content-Security-Policy": csp,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
    }
