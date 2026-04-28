import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import PdfPreview from "./PdfPreview.jsx";
import DocImport from "./DocImport.jsx";
import { generatePdf } from "./api.js";
import {
  ConfirmDialog, Toast, MissingFieldsPanel, SectionHeading, TabBar, ProgressIndicator, SplitPane,
} from "./components/Shared.jsx";

/* ─────────────────── TR → PL ÇEVİRİ ─────────────────── */
const TR_PL_MONTHS = {
  "OCAK": "STYCZEŃ", "SUBAT": "LUTY", "ŞUBAT": "LUTY", "MART": "MARZEC",
  "NISAN": "KWIECIEŃ", "NİSAN": "KWIECIEŃ", "MAYIS": "MAJ",
  "HAZIRAN": "CZERWIEC", "HAZİRAN": "CZERWIEC", "TEMMUZ": "LIPIEC",
  "AGUSTOS": "SIERPIEŃ", "AĞUSTOS": "SIERPIEŃ", "EYLUL": "WRZESIEŃ",
  "EYLÜL": "WRZESIEŃ", "EKIM": "PAŹDZIERNIK", "KASIM": "LISTOPAD",
  "ARALIK": "GRUDZIEŃ",
};
const TR_PL_COUNTRIES = {
  "TURKIYE": "TURCJA", "TÜRKİYE": "TURCJA", "TURCJA": "TURCJA",
  "ALMANYA": "NIEMCY", "FRANSA": "FRANCJA", "INGILTERE": "WIELKA BRYTANIA",
  "İNGİLTERE": "WIELKA BRYTANIA", "ITALYA": "WŁOCHY", "İTALYA": "WŁOCHY",
  "ISPANYA": "HISZPANIA", "İSPANYA": "HISZPANIA", "HOLLANDA": "HOLANDIA",
  "BELCIKA": "BELGIA", "BELÇİKA": "BELGIA", "AVUSTURYA": "AUSTRIA",
  "ISVICRE": "SZWAJCARIA", "İSVİÇRE": "SZWAJCARIA", "YUNANISTAN": "GRECJA",
  "BULGARISTAN": "BUŁGARIA", "ROMANYA": "RUMUNIA", "UKRAYNA": "UKRAINA",
  "RUSYA": "ROSJA", "IRAN": "IRAN", "İRAN": "IRAN", "IRAK": "IRAK",
  "SURIYE": "SYRIA", "SURİYE": "SYRIA", "MISIR": "EGIPT",
  "ABD": "USA", "AMERIKA": "USA", "KANADA": "KANADA",
  "CIN": "CHINY", "ÇİN": "CHINY", "JAPONYA": "JAPONIA",
  "PAKISTAN": "PAKISTAN", "PAKİSTAN": "PAKISTAN",
  "BANGLADES": "BANGLADESZ", "BANGLADEŞ": "BANGLADESZ",
  "HINDISTAN": "INDIE", "HİNDİSTAN": "INDIE",
  "GURCISTAN": "GRUZJA", "GÜRCÜSTAN": "GRUZJA",
  "AZERBAYCAN": "AZERBEJDŻAN", "OZBEKISTAN": "UZBEKISTAN",
  "ÖZBEKİSTAN": "UZBEKISTAN", "TURKMENISTAN": "TURKMENISTAN",
  "TÜRKMENİSTAN": "TURKMENISTAN", "KAZAKISTAN": "KAZACHSTAN",
  "KIRGIZISTAN": "KIRGISTAN", "TACIKISTAN": "TADŻYKISTAN",
  "TAYİKİSTAN": "TADŻYKISTAN", "NEPAL": "NEPAL", "SRI LANKA": "SRI LANKA",
  "POLONYA": "POLSKA", "POLSKA": "POLSKA",
};

function translateToPolish(text) {
  if (!text) return text;
  let result = text;
  for (const [tr, pl] of Object.entries(TR_PL_MONTHS)) {
    result = result.replace(new RegExp(`\\b${tr}\\b`, "gi"), pl);
  }
  for (const [tr, pl] of Object.entries(TR_PL_COUNTRIES)) {
    result = result.replace(new RegExp(`\\b${tr}\\b`, "gi"), pl);
  }
  return result;
}

/* ─────────────────── ALAN TANIMLARI ─────────────────── */
const TABS = [
  { id: "personal",  label: "Kişisel Bilgiler", pages: "S.1-2" },
  { id: "address",   label: "Adres & Amaç",     pages: "S.3-4" },
  { id: "family",    label: "Aile Üyeleri",     pages: "S.4" },
  { id: "legal",     label: "Hukuki & İmza",    pages: "S.5-8" },
  { id: "docimport", label: "Belge Aktar",      pages: "" },
  { id: "export",    label: "Dışa Aktar",       pages: "" },
];

