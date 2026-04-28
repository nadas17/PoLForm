"""
Załącznik nr 1 — Koordinat Çıkarma Script'i (tek seferlik build).

Doldurulmuş PDF'lerden (filled1.pdf=NEW, filled.pdf=OLD) `pdfplumber` ile
karakter koordinatlarını okur, `zal1_seed_values.json`'da tanımlı değerleri
PDF'te string olarak bulur, her alan için bbox/cell_bboxes hesaplar ve
`forms/zal1_new/field_map.json` + `forms/zal1_old/field_map.json` üretir.

Çalıştırma:
    python scripts/extract_zal1_coords.py
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).parent.parent.resolve()
SEED_PATH = ROOT / "scripts" / "zal1_seed_values.json"

# (slug, filled_pdf_for_coords, blank_pdf_template, sections_to_include)
TARGETS = [
    (
        "zal1_new",
        ROOT / "zalacznik-nr-1-Didem Kangel - filled1.pdf",
        ROOT / "zalacznik-nr-1-new.pdf.pdf",
        ["page1", "page2", "page3_common", "page3_new_only"],
    ),
    (
        "zal1_old",
        ROOT / "zalacznik-nr-1-filled.pdf",
        ROOT / "zalacznik-nr-1-old.pdf.pdf",
        ["page1", "page2", "page3_common", "page3_old_only"],
    ),
]


# ───────────────────────── Yardımcılar ─────────────────────────

# pdfplumber.chars normal karakteri tek tek verir; ardışık karakterleri
# satır ve x sırasına göre bir araya getirip absolut x,y aralığı çıkarırız.
def _chars_by_page(pdf_path: Path):
    """Her sayfa için karakterleri y (top), x (x0) sırasına göre döndürür."""
    pages = {}
    with pdfplumber.open(str(pdf_path)) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            chars = sorted(
                page.chars,
                key=lambda c: (round(c["top"], 1), c["x0"]),
            )
            pages[idx] = {
                "chars": chars,
                "width": page.width,
                "height": page.height,
            }
    return pages


def _norm(s: str) -> str:
    """Whitespace ve görsel olarak farklı ama mantıken aynı karakterleri normalleştir."""
    return s.replace(" ", "").replace(" ", "").replace("\n", "").upper()


def _find_value_chars(chars, value: str):
    """
    Verilen `value`'yu (whitespace insensitive) karakter listesinde sıralı bul.
    Aynı satırda ardışık değilse, en yakın eşleştirmeyi döndürür.
    Returns: list of char dicts that match value's letters in order, or None.
    """
    target = _norm(value)
    if not target:
        return None

    # Karakterleri sıralı tara, satır bazlı yakın grup ara.
    # Strateji: her potansiyel başlangıç noktası için ardışık karakter zinciri kur.
    n = len(chars)
    target_len = len(target)

    best = None
    best_score = float("inf")

    for start in range(n - target_len + 1):
        if _norm(chars[start]["text"]) != target[0]:
            continue
        # Bu konumdan target_len karakter uzunluğunda eşleşme dene
        matched = []
        ti = 0
        max_window = target_len * 4  # tolerans: bazı boş karakterler atlanabilir
        for j in range(start, min(start + max_window, n)):
            if ti >= target_len:
                break
            ch = chars[j]
            if _norm(ch["text"]) == target[ti]:
                matched.append(ch)
                ti += 1
        if ti == target_len:
            # Eşleşme tam — kalitesini ölç (karakterler yakın mı?)
            xs = [c["x0"] for c in matched]
            ys = [c["top"] for c in matched]
            x_span = max(xs) - min(xs)
            y_span = max(ys) - min(ys)
            score = x_span + y_span * 5  # y'yi daha çok cezalandır (tek satır olmalı)
            if score < best_score:
                best_score = score
                best = matched
    return best


def _bbox_of(chars):
    """Bir karakter listesinin sıkı kapsayıcı bbox'unu döndürür: [x0, top, x1, bottom]."""
    if not chars:
        return None
    x0 = min(c["x0"] for c in chars)
    x1 = max(c["x1"] for c in chars)
    top = min(c["top"] for c in chars)
    bot = max(c["bottom"] for c in chars)
    return [x0, top, x1, bot]


