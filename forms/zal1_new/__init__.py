"""Załącznik nr 1 (NEW versiyon, druku 1014.5361.0.1) form registration."""
import json
from pathlib import Path

from forms.registry import FormConfig, register

_DIR = Path(__file__).parent

# NEW versiyonda kod_zawodu sabit (UI'da gizli) — Polonya meslek kodu
KOD_ZAWODU_DEFAULT = "112028"  # Członek zarządu


def pre_process(user_data: dict) -> dict:
    """
    Backend'in çizim öncesi yaptığı veri dönüştürmesi:
    - krs: rakam → "Krajowy Rejestr Sądowy (KRS) - Nr KRS: <rakam>"
    - position: "X" → "X (Kod zawodu: 112028)"  (kod_zawodu kullanıcıya gösterilmiyor)
    """
    result = dict(user_data)

    krs_raw = (result.get("krs") or "").strip()
    if krs_raw and not krs_raw.startswith("Krajowy"):
        result["krs"] = f"Krajowy Rejestr Sądowy (KRS) - Nr KRS: {krs_raw}"

    pos_raw = (result.get("position") or "").strip()
    if pos_raw and "Kod zawodu" not in pos_raw:
        kod = (result.pop("kod_zawodu", None) or KOD_ZAWODU_DEFAULT).strip()
        result["position"] = f"{pos_raw} (Kod zawodu: {kod})"

    return result


def _load():
    from forms.zal1_new.ai_prompt import SYSTEM_PROMPT

    with open(_DIR / "field_map.json", encoding="utf-8") as f:
        field_map = json.load(f)

    ui_schema = {}
    ui_schema_path = _DIR / "ui_schema.json"
    if ui_schema_path.exists():
        with open(ui_schema_path, encoding="utf-8") as f:
            ui_schema = json.load(f)

    register(FormConfig(
        slug="zal1_new",
        title="Załącznik nr 1 (yeni versiyon)",
        description="Wniosek o pobyt czasowy/praca — Załącznik dot. zatrudnienia (druku 1014.5361)",
        template_pdf=_DIR / "template.pdf",
        field_map=field_map,
        system_prompt=SYSTEM_PROMPT,
        icon="Briefcase",
        flatten_annotations=False,
        pre_process=pre_process,
        ui_schema=ui_schema,
        name_fields={"surname": "city", "name": "krs"},
    ))


_load()