const PERSONAL_FIELDS = [
  { id: "do_authority", label: "Do / To — Voyvodalık Adı", placeholder: "MAZOVYA VOYVODALIGI", max: 60 },
  { id: "date_year",  label: "Başvuru Yılı",  placeholder: "2026", max: 4, group: "date" },
  { id: "date_month", label: "Başvuru Ayı",   placeholder: "03",   max: 2, group: "date" },
  { id: "date_day",   label: "Başvuru Günü",  placeholder: "15",   max: 2, group: "date" },
  { id: "field_01_surname",       label: "1. Soyadı (Nazwisko)",               placeholder: "YILMAZ",   max: 20 },
  { id: "field_02_prev_surname_r1", label: "2. Önceki Soyadı — satır 1",       placeholder: "",         max: 20 },
  { id: "field_02_prev_surname_r2", label: "2. Önceki Soyadı — satır 2",       placeholder: "",         max: 20 },
  { id: "field_03_family_name",    label: "3. Aile Soyadı (Rodowe)",           placeholder: "YILMAZ",   max: 20 },
  { id: "field_04_name_r1",       label: "4. Adı — satır 1",                   placeholder: "MEHMET",   max: 20 },
  { id: "field_04_name_r2",       label: "4. Adı — satır 2",                   placeholder: "",         max: 20 },
  { id: "field_05_prev_name_r1",  label: "5. Önceki Adı — satır 1",            placeholder: "",         max: 20 },
  { id: "field_05_prev_name_r2",  label: "5. Önceki Adı — satır 2",            placeholder: "",         max: 20 },
  { id: "field_06_fathers_name",  label: "6. Baba Adı (Imię ojca)",            placeholder: "AHMET",    max: 20 },
  { id: "field_07_mothers_name",  label: "7. Anne Adı (Imię matki)",           placeholder: "FATMA",    max: 20 },
  { id: "field_08_mothers_maiden",label: "8. Anne Kızlık Soyadı",              placeholder: "KAYA",     max: 20 },
  { id: "field_09_dob",           label: "9. Doğum Tarihi (YYYY/AA/GG)",       placeholder: "1990/05/15", max: 10 },
  { id: "field_10_sex",           label: "10. Cinsiyet (M / K)",               placeholder: "M",        max: 1 },
  { id: "field_11_birthplace",    label: "11. Doğum Yeri (Miejsce urodzenia)", placeholder: "ISTANBUL", max: 20 },
  { id: "field_12_birth_country", label: "12. Doğum Ülkesi",                   placeholder: "TURKEY",   max: 20 },
  { id: "field_13_nationality",   label: "13. Milliyet (Narodowość)",          placeholder: "TURKISH",  max: 20 },
  { id: "field_14_citizenship",   label: "14. Vatandaşlık (Obywatelstwo)",     placeholder: "TURKISH",  max: 20 },
  { id: "field_15_marital",       label: "15. Medeni Durum (Stan cywilny)",    placeholder: "SINGLE",   max: 20 },
  { id: "field_16_education",     label: "16. Eğitim (Wykształcenie)",         placeholder: "UNIVERSITY", max: 20 },
  { id: "field_17_height",        label: "17. Boy — cm (Wzrost)",              placeholder: "175",      max: 3 },
  { id: "field_17_eye_color",     label: "17. Göz Rengi (Kolor oczu)",        placeholder: "BROWN",    max: 20 },
  { id: "field_17_special_marks", label: "17. Özel İşaretler (Znaki)",        placeholder: "NONE",     max: 20 },
  { id: "field_18_pesel",         label: "18. PESEL Numarası",                 placeholder: "",         max: 20 },
  { id: "field_19_phone",         label: "19. Telefon Numarası",               placeholder: "+48501234567", max: 20 },
  { id: "field_20_email",         label: "20. E-posta Adresi",                 placeholder: "EMAIL@EXAMPLE.COM", max: 50, shrink: true },
  { id: "p2_checkbox",            label: "Aile üyesi Polonya dışında ikamet ediyorsa işaretleyin", type: "checkbox" },
];

const ADDRESS_FIELDS = [
  { id: "addr_1_voivodeship", label: "1. İl (Województwo)",       placeholder: "MAZOWIECKIE",  max: 20 },
  { id: "addr_2_city",        label: "2. Şehir (Miejscowość)",    placeholder: "WARSZAWA",     max: 20 },
  { id: "addr_3_street",      label: "3. Sokak (Ulica)",          placeholder: "MARSZALKOWSKA",max: 20 },
  { id: "addr_4_house_no",    label: "4. Bina No (Numer domu)",   placeholder: "10",           max: 7 },
  { id: "addr_5_flat_no",     label: "5. Daire No (Mieszkanie)",  placeholder: "5",            max: 7 },
  { id: "addr_6_postal_code", label: "6. Posta Kodu (Kod pocztowy)", placeholder: "00-001",    max: 6 },
];

