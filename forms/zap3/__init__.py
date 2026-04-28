"""ZAP-3 form registration."""
import json
from pathlib import Path
from forms.registry import FormConfig, register

_DIR = Path(__file__).parent

def _load():
    from forms.zap3.ai_prompt import SYSTEM_PROMPT
    with open(_DIR / "field_map.json", encoding="utf-8") as f:
        field_map = json.load(f)
    ui_schema = {}
    ui_schema_path = _DIR / "ui_schema.json"
    if ui_schema_path.exists():
        with open(ui_schema_path, encoding="utf-8") as f:
            ui_schema = json.load(f)
    register(FormConfig(
        slug="zap3",
        title="ZAP-3 Kisisel Bilgi Guncelleme",
        description="Zgłoszenie aktualizacyjne osoby fizycznej",
        template_pdf=_DIR / "template.pdf",
        field_map=field_map,
        system_prompt=SYSTEM_PROMPT,
        icon="MapPin",
        flatten_annotations=False,
        ui_schema=ui_schema,
        name_fields={"surname": "nazwisko", "name": "pierwsze_imie"},
    ))

_load()
