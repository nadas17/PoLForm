<div align="center">

# PoLForm

### Polish Form Filling Tool

**AI-powered, multi-form, zero-data-entry automated PDF filling platform**

</div>

> Built for Turkish citizens living in or migrating to Poland. Upload your passport, ID, or registration document — the system extracts the fields, translates them from Turkish to Polish, and writes them onto the official PDF.

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff)](https://vitejs.dev/)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](#license)

---

## ✨ Why this tool?

| The Old Way | This Tool |
|---|---|
| 30–60 minutes of manual data entry per form | **Upload a document → auto-filled in 10 seconds** |
| Translate Turkish → Polish by hand | Month names, country names, marital status, voivodeships **translated automatically** |
| Multiple applications → multiple forms refilled from scratch | **Export to 7 official forms** from a single dataset |
| Form rejected when you write in the wrong box | **Pixel-perfect PDF render** — every character lands in the right cell |
| Form changed, software outdated | **Modular design** — a new form is added in 30 minutes |

---

## 🎯 Supported Forms

7 official Polish forms, all from a single panel:

| Form | Slug | Pages | Fields | Description |
|---|---|:-:|:-:|---|
| **Karta Pobytu** | `oturum` | 13 | 150 | Temporary residence permit application — *Wniosek o pobyt czasowy* |
| **PESEL Number** | `pesel` | 4 | 70 | Polish personal identification number — *Wniosek o nadanie numeru PESEL* |
| **ZAP-3** | `zap3` | 2 | 51 | Personal data update — *Zgłoszenie aktualizacyjne* |
| **ZAW-FA** | `zaw_fa` | 2 | 36 | KSeF e-invoicing authorization — *Zawiadomienie KSeF* |
| **Konto Organizacji** | `konto_org` | 1 | 28 | e-Urząd organizational access request |
| **Załącznik nr 1** *(new)* | `zal1_new` | 6 | 17 | Employment relationship annex — new form version (druku 1014.5361) |
| **Załącznik nr 1** *(old)* | `zal1_old` | 6 | 18 | Employment relationship annex — old form version (druku 1014.1612) |

---

## 🚀 Quick Start (5 minutes)

### 1) System requirements
- Python 3.10+
- Node.js 18+
- LlamaParse + MiniMax API keys (see below)

### 2) Get your API keys
- **LlamaParse** — [cloud.llamaindex.ai](https://cloud.llamaindex.ai/) (`llx-...`)
- **MiniMax Global** — [minimax.io](https://www.minimax.io/) (`MINIMAX_API_KEY` + `MINIMAX_GROUP_ID`)

### 3) Install dependencies
```bash
pip install -r form_toolkit/requirements.txt
npm --prefix form_toolkit/frontend install
```

### 4) Create the `.env` file
```bash
cp .env.example .env
# Open .env and paste in your API keys
```

### 5) Run
```bash
# Terminal 1 — Backend (port 5002)
python app.py

# Terminal 2 — Frontend (port 5173)
npm --prefix form_toolkit/frontend run dev
```

Open in your browser: **http://localhost:5173** → pick the form you need → use the "Import Document" tab to upload your passport → fields auto-fill → **Generate PDF**.

---

## 🏗️ Architecture

A modular, plug-in style design. Each form lives under `forms/<slug>/` as an independent module; backend and frontend serve them all dynamically.

```
                ┌────────────────────────────────────────┐
   Upload       │  Frontend (React + Vite, port 5173)    │
   document────►│  • Dynamic form generator              │
                │  • Live PDF preview (PDF.js)           │
                │  • TR → PL translation hints           │
                └─────────────────┬──────────────────────┘
                                  │ /api/forms/<slug>/...
                                  ▼
                ┌────────────────────────────────────────┐
                │  Unified Backend (Flask, port 5002)    │
                │  ┌──────────────────────────────────┐  │
   PDF/JPG ────►│  │ doc_parser ── LlamaParse         │  │
                │  │   (raw text extraction)          │  │
                │  └─────────────┬────────────────────┘  │
                │                ▼                       │
                │  ┌──────────────────────────────────┐  │
                │  │ minimax_extractor ── MiniMax     │  │
                │  │   (field matching + TR→PL)       │  │
                │  └─────────────┬────────────────────┘  │
                │                ▼                       │
                │  ┌──────────────────────────────────┐  │
                │  │ pdf_engine ── ReportLab + pypdf  │  │
                │  │   (PDF overlay + merge)          │  │
                │  └──────────────────────────────────┘  │
                └─────────────────┬──────────────────────┘
                                  ▼
                            Filled PDF
```

### Folder layout

```
.
├── app.py                      # Unified Flask backend (port 5002)
├── api_routes.py               # Generic /api/forms/<slug>/* routes
├── forms/                      # 🔌 Form modules (plug-in)
│   ├── registry.py             # FormConfig dataclass + load_all()
│   ├── oturum/                 # Karta Pobytu
│   │   ├── __init__.py         # register(FormConfig(...))
│   │   ├── template.pdf        # Blank template
│   │   ├── field_map.json      # Field coordinates (bbox)
│   │   ├── ai_prompt.py        # Form-specific AI instructions
│   │   └── ui_schema.json      # Frontend UI definition
│   ├── pesel/, zap3/, zaw_fa/, konto_org/
│   └── zal1_new/, zal1_old/
├── form_toolkit/
│   ├── core/                   # AI + PDF engines (shared)
│   │   ├── doc_parser.py       # LlamaParse client
│   │   ├── minimax_extractor.py # MiniMax client + system prompt
│   │   ├── pdf_engine.py       # ReportLab overlay + pypdf merge
│   │   ├── validator.py        # Data validation
│   │   └── field_matcher.py    # Fallback matcher when AI is unavailable
│   └── frontend/               # React + Vite UI
│       └── src/
│           ├── App.jsx                # Form picker screen
│           ├── DynamicFormApp.jsx     # Renders from ui_schema
│           ├── OturumFormApp.jsx      # Custom: 13-page form
│           ├── PeselFormApp.jsx       # Custom: PESEL form
│           ├── PdfPreview.jsx         # PDF.js + live overlay
│           ├── DocImport.jsx          # Document upload UI
│           ├── api.js                 # Backend client
│           └── components/Shared.jsx  # Modal, Toast, TabBar, …
├── scripts/                    # Build helpers
│   ├── extract_zal1_coords.py  # Generate field_map from a filled PDF
│   └── generate_zal1_mock_pdfs.py
└── .env                        # API keys (do not commit)
```

---

## 🧩 Adding a New Form

Thanks to the modular design, you can add a new form without writing any React code. Just drop 5 files under `forms/<slug>/`:

```
forms/new_form/
├── __init__.py        # FormConfig registration
├── template.pdf       # Blank PDF template
├── field_map.json     # Field coordinates
├── ai_prompt.py       # AI system prompt
└── ui_schema.json     # Frontend UI definition (tabs, groups, fields)
```

### Quick template

**`forms/new_form/__init__.py`**
```python
import json
from pathlib import Path
from forms.registry import FormConfig, register

_DIR = Path(__file__).parent

def _load():
    from forms.new_form.ai_prompt import SYSTEM_PROMPT
    with open(_DIR / "field_map.json", encoding="utf-8") as f:
        field_map = json.load(f)
    with open(_DIR / "ui_schema.json", encoding="utf-8") as f:
        ui_schema = json.load(f)

    register(FormConfig(
        slug="new_form",
        title="New Form Title",
        description="Description",
        template_pdf=_DIR / "template.pdf",
        field_map=field_map,
        system_prompt=SYSTEM_PROMPT,
        icon="FileText",
        ui_schema=ui_schema,
    ))

_load()
```

Add a `forms.new_form` import to `forms/registry.py` → `load_all()`. Restart the backend — the card shows up on the home page automatically.

📘 For a **detailed guide**, see the [`forms/registry.py`](forms/registry.py) dataclass definition and the `forms/zap3/` example.

### Auto-extracting coordinates from a filled PDF

If you already have a filled sample, you can extract the coordinates **automatically**:

```bash
# 1. Write a field-to-value map to scripts/<slug>_seed_values.json
# 2. Run the script — pdfplumber will produce bboxes from the filled PDF
python scripts/extract_zal1_coords.py
```

> This approach was used for the `zal1_new` and `zal1_old` forms — 16 fields were semi-automatically mapped in 5 minutes.

---

## 🌐 API Reference

The backend serves every form through a single slug-based interface. The frontend uses the same endpoint set for every slug.

### List forms
```http
GET /api/forms
```
**Response:**
```json
{
  "forms": [
    {"slug": "oturum", "title": "...", "description": "...", "icon": "FileText",
     "total_pages": 13, "total_fields": 150}
  ]
}
```

### Per-form endpoints
| Endpoint | Method | Description |
|---|:-:|---|
| `/api/forms/<slug>/ui-schema` | `GET` | Frontend UI definition (tabs/groups/fields) |
| `/api/forms/<slug>/field-map` | `GET` | Bbox map used for the PDF overlay |
| `/api/forms/<slug>/template-pdf` | `GET` | Blank template PDF (for previewing) |
| `/api/forms/<slug>/generate-pdf` | `POST` | Build the filled PDF and return it |
| `/api/forms/<slug>/parse-document` | `POST` | Upload a document → extract fields with AI |

### Example: generate a PDF
```bash
curl -X POST http://localhost:5002/api/forms/oturum/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"field_01_surname": "YILMAZ", "field_04_name_r1": "MEHMET", ...}' \
  -o filled.pdf
```

### Example: upload a document for AI extraction
```bash
curl -X POST http://localhost:5002/api/forms/oturum/parse-document \
  -F "document=@passport.pdf"
```
**Response:**
```json
{
  "raw_text": "...raw text from LlamaParse...",
  "mappings": [
    {"matched_field_id": "field_01_surname", "extracted_value": "YILMAZ",
     "confidence": 0.93, "field_label": "Surname", "value_fits": true}
  ],
  "missing_fields": [
    {"field_id": "field_19_phone", "label": "Phone", "reason": "No phone number in the document"}
  ]
}
```

> 🔄 **Backwards compatibility**: the legacy `/api/oturum/*` and `/api/pesel/*` routes are still supported.

---

## ⚙️ Configuration

All keys live in the `.env` file:

| Variable | Required? | Description |
|---|:-:|---|
| `LLAMAPARSE_API_KEY` | ✅ | `llx-...` — document → raw text |
| `MINIMAX_API_KEY` | ✅ | MiniMax Global key |
| `MINIMAX_GROUP_ID` | ⚠️ | Some endpoints require a group id |
| `MINIMAX_MODEL` | ❌ | Defaults to `MiniMax-Text-01` |
| `PORT` | ❌ | Defaults to `5002` (unified backend) |
| `FLASK_ENV` | ❌ | `development` or `production` |

> Without keys, the system falls back to `field_matcher` — a basic keyword matcher, not at AI quality.

---

## 💻 Development

### Start every server at once
Harness support via `.claude/launch.json`:
```bash
# Instead of starting servers one-by-one — one click from your IDE/CLI
```

### Tests
```bash
# Backend tests
pytest form_toolkit/tests/

# Frontend lint
npm --prefix form_toolkit/frontend run lint
```

### Coordinate generator for new forms
```bash
# pdfplumber is a dev dependency
pip install -r requirements-dev.txt

# Build field_map.json from a filled PDF + seed JSON
python scripts/extract_zal1_coords.py
```

### CLI form filling
```bash
# Form Toolkit (Karta Pobytu)
python form_toolkit/fill_form.py --ornek > sample.json
python form_toolkit/fill_form.py sample.json output.pdf
```

---

## 🗺️ Roadmap

- [x] **Phase 1** — Hardcoded backends for Karta Pobytu and PESEL
- [x] **Phase 2** — Modular form system (`forms/<slug>/`)
- [x] **Phase 3** — `DynamicFormApp` rendering from a UI schema
- [x] **Phase 4** — Unified backend with a slug-based API
- [x] **Phase 5** — ZAP-3, ZAW-FA, Konto Organizacji, Załącznik nr 1 (×2)
- [x] **Phase 6** — LlamaParse + MiniMax integration (migrated off Claude)
- [ ] **Phase 7** — Expanded form catalog (further API integrations)
- [ ] **Phase 8** — Multi-user support / session management
- [ ] **Phase 9** — Mobile app (React Native)

---

## 🤝 Contributing

1. To add a new form, follow the **Adding a New Form** section above.
2. Open a [GitHub Issue](#) for bug reports and feature requests.
3. Run `pytest` and `npm run lint` before sending a PR.

---

## ❓ FAQ

**Q: Are the AI calls paid?**
LlamaParse has a generous free tier (1000 pages/day). MiniMax Global is paid, but `MiniMax-Text-01` is cheap up to 1M tokens (~$0.20).

**Q: Does it work without keys?**
Yes — the UI and PDF generation work fully. Only the "Import Document" feature needs keys. When keys are missing, the legacy `field_matcher` keyword matcher kicks in (weak, but functional).

**Q: Does the output match the original PDF 100%?**
Not pixel-level — coordinates extracted with pdfplumber are accurate within ±2pt. For new forms this can be calibrated manually (see the Y-LIFT parameter in `scripts/extract_zal1_coords.py`).

**Q: Which documents can I upload?**
PDF, DOCX, JPG, PNG, WebP — up to 20 MB.

---

## 📄 License

[MIT](LICENSE) — use, distribute, and modify freely.

---

<sub>**Made with care for the Polish-Turkish migration community.** Settling in Poland has never depended on so little paperwork. 🇵🇱 ↔ 🇹🇷</sub>