def _cell_bboxes_from_chars(chars):
    """
    char_boxes alanlar için kutu (cell) bbox listesi.
    Form üzerindeki gerçek kutu, karakter glyph'inden geniştir — bu yüzden
    cell genişliğini ardışık karakter merkezleri arasındaki ortalama mesafeden
    hesaplarız. Yükseklik için ortalama karakter yüksekliği * 1.4 kullanılır.

    Y-konum düzeltmesi: pdf_engine.py'nin font_size cap'i (10pt) orijinal
    karakter boyundan (~11pt) küçük olduğundan ve drawString baseline kullandığı
    için karakter görsel olarak aşağı kayıyor. Bunu telafi etmek için cell
    merkezini ortalama karakter yüksekliğinin %25'i kadar YUKARI kaydırıyoruz.
    """
    if not chars:
        return []

    avg_h = sum(c["height"] for c in chars) / len(chars)

    # Cap'i aşağı dengeleyici dikey ofset (PDF y artar = aşağı, dolayısıyla - = yukarı).
    # Deneme-yanılma sabiti — test PDF ile elde edildi.
    Y_LIFT = avg_h * 0.62

    centers_x = [(c["x0"] + c["x1"]) / 2 for c in chars]
    centers_y = [(c["top"] + c["bottom"]) / 2 - Y_LIFT for c in chars]

    # Kutu genişliği: ardışık karakter merkez-merkez mesafesinin ortalaması.
    # Tek karakter varsa veya tek satırda ardışık ölçü yoksa karakter
    # genişliğine göre fallback yap.
    if len(centers_x) >= 2:
        diffs = []
        for i in range(len(centers_x) - 1):
            d = centers_x[i + 1] - centers_x[i]
            if d > 0.5:
                diffs.append(d)
        if diffs:
            cell_w = sum(diffs) / len(diffs)
        else:
            cell_w = (chars[0]["x1"] - chars[0]["x0"]) * 1.6
    else:
        cell_w = (chars[0]["x1"] - chars[0]["x0"]) * 1.6

    # Kutu yüksekliği: karakter yüksekliğinin 1.4 katı (form kutuları daha geniştir,
    # ama 1.5 fazla şişiriyordu — fs cap'iyle uyum için 1.4)
    cell_h = avg_h * 1.4

    cells = []
    for cx, cy in zip(centers_x, centers_y):
        cells.append([
            cx - cell_w / 2,
            cy - cell_h / 2,
            cx + cell_w / 2,
            cy + cell_h / 2,
        ])
    return cells


# ───────────────────────── Ana çıkarma ─────────────────────────

def extract_field_map(filled_pdf: Path, sections: list[str], seed: dict, blank_pdf: Path) -> dict:
    """
    Doldurulmuş PDF'ten koordinatları çıkar; field_map.json sözlüğü üret.
    Sayfa boyutları boş PDF (template) ile uyumlu olmalı.
    """
    if not filled_pdf.exists():
        raise FileNotFoundError(f"Doldurulmuş PDF bulunamadı: {filled_pdf}")

    pages = _chars_by_page(filled_pdf)

    # template PDF'ten gerçek meta'yı al
    with pdfplumber.open(str(blank_pdf)) as pdf:
        page1 = pdf.pages[0]
        pdf_w = float(page1.width)
        pdf_h = float(page1.height)
        total_pages = len(pdf.pages)

    form_fields = []
    not_found = []

    section_to_page = {
        "page1": 1,
        "page2": 2,
        "page3_common": 3,
        "page3_new_only": 3,
        "page3_old_only": 3,
    }

    for section in sections:
        if section not in seed:
            continue
        page_num = section_to_page.get(section, 1)
        page_chars = pages[page_num]["chars"]

        for field_id, fdef in seed[section].items():
            if field_id.startswith("_"):
                continue

            value = fdef["value"]
            ftype = fdef["type"]
            num_cells = fdef.get("num_cells")
            label = fdef.get("label", field_id)

            matched = _find_value_chars(page_chars, value)
            if matched is None:
                not_found.append((section, field_id, value))
                continue

            # "text" → "table_cell" (pdf_engine.py serbest metin için bu tipi kullanır)
            engine_ftype = "table_cell" if ftype == "text" else ftype

            field = {
                "field_id": field_id,
                "label": label,
                "page": page_num,
                "field_type": engine_ftype,
            }

            if ftype in ("char_boxes", "date_boxes"):
                cells = _cell_bboxes_from_chars(matched)
                # bbox: cell_bboxes'ın dış sınırı (kapsayıcı)
                bbox = [
                    min(c[0] for c in cells),
                    min(c[1] for c in cells),
                    max(c[2] for c in cells),
                    max(c[3] for c in cells),
                ]
                field["bbox"] = [round(v, 2) for v in bbox]
                field["num_cells"] = num_cells or len(cells)
                field["cell_bboxes"] = [[round(v, 2) for v in c] for c in cells]
            else:
                # text alanları (table_cell) — glyph bbox'unu YUKARI kaydır + dolgu ekle.
                # pdf_engine.py'nin -fs*0.35 baseline ofseti karakteri kutu içinde
                # alta düşürüyor; bunu telafi etmek için bbox'u 0.40*avg_h yukarı çek.
                bbox = _bbox_of(matched)
                avg_h = sum(c["height"] for c in matched) / len(matched)
                lift = avg_h * 0.62
                bbox[1] -= avg_h * 0.25 + lift
                bbox[3] += avg_h * 0.25 - lift
                field["bbox"] = [round(v, 2) for v in bbox]

            form_fields.append(field)

    # form_title — slug'a göre otomatik
    form_title = "Załącznik nr 1 — Wniosek o pobyt czasowy / praca"

    field_map = {
        "meta": {
            "form_title": form_title,
            "total_pages": total_pages,
            "pdf_width_pt": round(pdf_w, 2),
            "pdf_height_pt": round(pdf_h, 2),
            "coordinate_system": "PDF points, y=0 at TOP (pdfplumber style)",
            "version": "v1",
            "source_pdf": filled_pdf.name,
        },
        "form_fields": form_fields,
    }

    return field_map, not_found


