"""
Generic API blueprint — slug-based formlar için.

Yollar:
  GET  /api/forms                       — Form listesi
  GET  /api/forms/<slug>/ui-schema       — UI tanımı
  GET  /api/forms/<slug>/field-map        — PDF overlay haritası
  GET  /api/forms/<slug>/template-pdf      — Boş PDF
  POST /api/forms/<slug>/generate-pdf      — Doldurulmuş PDF
  POST /api/forms/<slug>/parse-document    — Belge → alan eşleştirme

Eski yollar (backward compat):
  /api/oturum/*  → /api/forms/oturum/*
  /api/pesel/*   → /api/forms/pesel/*
"""
from __future__ import annotations

import logging
import os
from io import BytesIO

from flask import Blueprint, current_app, jsonify, request, send_file

from forms.registry import FORMS, get_form, list_forms

# form_toolkit/core'dan import — sys.path zaten ayarlı
from core.pdf_engine import generate_pdf as _generate_pdf
from core.validator import validate
from core.doc_parser import parse_document
from core.minimax_extractor import extract_with_minimax, MinimaxError
from core.field_matcher import match_fields

logger = logging.getLogger(__name__)
bp = Blueprint("api", __name__, url_prefix="/api")

ALLOWED_DOC_EXTENSIONS = {".pdf", ".docx", ".doc", ".jpg", ".jpeg", ".png", ".webp"}
MAX_DOC_SIZE = 20 * 1024 * 1024  # 20 MB


# ────────────────────────── HELPER ──────────────────────────

def _form_or_404(slug: str):
    """Form'u getir veya 404 ile None döner."""
    fc = get_form(slug)
    if fc is None:
        return None, (jsonify({"error": f"Form bulunamadi: {slug}"}), 404)
    return fc, None


# ────────────────────────── LIST ──────────────────────────

@bp.get("/forms")
def list_forms_endpoint():
    """Tüm kayıtlı formları döndürür."""
    return jsonify({"forms": list_forms()})


# ────────────────────────── UI SCHEMA ──────────────────────────

@bp.get("/forms/<slug>/ui-schema")
def get_ui_schema(slug: str):
    fc, err = _form_or_404(slug)
    if err: return err
    return jsonify(fc.ui_schema or {})


# ────────────────────────── FIELD MAP ──────────────────────────

@bp.get("/forms/<slug>/field-map")
def get_field_map(slug: str):
    fc, err = _form_or_404(slug)
    if err: return err
    return jsonify(fc.field_map)


# ────────────────────────── TEMPLATE PDF ──────────────────────────

@bp.get("/forms/<slug>/template-pdf")
def get_template_pdf(slug: str):
    fc, err = _form_or_404(slug)
    if err: return err

    pdf_path = str(fc.template_pdf)
    if not os.path.isfile(pdf_path):
        logger.error("Sablon PDF bulunamadi: %s", pdf_path)
        return jsonify({"error": "Sablon PDF sunucuda bulunamadi"}), 404

    return send_file(
        pdf_path,
        mimetype="application/pdf",
        as_attachment=False,
        max_age=3600,
    )


# ────────────────────────── GENERATE PDF ──────────────────────────

@bp.post("/forms/<slug>/generate-pdf")
def generate_pdf_endpoint(slug: str):
    fc, err = _form_or_404(slug)
    if err: return err

    user_data = request.get_json(silent=True)
    if not user_data:
        return jsonify({"error": "JSON verisi bulunamadi"}), 400

    # Form-specific pre_process (örn. oturum için p3a/p5b birleştirme)
    if fc.pre_process:
        user_data = fc.pre_process(user_data)

    errors = validate(user_data, fc.field_map)
    if errors:
        return jsonify({"error": "Dogrulama hatasi", "fields": errors}), 400

    try:
        pdf_bytes = _generate_pdf(user_data, str(fc.template_pdf), fc.field_map)
    except Exception as exc:
        logger.error("PDF olusturma hatasi (%s): %s", slug, exc)
        return jsonify({"error": "PDF olusturulamadi. Sunucu loglarina bakin."}), 500

    return send_file(
        BytesIO(pdf_bytes),
        mimetype="application/pdf",
        download_name=f"{slug}_doldurulmus.pdf",
        as_attachment=True,
    )


