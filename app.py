"""
Unified Flask backend — modüler form sistemi.

Tüm form'ları forms.registry üzerinden yükler ve slug-based generic
endpoint'ler sunar:

  GET  /api/forms                    — Tüm formların listesi
  GET  /api/forms/<slug>/ui-schema   — Frontend UI tanımı
  GET  /api/forms/<slug>/field-map   — PDF overlay için bbox haritası
  GET  /api/forms/<slug>/template-pdf — Boş PDF şablonu
  POST /api/forms/<slug>/generate-pdf — Doldurulmuş PDF üret
  POST /api/forms/<slug>/parse-document — Belge yükle, AI ile çıkar

Eski uyumluluk: /api/oturum/* ve /api/pesel/* yolları da korunur.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# form_toolkit/core modüllerini reuse edebilmek için sys.path'e ekle
ROOT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(ROOT_DIR / "form_toolkit"))

from flask import Flask  # noqa: E402

# .env dosyasını root dizinden ve form_toolkit/'ten yükle (varsa)
try:
    from dotenv import load_dotenv  # noqa: E402
    load_dotenv(ROOT_DIR / ".env")
    load_dotenv(ROOT_DIR / "form_toolkit" / ".env")
except ImportError:
    pass

from forms.registry import load_all  # noqa: E402
from api_routes import bp  # noqa: E402


def create_app() -> Flask:
    # Tüm form modüllerini yükle (kayıt ol)
    load_all()

    app = Flask(
        __name__,
        static_folder=str(ROOT_DIR / "form_toolkit" / "static"),
        static_url_path="/",
    )

    # API anahtarlarını config'e koy (env'den)
    app.config["LLAMAPARSE_API_KEY"] = os.environ.get("LLAMAPARSE_API_KEY", "")
    # MiniMax (Global) — alan eşleştirme
    app.config["MINIMAX_API_KEY"] = os.environ.get("MINIMAX_API_KEY", "")
    app.config["MINIMAX_GROUP_ID"] = os.environ.get("MINIMAX_GROUP_ID", "")
    app.config["MINIMAX_MODEL"] = os.environ.get("MINIMAX_MODEL", "")

    app.register_blueprint(bp)

    # SPA fallback
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_react(path):
        static_index = os.path.join(app.static_folder, "index.html")
        if os.path.exists(static_index):
            return app.send_static_file("index.html")
        return (
            "<h2>Frontend build edilmedi.</h2>"
            "<p>Çalıştır: <code>cd form_toolkit/frontend && npm run build</code></p>",
            503,
        )

    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5002"))
    debug = os.environ.get("FLASK_ENV", "development") == "development"
    app = create_app()
    print(f"  Unified Form Backend calisiyor: http://localhost:{port}")
    print(f"  Kayitli formlar: {[c.slug for c in __import__('forms.registry', fromlist=['FORMS']).FORMS.values()]}")
    app.run(host="0.0.0.0", port=port, debug=debug)
