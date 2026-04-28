import { useState, useRef, useCallback } from "react";
import { parseDocument } from "./api.js";
import { MissingFieldsPanel } from "./components/Shared.jsx";

const MAX_SIZE_MB = 20;
const ACCEPT = ".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp";

/**
 * DocImport — Belge ayrıştırma ve alan eşleştirme bileşeni.
 * Üç fazlı: Upload → Loading → Mapping UI
 */
export default function DocImport({ fieldList, onImport, showToast, onNavigateToField, formType }) {
  const [phase, setPhase] = useState("upload");
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [rawOpen, setRawOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(true);
  const fileRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      showToast(`Dosya çok büyük (maks. ${MAX_SIZE_MB} MB)`, "error");
      return;
    }
    setPhase("loading");
    try {
      const data = await parseDocument(file, formType);
      setResult(data);
      setMappings(
        (data.mappings || []).map((m) => ({
          ...m,
          selected_field_id: m.matched_field_id || "",
          edited_value: m.extracted_value,
        }))
      );
      setPhase("mapping");
    } catch (err) {
      showToast(err.message || "Belge ayrıştırılamadı", "error");
      setPhase("upload");
    }
  }, [showToast, formType]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }, [handleFile]);

  const handleFieldChange = useCallback((idx, fieldId) => {
    setMappings((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], selected_field_id: fieldId };
      return next;
    });
  }, []);

  const handleValueChange = useCallback((idx, value) => {
    setMappings((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], edited_value: value };
      return next;
    });
  }, []);

  const handleImport = useCallback(() => {
    const importData = {};
    let count = 0;
    for (const m of mappings) {
      if (m.selected_field_id && m.edited_value) {
        importData[m.selected_field_id] = String(m.edited_value).toUpperCase();
        count++;
      }
    }
    if (count === 0) {
      showToast("Aktarılacak eşleştirilmiş alan yok", "error");
      return;
    }
    onImport(importData, result?.missing_fields || []);
    showToast(`${count} alan forma aktarıldı`);
    setPhase("upload");
    setResult(null);
    setMappings([]);
  }, [mappings, onImport, showToast, result]);

  const handleCancel = useCallback(() => {
    setPhase("upload");
    setResult(null);
    setMappings([]);
  }, []);

  const selectedCount = mappings.filter((m) => m.selected_field_id && m.edited_value).length;

  const usedFieldIds = new Set(
    mappings.filter((m) => m.selected_field_id).map((m) => m.selected_field_id)
  );

  /* ───── UPLOAD FAZI ───── */
  if (phase === "upload") {
    return (
      <div className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          aria-label="Belge yükle: dosyayı sürükleyip bırakın veya tıklayarak seçin"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileRef.current?.click();
            }
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 sm:p-10 text-center cursor-pointer
                      transition-all duration-200 focus-ring select-none
                      ${dragOver
                        ? "border-emerald-500 bg-emerald-500/10 scale-[1.01]"
                        : "border-white/10 hover:border-white/25 bg-white/[0.02] hover:bg-white/[0.04]"}`}
        >
          <div aria-hidden="true" className="mb-3 flex justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                 className={`w-12 h-12 transition-colors ${dragOver ? "text-emerald-400" : "text-zinc-600"}`}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <p className="text-sm text-zinc-300 mb-1">
            Belgeyi buraya <strong className="text-emerald-400">sürükleyin</strong> veya tıklayarak seçin
          </p>
          <p className="text-xs text-zinc-500">
            PDF, DOCX, JPG, PNG · maks. {MAX_SIZE_MB} MB
          </p>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            onChange={handleInputChange}
            className="hidden"
          />
        </div>
        <div className="glass rounded-lg p-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-300 mb-2">Nasıl Çalışır?</p>
          <ol className="text-sm text-zinc-400 space-y-1 leading-relaxed list-decimal list-inside">
            <li>Belgenizi (pasaport, kimlik, DOCX, tarama) yükleyin.</li>
            <li>LlamaParse AI belgeyi ayrıştırır ve verileri çıkarır.</li>
            <li>Çıkarılan veriler otomatik olarak form alanlarıyla eşleştirilir.</li>
            <li>Eşleştirmeleri kontrol edip onaylayın.</li>
          </ol>
        </div>
      </div>
    );
  }

  /* ───── LOADING FAZI ───── */
  if (phase === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4"
           role="status" aria-live="polite" aria-label="Belge ayrıştırılıyor">
        <div aria-hidden="true"
             className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-zinc-300">Belge ayrıştırılıyor…</p>
        <p className="text-xs text-zinc-500">Bu işlem birkaç saniye sürebilir</p>
      </div>
    );
  }

  /* ───── MAPPING FAZI ───── */
  return (
    <div className="space-y-4">
      {/* Üst bilgi */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
            Alan Eşleştirme
          </span>
          {result?.filename && (
            <span className="ml-2 text-xs text-zinc-500 truncate inline-block max-w-[200px] align-bottom" title={result.filename}>
              {result.filename}
            </span>
          )}
        </div>
        <span className="text-xs text-zinc-400">
          <span className="text-emerald-400 font-medium">{selectedCount}</span>
          <span className="text-zinc-600"> / {mappings.length} alan seçili</span>
        </span>
      </div>

      {/* Eksik alanlar paneli */}
      {result?.missing_fields?.length > 0 && (
        <MissingFieldsPanel
          items={result.missing_fields}
          open={missingOpen}
          onToggle={() => setMissingOpen(!missingOpen)}
          onNavigate={onNavigateToField}
        />
      )}

      {/* Eşleştirme tablosu */}
      <div className="overflow-x-auto h-scroll -mx-4 px-4 sm:-mx-5 sm:px-5">
        <table className="w-full text-sm border-collapse min-w-[600px]">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400 w-40">
                Çıkarılan Veri
              </th>
              <th className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400 w-44">
                Değer
              </th>
              <th className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Form Alanı
              </th>
              <th className="px-2 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-zinc-400 w-16">
                Güven
              </th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m, i) => {
              const conf = m.confidence ?? 0;
              const confColor = conf >= 0.8 ? "text-emerald-400"
                              : conf >= 0.5 ? "text-amber-400"
                              : "text-red-400";
              const confBg = conf >= 0.8 ? "bg-emerald-950/30"
                            : conf >= 0.5 ? "bg-amber-950/20"
                            : "";

              return (
                <tr key={i} className={`border-b border-white/[0.06] hover:bg-white/[0.03] ${confBg}`}>
                  <td className="px-2 py-1.5 text-xs text-zinc-400 font-mono truncate max-w-0" title={m.extracted_key}>
                    {m.extracted_key}
                  </td>
                  <td className="px-1 py-0.5">
                    <input
                      type="text"
                      value={m.edited_value || ""}
                      aria-label={`Değer — ${m.extracted_key}`}
                      onChange={(e) => handleValueChange(i, e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-mono bg-transparent text-zinc-50
                                 outline-none focus:bg-white/[0.06] rounded-md transition-colors
                                 border border-transparent focus:border-white/15"
                    />
                    {!m.value_fits && m.selected_field_id && (
                      <span className="text-[10px] text-amber-500 block px-2 mt-0.5">
                        Uzunluk sınırını aşıyor (maks {m.max_length})
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-0.5">
                    <select
                      value={m.selected_field_id || ""}
                      aria-label={`Form alanı — ${m.extracted_key}`}
                      onChange={(e) => handleFieldChange(i, e.target.value)}
                      className="w-full px-2 py-1.5 text-xs bg-zinc-900 text-zinc-200
                                 border border-white/10 rounded-md outline-none
                                 focus:border-emerald-500 transition-colors cursor-pointer"
                    >
                      <option value="">— Seçiniz —</option>
                      {fieldList.map((f) => (
                        <option
                          key={f.field_id}
                          value={f.field_id}
                          disabled={usedFieldIds.has(f.field_id) && m.selected_field_id !== f.field_id}
                        >
                          {f.label || f.field_id}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={`px-2 py-1.5 text-right text-xs font-mono font-medium tabular-nums ${confColor}`}>
                    {Math.round(conf * 100)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Ham metin önizleme */}
      <div className="border border-white/[0.06] rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setRawOpen(!rawOpen)}
          aria-expanded={rawOpen}
          aria-controls="raw-text"
          className="w-full px-3 py-2 flex items-center justify-between bg-white/[0.03]
                     hover:bg-white/[0.06] transition-colors text-left focus-ring"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
            Ham Metin Önizleme
          </span>
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            {rawOpen ? "Daralt" : "Genişlet"}
            <span aria-hidden="true" className="inline-block transition-transform"
                  style={{ transform: rawOpen ? "rotate(180deg)" : "rotate(0)" }}>▾</span>
          </span>
        </button>
        {rawOpen && (
          <pre id="raw-text"
               className="px-3 py-2 text-xs font-mono text-zinc-400 max-h-48 overflow-y-auto h-scroll
                          whitespace-pre-wrap leading-relaxed bg-zinc-950">
            {result?.raw_text || "(Metin çıkarılamadı)"}
          </pre>
        )}
      </div>

      {/* Aksiyon butonları */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={handleImport}
          disabled={selectedCount === 0}
          className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium
                     hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed
                     transition-colors focus-ring"
        >
          Seçili Alanları İçe Aktar ({selectedCount})
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="text-zinc-300 border border-white/10 px-4 py-2 rounded-lg text-sm font-medium
                     hover:bg-white/[0.06] transition-colors focus-ring"
        >
          İptal
        </button>
      </div>
    </div>
  );
}
