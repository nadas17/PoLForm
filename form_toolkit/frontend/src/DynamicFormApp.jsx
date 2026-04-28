/**
 * DynamicFormApp — ui_schema.json'dan otomatik form üretir.
 *
 * Tek bir bileşen, herhangi bir form'u yapılandırma dosyasından render edebilir.
 * Bu sayede zap3, zaw_fa, konto_org gibi yeni formlar için ek React kodu yazmaya gerek kalmaz.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import PdfPreview from "./PdfPreview.jsx";
import DocImport from "./DocImport.jsx";
import { generatePdf, getUiSchema, formatDownloadName } from "./api.js";
import {
  ConfirmDialog, Toast, MissingFieldsPanel, SectionHeading, TabBar,
  ProgressIndicator, SplitPane,
} from "./components/Shared.jsx";

/* ───────── TR → PL çeviri (ui_schema'dan gelir) ───────── */
function buildTranslator(translations) {
  if (!translations) return (text) => text;
  const tables = Object.values(translations);
  return (text) => {
    if (!text) return text;
    let result = text;
    for (const table of tables) {
      for (const [tr, pl] of Object.entries(table)) {
        result = result.replace(new RegExp(`\\b${tr}\\b`, "gi"), pl);
      }
    }
    return result;
  };
}