def _post_process(slug, field_map, filled_pdf):
    """Slug'a özel manuel ayarlamalar — bbox genişletme, font_size override vb."""
    fields_by_id = {f["field_id"]: f for f in field_map["form_fields"]}

    # KRS alanı: tüm formlarda label içerdiği için font'u sabitle (büyük)
    if "krs" in fields_by_id:
        fields_by_id["krs"]["font_size"] = 9

    # NEW'e özel: position bbox'ını "112028"in x_max'ına kadar genişlet
    # (pre_process " (Kod zawodu: 112028)" ekleyecek, sığması için yer gerek)
    if slug == "zal1_new" and "position" in fields_by_id:
        try:
            with pdfplumber.open(str(filled_pdf)) as pdf:
                p3 = pdf.pages[2]
                chars_sorted = sorted(p3.chars, key=lambda c: (round(c["top"], 1), c["x0"]))
                # Satır-toleranslı eşleşme: _find_value_chars'ı kullan
                matched = _find_value_chars(chars_sorted, "112028")
                if matched:
                    x_max = max(c["x1"] for c in matched)
                    old_bbox = fields_by_id["position"]["bbox"]
                    new_bbox = [old_bbox[0], old_bbox[1], x_max + 2, old_bbox[3]]
                    fields_by_id["position"]["bbox"] = [round(v, 2) for v in new_bbox]
                    print(f"  position bbox genişletildi: x_max={x_max + 2:.2f}")
                else:
                    print("  UYARI: '112028' bulunamadı, position bbox değişmedi")
        except Exception as e:
            print(f"  UYARI: position bbox genişletilemedi: {e}")


def main():
    if not SEED_PATH.exists():
        print(f"HATA: seed dosyası yok: {SEED_PATH}")
        sys.exit(1)

    seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))

    for slug, filled_pdf, blank_pdf, sections in TARGETS:
        print(f"\n=== {slug} ===")
        print(f"  filled: {filled_pdf.name}")
        print(f"  blank:  {blank_pdf.name}")

        if not filled_pdf.exists():
            print(f"  ATLANIR: filled PDF yok ({filled_pdf})")
            continue
        if not blank_pdf.exists():
            print(f"  ATLANIR: blank PDF yok ({blank_pdf})")
            continue

        field_map, not_found = extract_field_map(filled_pdf, sections, seed, blank_pdf)

        # Slug'a özel post-process (bbox genişletme, font_size override)
        _post_process(slug, field_map, filled_pdf)

        out_dir = ROOT / "forms" / slug
        out_dir.mkdir(parents=True, exist_ok=True)

        # template.pdf'i kopyala (çift uzantıyı normalleştir)
        shutil.copy2(blank_pdf, out_dir / "template.pdf")

        # field_map.json yaz
        out_json = out_dir / "field_map.json"
        out_json.write_text(json.dumps(field_map, indent=2, ensure_ascii=False), encoding="utf-8")

        print(f"  -> {len(field_map['form_fields'])} alan yazıldı: {out_json.relative_to(ROOT)}")
        if not_found:
            print(f"  UYARI: bulunamayan {len(not_found)} alan:")
            for sec, fid, val in not_found:
                print(f"    [{sec}] {fid} = {val!r}")

    print("\n[OK] Tamamlandı.")


if __name__ == "__main__":
    main()