# ────────────────────────── PARSE DOCUMENT ──────────────────────────

@bp.post("/forms/<slug>/parse-document")
def parse_document_endpoint(slug: str):
    fc, err = _form_or_404(slug)
    if err: return err

    if "document" not in request.files:
        return jsonify({"error": "Dosya bulunamadi. 'document' alaninda dosya gonderin."}), 400

    file = request.files["document"]
    if not file.filename:
        return jsonify({"error": "Dosya adi bos."}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_DOC_EXTENSIONS:
        return jsonify({
            "error": f"Desteklenmeyen format: {ext}. "
                     f"Desteklenen: {', '.join(sorted(ALLOWED_DOC_EXTENSIONS))}"
        }), 400

    file_bytes = file.read()
    if len(file_bytes) > MAX_DOC_SIZE:
        return jsonify({"error": "Dosya boyutu 20 MB'i asamaz."}), 400
    if len(file_bytes) == 0:
        return jsonify({"error": "Dosya bos."}), 400

    llama_api_key = current_app.config.get("LLAMAPARSE_API_KEY", "")
    if not llama_api_key:
        return jsonify({"error": "LLAMAPARSE_API_KEY yapilandirilmamis."}), 500

    try:
        parse_result = parse_document(file_bytes, file.filename, llama_api_key)
    except Exception as exc:
        logger.error("Belge ayristirma hatasi: %s", exc)
        return jsonify({"error": f"Belge ayristirilamadi: {str(exc)}"}), 500

    minimax_key = current_app.config.get("MINIMAX_API_KEY", "")
    minimax_group = current_app.config.get("MINIMAX_GROUP_ID", "")
    minimax_model = current_app.config.get("MINIMAX_MODEL", "")  # opsiyonel override
    missing_fields = []

    if minimax_key:
        try:
            kwargs = {}
            if minimax_group: kwargs["group_id"] = minimax_group
            if minimax_model: kwargs["model"] = minimax_model
            mappings, missing_fields = extract_with_minimax(
                parse_result["raw_text"], fc.field_map, minimax_key, **kwargs
            )
        except MinimaxError as exc:
            logger.error("MiniMax eslestirme hatasi: %s", exc)
            return jsonify({"error": f"MiniMax hatasi: {str(exc)}"}), 500
        except Exception as exc:
            logger.error("MiniMax beklenmeyen hata: %s", exc)
            return jsonify({"error": f"AI eslestirme hatasi: {str(exc)}"}), 500
    else:
        logger.warning("MINIMAX_API_KEY yok, eski field_matcher kullaniliyor")
        try:
            extracted_pairs = parse_result.get("extracted_pairs", [])
            mappings = match_fields(extracted_pairs, fc.field_map)
        except Exception as exc:
            logger.error("Alan eslestirme hatasi: %s", exc)
            return jsonify({"error": f"Alan eslestirme hatasi: {str(exc)}"}), 500

    return jsonify({
        "raw_text": parse_result["raw_text"],
        "extracted_pairs": [],
        "mappings": mappings,
        "missing_fields": missing_fields,
        "filename": parse_result["filename"],
    })


# ────────────────────────── BACKWARD COMPAT ──────────────────────────
# Eski URL'leri yeni rotalara yönlendirir.

@bp.get("/oturum/template-pdf")
def _legacy_oturum_template():
    return get_template_pdf("oturum")

@bp.get("/oturum/field-map")
def _legacy_oturum_fieldmap():
    return get_field_map("oturum")

@bp.post("/oturum/generate-pdf")
def _legacy_oturum_generate():
    return generate_pdf_endpoint("oturum")

@bp.post("/oturum/parse-document")
def _legacy_oturum_parse():
    return parse_document_endpoint("oturum")

@bp.get("/pesel/template-pdf")
def _legacy_pesel_template():
    return get_template_pdf("pesel")

@bp.get("/pesel/field-map")
def _legacy_pesel_fieldmap():
    return get_field_map("pesel")

@bp.post("/pesel/generate-pdf")
def _legacy_pesel_generate():
    return generate_pdf_endpoint("pesel")

@bp.post("/pesel/parse-document")
def _legacy_pesel_parse():
    return parse_document_endpoint("pesel")