/* ───────── Yardımcı bileşenler ───────── */
function TextInput({ id, label, placeholder, max, value, onChange, shrink, accent = "emerald" }) {
  const len = (value || "").length;
  const pct = max ? len / max : 0;
  const fontSize = shrink && len > 30 ? "text-[10px]" : shrink && len > 20 ? "text-xs" : "text-sm";
  const focusBorder = accent === "blue" ? "focus-within:border-blue-500/50" : "focus-within:border-emerald-500/50";
  const focusText   = accent === "blue" ? "group-focus-within:text-blue-400" : "group-focus-within:text-emerald-400";
  return (
    <div className={`flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-1.5
                    border-b border-white/[0.06] last:border-b-0 ${focusBorder} transition-colors group`}>
      <label htmlFor={id}
        className={`sm:w-48 flex-shrink-0 text-[11px] sm:text-xs font-medium uppercase tracking-wide
                   text-zinc-400 ${focusText} transition-colors leading-snug sm:truncate sm:pt-2`}
        title={label}>
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

function CheckboxInput({ id, label, checked, onChange, accent = "emerald" }) {
  const accentClass = accent === "blue" ? "accent-blue-500" : "accent-emerald-500";
  return (
    <label htmlFor={id} className="flex items-start gap-2.5 py-1.5 cursor-pointer group">
      <input type="checkbox" id={id} checked={!!checked}
        onChange={(e) => onChange(id, e.target.checked)}
        className={`w-4 h-4 mt-0.5 rounded-sm border border-zinc-600 ${accentClass}
                   flex-shrink-0 cursor-pointer focus-ring`} />
      <span className="text-sm text-zinc-400 group-hover:text-zinc-200
                       leading-snug transition-colors select-none">{label}</span>
    </label>
  );
}

function RadioGroup({ name, options, value, onChange, accent = "emerald" }) {
  const accentClass = accent === "blue" ? "accent-blue-500" : "accent-emerald-500";
  return (
    <div className="space-y-0" role="radiogroup" aria-label={name}>
      {options.map((opt) => (
        <label key={opt.id} className="flex items-start gap-2.5 py-1.5 cursor-pointer group">
          <input type="radio" name={name}
            checked={!!value[opt.id]}
            onChange={() => {
              options.forEach((o) => onChange(o.id, false));
              onChange(opt.id, true);
            }}
            className={`w-4 h-4 mt-0.5 ${accentClass} cursor-pointer focus-ring`} />
          <span className="text-sm text-zinc-400 group-hover:text-zinc-200
                         leading-snug transition-colors select-none">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

/* ───────── Bir grup'u render eder ───────── */
function FieldGroup({ group, data, onChange, accent }) {
  // Date alanları (group: "dob", "exp", vb.) — 3'lü grid
  const dateFields = (group.fields || []).filter(f => f.group);
  const dateGroups = {};
  dateFields.forEach(f => {
    if (!dateGroups[f.group]) dateGroups[f.group] = [];
    dateGroups[f.group].push(f);
  });

  const normalFields = (group.fields || []).filter(f => !f.group && f.type !== "checkbox");
  const checkboxFields = (group.fields || []).filter(f => f.type === "checkbox");

  return (
    <div className="glass rounded-xl p-4 mb-3">
      <SectionHeading title={group.title} subtitle={group.subtitle} />

      {/* Normal text inputs */}
      {normalFields.length > 0 && (
        <div className="space-y-0">
          {normalFields.map(f =>
            <TextInput key={f.id} {...f} value={data[f.id]} onChange={onChange} accent={accent} />
          )}
        </div>
      )}

      {/* Date / grouped inputs (gün/ay/yıl şeklinde 3'lü grid) */}
      {Object.entries(dateGroups).map(([groupKey, fields]) => (
        <div key={groupKey} className="grid grid-cols-3 gap-3 sm:gap-4 mt-2 pt-2 border-t border-white/[0.06]">
          {fields.map(f =>
            <TextInput key={f.id} {...f} value={data[f.id]} onChange={onChange} accent={accent} />
          )}
        </div>
      ))}

      {/* Checkbox inputs */}
      {checkboxFields.length > 0 && (
        <div className={`space-y-0 ${normalFields.length > 0 ? "mt-3 pt-2 border-t border-white/[0.06]" : ""}`}>
          {checkboxFields.map(f =>
            <CheckboxInput key={f.id} {...f} checked={data[f.id]} onChange={onChange} accent={accent} />
          )}
        </div>
      )}

      {/* Radio group (PESEL gibi formlar için) */}
      {group.checkbox_group && (
        <div className="mt-3 pt-2 border-t border-white/[0.06]">
          <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide block mb-1">
            {group.checkbox_group.label}
          </span>
          <RadioGroup
            name={group.checkbox_group.label}
            options={group.checkbox_group.options}
            value={data}
            onChange={onChange}
            accent={accent}
          />
          {group.checkbox_group.conditional_field && data[group.checkbox_group.conditional_field.show_when] && (
            <div className="mt-2">
              <TextInput {...group.checkbox_group.conditional_field} value={data[group.checkbox_group.conditional_field.id]} onChange={onChange} accent={accent} />
            </div>
          )}
        </div>
      )}

      {/* Date fields (PESEL ui_schema'da olduğu gibi) */}
      {group.date_fields && (
        <div className="mt-3 pt-2 border-t border-white/[0.06]">
          <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide block mb-1">
            {group.date_fields.label}
          </span>
          <div className="grid grid-cols-3 gap-3 mt-1">
            {group.date_fields.fields.map(f =>
              <TextInput key={f.id} {...f} value={data[f.id]} onChange={onChange} accent={accent} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── Ana bileşen ───────── */
export default function DynamicFormApp({ slug, formMeta, onBack }) {
  const [tab, setTab] = useState(null);
  const [mobilePane, setMobilePane] = useState("form");
  const [schema, setSchema] = useState(null);
  const [data, setData] = useState(() => {
    try { const s = sessionStorage.getItem(`${slug}_data`); return s ? JSON.parse(s) : {}; }
    catch { return {}; }
  });
  const [missingFields, setMissingFields] = useState(() => {
    try {
      const s = sessionStorage.getItem(`${slug}_missing`);
      const parsed = s ? JSON.parse(s) : [];
      return Array.isArray(parsed) ? parsed.filter(mf => mf && (mf.field_id || mf.label)) : [];
    } catch { return []; }
  });
  const [toast, setToast] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [missingPanelOpen, setMissingPanelOpen] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const fileInputRef = useRef(null);

  // Bu form'un accent rengi (icon'a göre tahmin)
  const accent = useMemo(() => {
    if (slug === "pesel") return "blue";
    return "emerald";
  }, [slug]);

  // ui_schema yükleme
  useEffect(() => {
    let cancelled = false;
    getUiSchema(slug)
      .then(s => {
        if (cancelled) return;
        setSchema(s);
        if (s.tabs?.length) setTab(s.tabs[0].id);
      })
      .catch(err => {
        if (cancelled) return;
        setLoadError(err.message || "UI şeması yüklenemedi");
      });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => { sessionStorage.setItem(`${slug}_data`, JSON.stringify(data)); }, [data, slug]);
  useEffect(() => { sessionStorage.setItem(`${slug}_missing`, JSON.stringify(missingFields)); }, [missingFields, slug]);

  const translate = useMemo(() => buildTranslator(schema?.translations), [schema]);

  const handleChange = useCallback((id, value) => {
    setData(prev => ({ ...prev, [id]: value }));
  }, []);

  // Çeviri olan stringleri otomatik dönüştür (onBlur'da olmayacak ama submit'te olacak)
  const buildExport = useCallback(() => {
    const result = { ...data };
    Object.keys(result).forEach(k => {
      const v = result[k];
      if (typeof v === "string" && v) result[k] = translate(v);
      if (result[k] === "" || result[k] === false) delete result[k];
    });
    return result;
  }, [data, translate]);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleExportJSON = useCallback(() => {
    const json = JSON.stringify(buildExport(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url2 = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url2;
    a.download = `${slug}_verileri.json`;
    a.click();
    URL.revokeObjectURL(url2);
    showToast("JSON dosyası indirildi");
  }, [buildExport, showToast, slug]);

  const handleImportJSON = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        setData(imported);
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
    setMissingFields([]);
    sessionStorage.removeItem(`${slug}_data`);
    sessionStorage.removeItem(`${slug}_missing`);
    setConfirmClear(false);
    showToast("Form temizlendi");
  }, [showToast, slug]);

  const handleGeneratePDF = useCallback(async () => {
    setPdfLoading(true);
    try {
      const exportData = buildExport();
      const downloadName = formatDownloadName(schema?.download_name, exportData);
      await generatePdf(exportData, slug, downloadName);
      showToast("PDF oluşturuldu ve indirildi");
    } catch (err) {
      showToast(err.message || "PDF oluşturulamadı", "error");
    } finally {
      setPdfLoading(false);
    }
  }, [buildExport, showToast, slug, schema]);

  // Belge aktarma için fieldList — tüm alanları topla
  const fieldList = useMemo(() => {
    const list = [];
    if (!schema?.tabs) return list;
    for (const t of schema.tabs) {
      for (const g of (t.groups || [])) {
        for (const f of (g.fields || [])) list.push({ field_id: f.id, label: f.label });
        if (g.checkbox_group) {
          for (const o of g.checkbox_group.options || []) list.push({ field_id: o.id, label: o.label });
          if (g.checkbox_group.conditional_field) {
            const cf = g.checkbox_group.conditional_field.field;
            list.push({ field_id: cf.id, label: cf.label });
          }
        }
        for (const f of (g.date_fields?.fields || [])) list.push({ field_id: f.id, label: f.label });
      }
    }
    return list;
  }, [schema]);

  const handleDocImport = useCallback((importedData, missing) => {
    setData(prev => ({ ...prev, ...importedData }));
    const validMissing = (missing || []).filter(mf => mf && (mf.field_id || mf.label));
    setMissingFields(validMissing);
    if (schema?.tabs?.length) setTab(schema.tabs[0].id);
  }, [schema]);

  // Hangi alan hangi tab'da? — eksik alan navigasyonu için
  const fieldToTab = useMemo(() => {
    const map = {};
    if (!schema?.tabs) return map;
    for (const t of schema.tabs) {
      for (const g of (t.groups || [])) {
        for (const f of (g.fields || [])) map[f.id] = t.id;
        if (g.checkbox_group) {
          for (const o of g.checkbox_group.options || []) map[o.id] = t.id;
          if (g.checkbox_group.conditional_field) map[g.checkbox_group.conditional_field.field.id] = t.id;
        }
        for (const f of (g.date_fields?.fields || [])) map[f.id] = t.id;
      }
    }
    return map;
  }, [schema]);

  const handleNavigateToField = useCallback((fieldId) => {
    if (!fieldId) return;
    const targetTab = fieldToTab[fieldId];
    if (targetTab) setTab(targetTab);
    setMobilePane("form");
    setTimeout(() => {
      const el = document.getElementById(fieldId);
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  }, [fieldToTab]);

  const activeMissing = useMemo(
    () => missingFields.filter(mf => mf && mf.field_id && !data[mf.field_id]),
    [missingFields, data]
  );

  const filledCount = Object.values(data).filter(v => v && v !== false && v !== "").length;
  const totalFields = schema?.total_fields || formMeta?.total_fields || 0;

  /* ───────── Render ───────── */
  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 px-4">
        <div className="max-w-md w-full glass-elevated rounded-xl p-6 text-center">
          <p className="text-sm text-red-400 mb-4">{loadError}</p>
          <button onClick={onBack}
            className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-400">
            Ana sayfaya dön
          </button>
        </div>
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950 text-sm text-zinc-400 gap-3"
           role="status" aria-live="polite">
        <div aria-hidden="true" className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
        Form yükleniyor…
      </div>
    );
  }

  const tabs = [
    ...(schema.tabs || []).map(t => ({ id: t.id, label: t.label, pages: t.pages })),
  ];

  const currentTab = (schema.tabs || []).find(t => t.id === tab);
  const isSpecialTab = tab === "docimport" || tab === "export";

  const headerColor = accent === "blue" ? "bg-blue-500" : "bg-emerald-500";

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-950">

      {/* Header */}
      <header className="flex-shrink-0 h-12 glass border-b border-white/[0.06]
                         flex items-center px-3 sm:px-4 gap-2 sm:gap-3 z-30">
        {onBack && (
          <button onClick={onBack} type="button"
            aria-label="Ana sayfaya dön"
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-base
                       w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/[0.06] focus-ring">
            <span aria-hidden="true">←</span>
          </button>
        )}
        <span aria-hidden="true"
              className={`w-6 h-6 rounded ${headerColor} flex items-center justify-center
                         text-white text-xs font-bold leading-none flex-shrink-0`}>
          {(formMeta?.title || slug)[0].toUpperCase()}
        </span>
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2 min-w-0">
          <span className="text-sm font-semibold text-zinc-50 truncate">{formMeta?.title || slug}</span>
          {formMeta?.description && (
            <span className="hidden sm:inline text-xs text-zinc-500 truncate">— {formMeta.description}</span>
          )}
        </div>
        <div className="flex-1" />
        <ProgressIndicator filled={filledCount} total={totalFields} accent={accent} />
      </header>

      <TabBar tabs={tabs} active={tab} onSelect={setTab} accent={accent} />

      <SplitPane
        accent={accent}
        mobileTab={mobilePane}
        onMobileTabChange={setMobilePane}
        form={
          <div className="flex-1 overflow-y-auto form-scroll">
            <div className="px-4 sm:px-5 py-3"
                 role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>

              {!isSpecialTab && (
                <MissingFieldsPanel
                  items={activeMissing}
                  open={missingPanelOpen}
                  onToggle={() => setMissingPanelOpen(!missingPanelOpen)}
                  onNavigate={handleNavigateToField}
                />
              )}

              {/* Normal sekmeler — schema'dan */}
              {!isSpecialTab && currentTab && (currentTab.groups || []).map((g, i) => (
                <FieldGroup key={i} group={g} data={data} onChange={handleChange} accent={accent} />
              ))}

              {/* Belge aktar */}
              {tab === "docimport" && (
                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="Belge Aktar" subtitle="PDF, DOCX veya tarama dosyasından otomatik doldurma" />
                  <DocImport
                    fieldList={fieldList}
                    onImport={handleDocImport}
                    showToast={showToast}
                    onNavigateToField={handleNavigateToField}
                    formType={slug}
                  />
                </div>
              )}

              {/* Dışa aktar */}
              {tab === "export" && (
                <div className="glass rounded-xl p-4 mb-3">
                  <SectionHeading title="Dışa Aktar & İçe Aktar" subtitle="JSON formatında veri yönetimi" />
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={handleExportJSON} type="button"
                        className={`${accent === "blue" ? "bg-blue-500 hover:bg-blue-400" : "bg-emerald-500 hover:bg-emerald-400"}
                                   text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus-ring`}>
                        JSON İndir
                      </button>
                      <button onClick={() => fileInputRef.current?.click()} type="button"
                        className="glass text-zinc-200 px-4 py-2 rounded-lg text-sm font-medium
                                   hover:bg-white/[0.08] transition-colors focus-ring">
                        JSON Yükle
                      </button>
                      <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
                      <button onClick={handleGeneratePDF} disabled={pdfLoading} type="button"
                        className={`${accent === "blue" ? "bg-blue-600 hover:bg-blue-500" : "bg-emerald-600 hover:bg-emerald-500"}
                                   text-white px-4 py-2 rounded-lg text-sm font-medium
                                   disabled:opacity-50 disabled:cursor-not-allowed
                                   transition-colors focus-ring inline-flex items-center gap-2`}>
                        {pdfLoading && (
                          <span aria-hidden="true" className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        )}
                        {pdfLoading ? "Oluşturuluyor…" : "PDF Oluştur"}
                      </button>
                      <button onClick={requestClear} type="button"
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
                      <pre className={`bg-zinc-950 border border-white/[0.06] rounded-lg p-3 text-xs font-mono
                                      ${accent === "blue" ? "text-blue-400" : "text-emerald-400"}
                                      max-h-64 overflow-y-auto whitespace-pre leading-relaxed h-scroll`}>
                        {JSON.stringify(buildExport(), null, 2)}
                      </pre>
                    </div>

                    <div className="glass rounded-lg p-3">
                      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-300 mb-1.5">Kullanım</p>
                      <ol className="text-sm text-zinc-400 space-y-1 leading-relaxed list-decimal list-inside">
                        <li>Formu doldurun veya <strong className="text-zinc-200">JSON Yükle</strong> ile veri içe aktarın.</li>
                        <li><strong className="text-zinc-200">PDF Oluştur</strong> butonuna tıklayın.</li>
                        <li>PDF otomatik olarak indirilir.</li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        }
        preview={<PdfPreview data={data} familyData={null} formType={slug} />}
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
