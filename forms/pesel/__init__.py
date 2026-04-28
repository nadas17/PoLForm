"""PESEL basvuru formu registration."""
import json
from pathlib import Path

from forms.registry import FormConfig, register

_DIR = Path(__file__).parent


def _load():
    from forms.pesel.ai_prompt import SYSTEM_PROMPT

    with open(_DIR / "field_map.json", encoding="utf-8") as f:
        field_map = json.load(f)

    ui_schema = {}
    ui_schema_path = _DIR / "ui_schema.json"
    if ui_schema_path.exists():
        with open(ui_schema_path, encoding="utf-8") as f:
            ui_schema = json.load(f)

    register(FormConfig(
        slug="pesel",
        title="PESEL Numarasi Basvuru Formu",
        description="Wniosek o nadanie numeru PESEL",
        template_pdf=_DIR / "template.pdf",
        field_map=field_map,
        system_prompt=SYSTEM_PROMPT,
        icon="Hash",
        flatten_annotations=False,
        ui_schema=ui_schema,
        name_fields={"surname": "s2_surname", "name": "s2_first_name"},
    ))


_load()