const PURPOSE_OPTIONS = [
  { id: "purpose_checkbox_1",  label: "Nitelikli çalışma (praca wymagająca wysokich kwalifikacji)" },
  { id: "purpose_checkbox_2",  label: "Mevsimlik çalışma (praca sezonowa)" },
  { id: "purpose_checkbox_3",  label: "Şirket içi transfer (przeniesienie wewnątrz przedsiębiorstwa)" },
  { id: "purpose_checkbox_4",  label: "Diğer çalışma (wykonywanie pracy innej)" },
  { id: "purpose_checkbox_5",  label: "Ticari faaliyet (prowadzenie działalności gospodarczej)" },
  { id: "purpose_checkbox_6",  label: "Yönetim kurulu üyeliği (pełnienie funkcji w zarządzie)" },
  { id: "purpose_checkbox_7",  label: "Bilimsel araştırma (prowadzenie badań naukowych)" },
  { id: "purpose_checkbox_8",  label: "Yüksek öğrenim (odbywanie studiów)" },
  { id: "purpose_checkbox_9",  label: "Dil kursu (szkolenie językowe)" },
  { id: "purpose_checkbox_10", label: "Mesleki eğitim (szkolenie zawodowe)" },
  { id: "purpose_checkbox_11", label: "Au pair" },
  { id: "purpose_checkbox_12", label: "Gönüllü çalışma (wolontariat)" },
  { id: "purpose_checkbox_13", label: "Aile birleşimi (połączenie z rodziną)" },
  { id: "purpose_checkbox_14", label: "Uzun süreli oturum (pobyt rezydenta długoterminowego)" },
  { id: "purpose_checkbox_15", label: "AB içi mobilite (mobilność wewnątrzunijna)" },
];

const STAY_FIELDS = [
  { id: "p4_staying_yes", label: "Evet — Polonya'da bulunuyorum (Tak)", type: "checkbox" },
  { id: "p4_staying_no",  label: "Hayır — Polonya'da bulunmuyorum (Nie)", type: "checkbox" },
  { id: "p4_date", label: "Son giriş / İkamet başlangıç tarihi (YYYY/AA/GG)", placeholder: "2025/12/01", max: 10 },
];

const LEGAL_SECTION_1 = [
  { id: "p5_basis_1", label: "Vizesiz giriş (ruch bezwizowy)" },
  { id: "p5_basis_2", label: "Vize (wiza)" },
  { id: "p5_basis_3", label: "Oturum izni (zezwolenie na pobyt)" },
  { id: "p5_basis_4", label: "Diğer belge (inny dokument)" },
];

const FINANCE_ROWS = 4;
const INSURANCE_ROWS = 4;

const LEGAL_SECTION_2 = [
  { id: "p5_conviction_checkbox", label: "Mahkûmiyet var — Evet (skazanie)" },
  { id: "p6_checkbox_1",          label: "VIII — Hayır, mahkûmiyet yok (nie)" },
  { id: "p6_checkbox_2",          label: "IX — Evet, ceza kovuşturması var (tak)" },
  { id: "p6_checkbox_3",          label: "IX — Hayır, kovuşturma yok (nie)" },
  { id: "p6_checkbox_4",          label: "X — Evet, mali yükümlülük var (tak)" },
  { id: "p6_checkbox_5",          label: "X — Hayır, yükümlülük yok (nie)" },
];

const SIGNATURE_FIELDS = [
  { id: "signature_specimen", label: "İmza Örneği (Wzór podpisu)", placeholder: "İmza", max: 40 },
  { id: "p8_date", label: "İmza Tarihi (YYYY/AA/GG)", placeholder: "2026/03/15", max: 10 },
];

const FAMILY_COLS = ["name","sex","dob","kinship","citizenship","residence","temp_permit","dependent"];
const FAMILY_HEADERS = ["Ad Soyad","Cinsiyet","Doğum Tar.","Akrabalık","Vatandaşlık","İkamet Yeri","Geçici İzin","Bağımlı"];
const FAMILY_PLACEHOLDERS = ["NOWAK ANNA","K","1985/03/20","SPOUSE","POLISH","WARSZAWA","TAK","TAK"];

const PREV_STAY_PL_ROWS  = 6;
const PREV_STAY_OUT_ROWS = 4;

/* ─────────────────── YARDIMCI BİLEŞENLER ─────────────────── */
function TextInput({ id, label, placeholder, max, value, onChange, shrink }) {
  const len = (value || "").length;
  const pct = max ? len / max : 0;
  const fontSize = shrink && len > 30 ? "text-[10px]" : shrink && len > 20 ? "text-xs" : "text-sm";
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-1.5
                    border-b border-white/[0.06] last:border-b-0
                    focus-within:border-emerald-500/50 transition-colors group">
      <label htmlFor={id}
        className="sm:w-48 flex-shrink-0 text-[11px] sm:text-xs font-medium uppercase tracking-wide
                   text-zinc-400 group-focus-within:text-emerald-400 transition-colors
                   leading-snug sm:truncate sm:pt-2" title={label}>
        {label}
      </label>
      <div className="flex-1 flex items-center min-w-0">
        <input id={id} type="text" maxLength={max} placeholder={placeholder}
          value={value || ""}
          aria-label={label}
          onChange={(e) => onChange(id, e.target.value.toUpperCase())}
          className={`flex-1 min-w-0 bg-transparent ${fontSize} font-mono text-zinc-50
                     placeholder:text-zinc-600 outline-none py-1.5 transition-all rounded`} />
        {max && (
          <span className={`text-[10px] font-mono flex-shrink-0 ml-2 tabular-nums select-none
                            ${len === 0
                              ? "text-zinc-700 opacity-0 group-focus-within:opacity-100"
                              : pct > 0.9 ? "text-red-400"
                              : pct > 0.6 ? "text-amber-400"
                              : "text-zinc-600"}`}
                aria-hidden="true">
            {len}/{max}
          </span>
        )}
      </div>
    </div>
  );
}

