"""Form registry — slug -> FormConfig mapping."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional


@dataclass
class FormConfig:
    slug: str
    title: str
    description: str
    template_pdf: Path
    field_map: dict
    system_prompt: str
    icon: str
    flatten_annotations: bool = True
    pre_process: Optional[Callable] = None
    ui_schema: dict = field(default_factory=dict)
    name_fields: Optional[dict] = None
    synonyms_path: Optional[str] = None


FORMS: dict[str, FormConfig] = {}


def register(config: FormConfig):
    """Register a form configuration."""
    FORMS[config.slug] = config


def get_form(slug: str) -> Optional[FormConfig]:
    """Get form config by slug, or None."""
    return FORMS.get(slug)


def list_forms() -> list[dict]:
    """Return list of form summaries for frontend."""
    return [
        {
            "slug": fc.slug,
            "title": fc.title,
            "description": fc.description,
            "icon": fc.icon,
            "total_pages": fc.field_map.get("meta", {}).get("total_pages", 0),
            "total_fields": len(fc.field_map.get("form_fields", [])),
        }
        for fc in FORMS.values()
    ]


def load_all():
    """Import all form modules to trigger registration."""
    import forms.oturum  # noqa: F401
    import forms.pesel   # noqa: F401
    # Diğer modüller — field_map eksikse veya yüklenemiyorsa atla
    for mod in (
        "forms.zap3",
        "forms.zaw_fa",
        "forms.konto_org",
        "forms.zal1_new",
        "forms.zal1_old",
    ):
        try:
            __import__(mod)
        except Exception:
            pass
