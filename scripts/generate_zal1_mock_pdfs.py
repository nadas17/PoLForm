"""
Hızlı test scripti — zal1_new ve zal1_old için Didem Kangel mock data ile
doldurulmuş PDF üret. Çıktı: mock_zal1_new_filled.pdf, mock_zal1_old_filled.pdf

Çalıştırma:
    python scripts/generate_zal1_mock_pdfs.py
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent.parent.resolve()
BACKEND = "http://localhost:5002"

MOCK_NEW = {
    "company_line1": "RUFFY", "company_line2": "SPZO.O.",
    "krs": "0001230547", "nip": "544326513",
    "street": "ul.TORUŃSKA", "house_no": "15/77", "postal_code": "80-747",
    "city": "GDAŃSK", "country": "POLSKA",
    "position": "Członek Zarządu", "place": "GDAŃSK", "basis": "UCHWAŁA",
    "working_time": "PEŁNY ETAT",
    "salary_amount": "2500 PLN / DWA TYSIĄCE PIĘĆSET",
    "duties": "ZARZĄDZANIE SPÓŁKĄ I REPREZENTOWANIE SPÓŁKI.",
    "start_date": "20260420", "end_date": "20290419",
    "kod_zawodu": "112028",
}

MOCK_OLD = {
    "company_line1": "RUFFY", "company_line2": "SPZO.O.",
    "krs": "0001230547", "nip": "544326513",
    "street": "ul.TORUŃSKA", "house_no": "15/77", "postal_code": "80-747",
    "city": "GDAŃSK", "country": "POLSKA",
    "position": "Członek Zarządu", "place": "GDAŃSK", "basis": "UCHWAŁA",
    "working_time": "PEŁNY ETAT",
    "salary_amount": "2500 PLN",
    "salary_words": "DWA TYSIĄCE PIĘĆSET",
    "duties": "ZARZĄDZANIE SPÓŁKĄ I REPREZENTOWANIE SPÓŁKI.",
    "start_date": "20260420", "end_date": "20290419",
}


def generate(slug, data):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{BACKEND}/api/forms/{slug}/generate-pdf",
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            pdf_bytes = resp.read()
        out = ROOT / f"mock_{slug}_filled.pdf"
        out.write_bytes(pdf_bytes)
        print(f"  -> {out.name} ({len(pdf_bytes):,} bayt)")
    except urllib.error.HTTPError as e:
        print(f"  HATA {slug}: {e.code} {e.read().decode('utf-8')}")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    generate("zal1_new", MOCK_NEW)
    generate("zal1_old", MOCK_OLD)


if __name__ == "__main__":
    main()