function CheckboxInput({ id, label, checked, onChange }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2.5 py-1.5 cursor-pointer group">
      <input type="checkbox" id={id} checked={!!checked}
        onChange={(e) => onChange(id, e.target.checked)}
        className="w-4 h-4 mt-0.5 rounded-sm border border-zinc-600 accent-emerald-500
                   flex-shrink-0 cursor-pointer focus-ring" />
      <span className="text-sm text-zinc-400 group-hover:text-zinc-200
                       leading-snug transition-colors select-none">{label}</span>
    </label>
  );
}

/* ─────────────────── ANA BİLEŞEN ─────────────────── */
export default function OturumFormApp({ onBack }) {
  const [tab, setTab] = useState("personal");
  const [mobilePane, setMobilePane] = useState("form");
  const [data, setData] = useState(() => {
    try { const s = sessionStorage.getItem("form_data"); return s ? JSON.parse(s) : {}; }
    catch { return {}; }
  });
  const [familyData, setFamilyData] = useState(() => {
    try { const s = sessionStorage.getItem("form_familyData"); return s ? JSON.parse(s) : Array.from({ length: 6 }, () => ({})); }
    catch { return Array.from({ length: 6 }, () => ({})); }
  });
  const [missingFields, setMissingFields] = useState(() => {
    try {
      const s = sessionStorage.getItem("form_missingFields");
      const parsed = s ? JSON.parse(s) : [];
      // Geçersiz girişleri yükleme zamanında temizle (eski sessionStorage verisi olabilir)
      return Array.isArray(parsed) ? parsed.filter(mf => mf && (mf.field_id || mf.label)) : [];
    } catch { return []; }
  });
  const [toast, setToast] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [missingPanelOpen, setMissingPanelOpen] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => { sessionStorage.setItem("form_data", JSON.stringify(data)); }, [data]);
  useEffect(() => { sessionStorage.setItem("form_familyData", JSON.stringify(familyData)); }, [familyData]);
  useEffect(() => { sessionStorage.setItem("form_missingFields", JSON.stringify(missingFields)); }, [missingFields]);

  const handleChange = useCallback((id, value) => {
    setData((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleFamilyChange = useCallback((rowIdx, col, value) => {
    setFamilyData((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [col]: value };
      return next;
    });
  }, []);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const buildExport = useCallback(() => {
    const result = { ...data };
    familyData.forEach((row, i) => {
      FAMILY_COLS.forEach((col) => {
        if (row[col]) result[`family_${i + 1}_${col}`] = row[col];
      });
    });
    Object.keys(result).forEach((k) => {
      if (result[k] === "" || result[k] === false) delete result[k];
    });
    return result;
  }, [data, familyData]);

  const buildPdfPayload = useCallback(() => {
    const result = { ...data };
    familyData.forEach((row, i) => {
      FAMILY_COLS.forEach((col) => {
        if (row[col]) result[`family_${i + 1}_${col}`] = row[col];
      });
    });
    Object.keys(result).forEach((k) => {
      if (result[k] === "") delete result[k];
    });
    return result;
  }, [data, familyData]);

  const handleExportJSON = useCallback(() => {
    const json = JSON.stringify(buildExport(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "form_verileri.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("JSON dosyası indirildi");
  }, [buildExport, showToast]);

  const handleImportJSON = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        const newData = {};
        const newFamily = Array.from({ length: 6 }, () => ({}));
        Object.entries(imported).forEach(([k, v]) => {
          const familyMatch = k.match(/^family_(\d+)_(.+)$/);
          if (familyMatch) {
            const idx = parseInt(familyMatch[1]) - 1;
            if (idx >= 0 && idx < 6) newFamily[idx][familyMatch[2]] = v;
          } else {
            newData[k] = v;
          }
        });
        setData(newData);
        setFamilyData(newFamily);
        showToast(`${Object.keys(imported).length} alan yüklendi`);
      } catch {
        showToast("JSON dosyası okunamadı", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [showToast]);

  const requestClear = useCallback(() => setConfirmClear(true), []);
  const performClear = useCallback(() => {
    setData({});
    setFamilyData(Array.from({ length: 6 }, () => ({})));
    setMissingFields([]);
    sessionStorage.removeItem("form_data");
    sessionStorage.removeItem("form_familyData");
    sessionStorage.removeItem("form_missingFields");
    setConfirmClear(false);
    showToast("Form temizlendi");
  }, [showToast]);

  const handleGeneratePDF = useCallback(async () => {
    setPdfLoading(true);
    try {
      const payload = buildPdfPayload();
      const today = new Date().toISOString().slice(0, 10);
      const surname = payload.field_01_surname;
      const name = payload.field_04_name_r1;
      const downloadName = surname && name
        ? `${surname}_${name}_${today}.pdf`
        : `oturum_${today}.pdf`;
      await generatePdf(payload, "oturum", downloadName);
      showToast("PDF oluşturuldu ve indirildi");
    } catch (err) {
      showToast(err.message || "PDF oluşturulamadı", "error");
    } finally {
      setPdfLoading(false);
    }
  }, [buildPdfPayload, showToast]);

  const fieldList = useMemo(() => {
    const list = [];
    const addFields = (fields) => {
      for (const f of fields) list.push({ field_id: f.id, label: f.label });
    };
    addFields(PERSONAL_FIELDS);
    addFields(ADDRESS_FIELDS);
    addFields(STAY_FIELDS);
    addFields(SIGNATURE_FIELDS);
    return list;
  }, []);

  const handleDocImport = useCallback((importedData, missing) => {
    const newData = {};
    const newFamily = Array.from({ length: 6 }, () => ({}));
    Object.entries({ ...data, ...importedData }).forEach(([k, v]) => {
      const familyMatch = k.match(/^family_(\d+)_(.+)$/);
      if (familyMatch) {
        const idx = parseInt(familyMatch[1]) - 1;
        if (idx >= 0 && idx < 6) newFamily[idx][familyMatch[2]] = v;
      } else {
        newData[k] = v;
      }
    });
    familyData.forEach((row, i) => {
      Object.entries(row).forEach(([col, val]) => {
        if (val && !newFamily[i][col]) newFamily[i][col] = val;
      });
    });
    setData(newData);
    setFamilyData(newFamily);
    // Geçersiz girişleri filtrele
    const validMissing = (missing || []).filter(mf => mf && (mf.field_id || mf.label));
    setMissingFields(validMissing);
    setTab("personal");
  }, [data, familyData]);

  const handleNavigateToField = useCallback((fieldId) => {
    if (!fieldId) return;
    if (fieldId.startsWith("addr_") || fieldId.startsWith("purpose_") ||
        fieldId.startsWith("p3a_") || fieldId.startsWith("p5b_") ||
        fieldId.startsWith("p4_")) {
      setTab("address");
    } else if (fieldId.startsWith("family_")) {
      setTab("family");
    } else if (fieldId.startsWith("p5_") || fieldId.startsWith("p6_") ||
               fieldId.startsWith("signature_") || fieldId.startsWith("p8_")) {
      setTab("legal");
    } else {
      setTab("personal");
    }
    setMobilePane("form");
    setTimeout(() => {
      const el = document.getElementById(fieldId);
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  }, []);

  const activeMissing = useMemo(
    () => missingFields.filter(mf => mf && mf.field_id && !data[mf.field_id]),
    [missingFields, data]
  );

  const filledCount = Object.values(data).filter((v) => v && v !== false && v !== "").length
    + familyData.reduce((acc, row) => acc + Object.values(row).filter((v) => v).length, 0);

  const totalFields = 113;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-950">

      {/* Header */}
      <header className="flex-shrink-0 h-12 glass border-b border-white/[0.06] flex items-center px-3 sm:px-4 gap-2 sm:gap-3 z-30">
        {onBack && (
          <button onClick={onBack}
            type="button"
            aria-label="Ana sayfaya dön"
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-base
                       w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/[0.06] focus-ring">
            <span aria-hidden="true">←</span>
          </button>
        )}
        <span aria-hidden="true"
              className="w-6 h-6 rounded bg-emerald-500 flex items-center justify-center
                         text-white text-xs font-bold leading-none flex-shrink-0">P</span>
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2 min-w-0">
          <span className="text-sm font-semibold text-zinc-50 truncate">Polonya Oturum İzni</span>
          <span className="hidden sm:inline text-xs text-zinc-500">— Wniosek o pobyt czasowy</span>
        </div>
        <div className="flex-1" />
        <ProgressIndicator filled={filledCount} total={totalFields} accent="emerald" />
      </header>

      {/* Tab nav */}
      <TabBar tabs={TABS} active={tab} onSelect={setTab} accent="emerald" />

      <SplitPane
        mobileTab={mobilePane}
        onMobileTabChange={setMobilePane}
        form={
          <div className="flex-1 overflow-y-auto form-scroll">
            <div className="px-4 sm:px-5 py-3" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>

              {tab !== "docimport" && (
                <MissingFieldsPanel
                  items={activeMissing}
                  open={missingPanelOpen}
                  onToggle={() => setMissingPanelOpen(!missingPanelOpen)}
                  onNavigate={handleNavigateToField}
                />
              )}

              {/* KİŞİSEL BİLGİLER */}
              {tab === "personal" && (<>
                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="Başvuru Tarihi" subtitle="Sayfa 1 — Üst kısım" />
                  <div className="grid grid-cols-3 gap-3 sm:gap-4 pb-1">
                    {PERSONAL_FIELDS.filter(f => f.group === "date").map(f =>
                      <TextInput key={f.id} {...f} value={data[f.id]} onChange={handleChange} />
                    )}
                  </div>
                </div>

                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="I. Kimlik Bilgileri" subtitle="Sayfa 1-2 — Soru 1-20" />
                  <div className="space-y-0">
                    {PERSONAL_FIELDS.filter(f => !f.group && f.type !== "checkbox").map(f =>
                      <TextInput key={f.id} {...f} value={data[f.id]} onChange={handleChange} />
                    )}
                  </div>
                  <div className="mt-3 pt-2 border-t border-white/[0.06] space-y-0">
                    {PERSONAL_FIELDS.filter(f => f.type === "checkbox").map(f =>
                      <CheckboxInput key={f.id} {...f} checked={data[f.id]} onChange={handleChange} />
                    )}
                  </div>
                </div>
              </>)}

              {/* ADRES & AMAÇ */}
              {tab === "address" && (<>
                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="Polonya'daki Adres" subtitle="Sayfa 3 — Bölüm B" />
                  <div className="space-y-0">
                    {ADDRESS_FIELDS.map(f =>
                      <TextInput key={f.id} {...f} value={data[f.id]} onChange={handleChange} />
                    )}
                  </div>
                </div>

                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="Kalış Amacı (Cel pobytu)" subtitle="Uygun olanları işaretleyin" />
                  <div className="space-y-0">
                    {PURPOSE_OPTIONS.map(opt =>
                      <CheckboxInput key={opt.id} {...opt} checked={data[opt.id]} onChange={handleChange} />
                    )}
                  </div>
                </div>

                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="Polonya'da Bulunma Durumu" subtitle="Sayfa 4 — Bölüm III" />
                  <div className="space-y-1">
                    <div className="flex flex-col sm:flex-row sm:gap-4">
                      {STAY_FIELDS.filter(f => f.type === "checkbox").map(f =>
                        <CheckboxInput key={f.id} {...f} checked={data[f.id]} onChange={handleChange} />
                      )}
                    </div>
                    {STAY_FIELDS.filter(f => !f.type).map(f =>
                      <TextInput key={f.id} {...f} value={data[f.id]} onChange={handleChange} />
                    )}
                  </div>
                </div>

                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="III.a Polonya'daki Önceki Kalışlar" subtitle="Sayfa 4" />
                  <div className="overflow-x-auto h-scroll -mx-4 px-4 sm:mx-0 sm:px-0">
                    <table className="w-full text-[11px] border-collapse min-w-[420px]">
                      <thead>
                        <tr>
                          <th className="px-1.5 py-1 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">Dönem (YYYY/MM-YYYY/MM)</th>
                          <th className="px-1.5 py-1 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">Hukuki Dayanak</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: PREV_STAY_PL_ROWS }, (_, i) => (
                          <tr key={i} className="border-b border-white/[0.06] hover:bg-white/[0.03]">
                            <td className="px-0 py-0">
                              <input type="text" placeholder="2024/01-2024/06"
                                aria-label={`Dönem satır ${i + 1}`}
                                value={data[`p3a_r${i+1}_period`] || ""}
                                onChange={e => handleChange(`p3a_r${i+1}_period`, e.target.value.toUpperCase())}
                                onBlur={e => handleChange(`p3a_r${i+1}_period`, translateToPolish(e.target.value.toUpperCase()))}
                                className="w-full px-1.5 py-1.5 text-[11px] font-mono bg-transparent
                                           outline-none focus:bg-white/[0.06] rounded transition-colors
                                           placeholder:text-zinc-600 text-zinc-50" />
                            </td>
                            <td className="px-0 py-0">
                              <input type="text" placeholder="WIZA / ZEZWOLENIE"
                                aria-label={`Hukuki dayanak satır ${i + 1}`}
                                value={data[`p3a_r${i+1}_basis`] || ""}
                                onChange={e => handleChange(`p3a_r${i+1}_basis`, e.target.value.toUpperCase())}
                                onBlur={e => handleChange(`p3a_r${i+1}_basis`, translateToPolish(e.target.value.toUpperCase()))}
                                className="w-full px-1.5 py-1.5 text-[11px] font-mono bg-transparent
                                           outline-none focus:bg-white/[0.06] rounded transition-colors
                                           placeholder:text-zinc-600 text-zinc-50" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="Polonya Dışı Kalışlar (Son 12 Ay)" subtitle="Sayfa 5" />
                  <div className="overflow-x-auto h-scroll -mx-4 px-4 sm:mx-0 sm:px-0">
                    <table className="w-full text-[11px] border-collapse min-w-[420px]">
                      <thead>
                        <tr>
                          <th className="px-1.5 py-1 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">Dönem (YYYY/MM-YYYY/MM)</th>
                          <th className="px-1.5 py-1 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">Ülke / Dayanak</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: PREV_STAY_OUT_ROWS }, (_, i) => (
                          <tr key={i} className="border-b border-white/[0.06] hover:bg-white/[0.03]">
                            <td className="px-0 py-0">
                              <input type="text" placeholder="PAŹDZIERNIK 2024 – LUTY 2025"
                                aria-label={`Dış kalış dönem satır ${i + 1}`}
                                value={data[`p5b_r${i+1}_period`] || ""}
                                onChange={e => handleChange(`p5b_r${i+1}_period`, e.target.value.toUpperCase())}
                                onBlur={e => handleChange(`p5b_r${i+1}_period`, translateToPolish(e.target.value.toUpperCase()))}
                                className="w-full px-1.5 py-1.5 text-[11px] font-mono bg-transparent
                                           outline-none focus:bg-white/[0.06] rounded transition-colors
                                           placeholder:text-zinc-600 text-zinc-50" />
                            </td>
                            <td className="px-0 py-0">
                              <input type="text" placeholder="TURCJA / NIEMCY"
                                aria-label={`Dış kalış dayanak satır ${i + 1}`}
                                value={data[`p5b_r${i+1}_basis`] || ""}
                                onChange={e => handleChange(`p5b_r${i+1}_basis`, e.target.value.toUpperCase())}
                                onBlur={e => handleChange(`p5b_r${i+1}_basis`, translateToPolish(e.target.value.toUpperCase()))}
                                className="w-full px-1.5 py-1.5 text-[11px] font-mono bg-transparent
                                           outline-none focus:bg-white/[0.06] rounded transition-colors
                                           placeholder:text-zinc-600 text-zinc-50" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>)}

              {/* AİLE */}
              {tab === "family" && (<>
                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="II. Aile Üyeleri" subtitle="Sayfa 4 — 6 satıra kadar" />
                  <div className="overflow-x-auto h-scroll -mx-4 px-4 sm:-mx-5 sm:px-5">
                    <table className="w-full text-[11px] border-collapse min-w-[700px]">
                      <thead>
                        <tr>
                          <th className="px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-400 w-6">#</th>
                          {FAMILY_HEADERS.map((h, i) => (
                            <th key={i} className="px-1.5 py-1 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {familyData.map((row, ri) => (
                          <tr key={ri} className="border-b border-white/[0.06] hover:bg-white/[0.03]">
                            <td className="px-1.5 py-1 text-zinc-500 font-mono text-center text-sm">{ri + 1}</td>
                            {FAMILY_COLS.map((col, ci) => (
                              <td key={col} className="px-0 py-0">
                                <input
                                  type="text"
                                  value={row[col] || ""}
                                  placeholder={FAMILY_PLACEHOLDERS[ci]}
                                  aria-label={`${FAMILY_HEADERS[ci]} — satır ${ri + 1}`}
                                  onChange={(e) => handleFamilyChange(ri, col, e.target.value.toUpperCase())}
                                  className="w-full px-1.5 py-1.5 text-[11px] font-mono bg-transparent
                                             outline-none focus:bg-emerald-500/10 rounded transition-colors
                                             placeholder:text-zinc-600 text-zinc-50"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    Tüm alanları BÜYÜK HARF ile doldurun. Tarih formatı: YYYY/AA/GG
                  </p>
                </div>
              </>)}

              {/* HUKUKİ */}
              {tab === "legal" && (<>
                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="V. Yasal Dayanak (Podstawa pobytu)" subtitle="Sayfa 5" />
                  <div className="space-y-0">
                    {LEGAL_SECTION_1.map(opt =>
                      <CheckboxInput key={opt.id} {...opt} checked={data[opt.id]} onChange={handleChange} />
                    )}
                  </div>
                </div>

                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="V. Mali Kaynaklar (Środki finansowe)" subtitle="Geçim masraflarını karşılama bilgisi" />
                  <div className="space-y-1.5">
                    {Array.from({ length: FINANCE_ROWS }, (_, i) => (
                      <input key={i} type="text"
                        id={`p5_finance_r${i+1}`}
                        aria-label={`Mali kaynak satır ${i + 1}`}
                        placeholder={i === 0 ? "Ör: UMOWA O PRACĘ, WYNAGRODZENIE 5000 PLN MIESIĘCZNIE" : ""}
                        value={data[`p5_finance_r${i+1}`] || ""}
                        onChange={e => handleChange(`p5_finance_r${i+1}`, e.target.value.toUpperCase())}
                        onBlur={e => handleChange(`p5_finance_r${i+1}`, translateToPolish(e.target.value.toUpperCase()))}
                        className="w-full px-2 py-1.5 text-xs font-mono bg-transparent
                                   outline-none focus:bg-white/[0.06] rounded-md transition-colors
                                   border border-white/[0.06] focus:border-white/15
                                   placeholder:text-zinc-600 text-zinc-50" />
                    ))}
                  </div>
                </div>

                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="VI. Sağlık Sigortası (Ubezpieczenie zdrowotne)" subtitle="Sağlık sigortası bilgisi" />
                  <div className="space-y-1.5">
                    {Array.from({ length: INSURANCE_ROWS }, (_, i) => (
                      <input key={i} type="text"
                        id={`p5_insurance_r${i+1}`}
                        aria-label={`Sağlık sigortası satır ${i + 1}`}
                        placeholder={i === 0 ? "Ör: ZUS / NFZ, NR POLISY: 123456789" : ""}
                        value={data[`p5_insurance_r${i+1}`] || ""}
                        onChange={e => handleChange(`p5_insurance_r${i+1}`, e.target.value.toUpperCase())}
                        onBlur={e => handleChange(`p5_insurance_r${i+1}`, translateToPolish(e.target.value.toUpperCase()))}
                        className="w-full px-2 py-1.5 text-xs font-mono bg-transparent
                                   outline-none focus:bg-white/[0.06] rounded-md transition-colors
                                   border border-white/[0.06] focus:border-white/15
                                   placeholder:text-zinc-600 text-zinc-50" />
                    ))}
                  </div>
                </div>

                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="VIII-X. Beyanlar (Oświadczenia)" subtitle="Sayfa 5-6" />
                  <div className="space-y-0">
                    {LEGAL_SECTION_2.map(opt =>
                      <CheckboxInput key={opt.id} {...opt} checked={data[opt.id]} onChange={handleChange} />
                    )}
                  </div>
                </div>

                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="D. İmza ve Tarih" subtitle="Sayfa 6-8 — Başvuranın imzası" />
                  <div className="space-y-0">
                    {SIGNATURE_FIELDS.map(f =>
                      <TextInput key={f.id} {...f} value={data[f.id]} onChange={handleChange} />
                    )}
                  </div>
                </div>
              </>)}

              {/* BELGE AKTAR */}
              {tab === "docimport" && (
                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="Belge Aktar" subtitle="PDF, DOCX veya tarama dosyasından otomatik doldurma" />
                  <DocImport
                    fieldList={fieldList}
                    onImport={handleDocImport}
                    showToast={showToast}
                    onNavigateToField={handleNavigateToField}
                    formType="oturum"
                  />
                </div>
              )}

              {/* DIŞA AKTAR */}
              {tab === "export" && (
                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="Dışa Aktar & İçe Aktar" subtitle="JSON formatında veri yönetimi" />
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={handleExportJSON}
                        type="button"
                        className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium
                                   hover:bg-emerald-400 transition-colors focus-ring">
                        JSON İndir
                      </button>
                      <button onClick={() => fileInputRef.current?.click()}
                        type="button"
                        className="glass text-zinc-200 px-4 py-2 rounded-lg text-sm font-medium
                                   hover:bg-white/[0.08] transition-colors focus-ring">
                        JSON Yükle
                      </button>
                      <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
                      <button
                        onClick={handleGeneratePDF}
                        type="button"
                        disabled={pdfLoading}
                        className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium
                                   hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed
                                   transition-colors focus-ring inline-flex items-center gap-2">
                        {pdfLoading && (
                          <span aria-hidden="true" className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        )}
                        {pdfLoading ? "Oluşturuluyor…" : "PDF Oluştur"}
                      </button>
                      <button onClick={requestClear}
                        type="button"
                        className="text-red-400 border border-red-900 px-4 py-2 rounded-lg text-sm font-medium
                                   hover:bg-red-950 transition-colors focus-ring">
                        Formu Temizle
                      </button>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-300">Veri Önizleme</span>
                        <span className="text-xs text-zinc-500">{Object.keys(buildExport()).length} alan</span>
                      </div>
                      <pre className="bg-zinc-950 border border-white/[0.06] rounded-lg p-3 text-xs font-mono text-emerald-400
                                      max-h-64 overflow-y-auto whitespace-pre leading-relaxed h-scroll">
                        {JSON.stringify(buildExport(), null, 2)}
                      </pre>
                    </div>

                    <div className="glass rounded-lg p-3">
                      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-300 mb-1.5">Kullanım</p>
                      <ol className="text-sm text-zinc-400 space-y-1 leading-relaxed list-decimal list-inside">
                        <li>Formu doldurun veya <strong className="text-zinc-200">JSON Yükle</strong> ile önceki veriyi içe aktarın.</li>
                        <li><strong className="text-zinc-200">PDF Oluştur</strong> butonuna tıklayın.</li>
                        <li>PDF otomatik olarak indirilir.</li>
                      </ol>
                      <p className="text-[11px] text-zinc-500 mt-2">
                        İpucu: <strong className="text-zinc-300">JSON İndir</strong> ile verilerinizi yedekleyebilirsiniz.
                      </p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        }
        preview={<PdfPreview data={data} familyData={familyData} formType="oturum" />}
      />

      <Toast toast={toast} />
      <ConfirmDialog
        open={confirmClear}
        title="Formu temizle"
        message="Tüm form verileri silinecek. Bu işlem geri alınamaz. Emin misiniz?"
        confirmLabel="Evet, sil"
        cancelLabel="Vazgeç"
        danger
        onConfirm={performClear}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
