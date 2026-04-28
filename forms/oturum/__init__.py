"""Oturum karti (pobyt czasowy) form registration."""
import json
from pathlib import Path

from forms.registry import FormConfig, register

_DIR = Path(__file__).parent


def pre_process(user_data: dict) -> dict:
    """Oturum-specific: p3a/p5b period+basis alan birlestirme."""
    merged = dict(user_data)
    for prefix, rows in [("p3a", 6), ("p5b", 4)]:
        for i in range(1, rows + 1):
            pk = f"{prefix}_r{i}_period"
            bk = f"{prefix}_r{i}_basis"
            period = merged.pop(pk, "").strip()
            basis = merged.pop(bk, "").strip()
            combined = f"{period}  {basis}" if period and basis else (period or basis)
            if combined:
                merged[f"{prefix}_r{i}"] = combined
    return merged


def _load():
    from forms.oturum.ai_prompt import SYSTEM_PROMPT

    with open(_DIR / "field_map.json", encoding="utf-8") as f:
        field_map = json.load(f)

    ui_schema = {}
    ui_schema_path = _DIR / "ui_schema.json"
    if ui_schema_path.exists():
        with open(ui_schema_path, encoding="utf-8") as f:
            ui_schema = json.load(f)

    register(FormConfig(
        slug="oturum",
        title="Oturum Karti Basvuru Formu",
        description="Wniosek o udzielenie zezwolenia na pobyt czasowy",
        template_pdf=_DIR / "template.pdf",
        field_map=field_map,
        system_prompt=SYSTEM_PROMPT,
        icon="FileText",
        flatten_annotations=True,
        pre_process=pre_process,
        ui_schema=ui_schema,
        name_fields={"surname": "field_01_surname", "name": "field_04_name_r1"},
        synonyms_path=str(_DIR / "field_synonyms.json"),
    ))


_load()
