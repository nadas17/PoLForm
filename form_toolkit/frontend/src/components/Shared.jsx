import { useEffect, useRef } from "react";

/* ─────────────────── RENK ŞEMALARI ───────────────────
 * Tailwind JIT dinamik class adlarını taramaz, bu yüzden
 * accent renkleri için explicit bir lookup haritası kullanıyoruz.
 */
const ACCENTS = {
  emerald: {
    tabActiveText: "text-emerald-300",
    tabActiveBg:   "bg-emerald-500/15",
    tabActivePage: "text-emerald-500/70",
    progressBar:   "bg-emerald-500",
    iconBg:        "bg-emerald-500",
  },
  blue: {
    tabActiveText: "text-blue-300",
    tabActiveBg:   "bg-blue-500/15",
    tabActivePage: "text-blue-500/70",
    progressBar:   "bg-blue-500",
    iconBg:        "bg-blue-500",
  },
  amber: {
    border:        "border-amber-500/30",
    bg:            "bg-amber-500/5",
    bgHover:       "hover:bg-amber-500/10",
    bgItemHover:   "hover:bg-amber-900/30",
    text:          "text-amber-400",
    textHigh:      "text-amber-300",
    textMute:      "text-amber-600",
    iconText:      "text-amber-400",
  },
};

/**
 * Onay modal'ı — window.confirm() yerine erişilebilir alternatif.
 */
export function ConfirmDialog({ open, title, message, confirmLabel = "Onayla", cancelLabel = "Vazgeç", danger = false, onConfirm, onCancel }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onCancel?.(); }
      if (e.key === "Enter")  { e.preventDefault(); onConfirm?.(); }
    };
    document.addEventListener("keydown", onKey);
    confirmRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-msg"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ animation: "fadeIn 0.15s ease-out" }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div
        className="relative glass-elevated rounded-xl p-5 max-w-sm w-full shadow-2xl"
        style={{ animation: "slideUp 0.2s ease-out" }}
      >
        <h2 id="confirm-title" className="text-base font-semibold text-zinc-50 mb-1">
          {title}
        </h2>
        <p id="confirm-msg" className="text-sm text-zinc-400 mb-5 leading-relaxed">
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300
                       border border-white/10 hover:bg-white/[0.06] transition-colors focus-ring"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors focus-ring
                       ${danger
                         ? "bg-red-600 hover:bg-red-500"
                         : "bg-emerald-600 hover:bg-emerald-500"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Erişilebilir toast — role=status / role=alert.
 */
export function Toast({ toast }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      style={{ animation: "slideUp 0.2s ease-out" }}
      className={`fixed bottom-4 right-4 left-4 sm:left-auto z-50 px-4 py-2.5
                  rounded-lg text-xs font-medium shadow-2xl max-w-sm sm:max-w-md
                  ${isError
                    ? "bg-red-600 text-white border border-red-500"
                    : "glass-elevated text-zinc-50"}`}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full flex-shrink-0
                          ${isError ? "bg-red-200" : "bg-emerald-400"}`} />
        <span className="truncate">{toast.msg}</span>
      </div>
    </div>
  );
}

/**
 * Eksik alanlar paneli — geçersiz girişleri filtreler, klavye ile gezilebilir.
 */
export function MissingFieldsPanel({ items, open, onToggle, onNavigate }) {
  // Eski sessionStorage'tan gelen geçersiz girişleri sustur
  const valid = (items || []).filter(mf => mf && (mf.field_id || mf.label));
  if (valid.length === 0) return null;

  const a = ACCENTS.amber;

  return (
    <div className={`${a.border} ${a.bg} border rounded-xl overflow-hidden mb-3`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="missing-list"
        className={`w-full px-4 py-2.5 flex items-center justify-between
                   ${a.bgHover} transition-colors text-left focus-ring`}
      >
        <span className={`text-xs font-semibold uppercase tracking-widest ${a.text} flex items-center gap-2`}>
          <span aria-hidden="true">⚠</span>
          Eksik Alanlar ({valid.length})
        </span>
        <span className={`text-xs ${a.textMute} flex items-center gap-1`}>
          {open ? "Daralt" : "Genişlet"}
          <span aria-hidden="true" className="transition-transform inline-block"
                style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}>▾</span>
        </span>
      </button>
      {open && (
        <ul id="missing-list" className="px-2 pb-2 space-y-0.5">
          {valid.map((mf, i) => {
            const label  = mf.label  || mf.field_id || "Bilinmeyen alan";
            const reason = mf.reason || "Belgede bulunamadı";
            const clickable = !!mf.field_id;
            return (
              <li key={mf.field_id || `mf-${i}`}>
                <button
                  type="button"
                  onClick={() => clickable && onNavigate?.(mf.field_id)}
                  disabled={!clickable}
                  className={`w-full text-xs flex gap-2 rounded-md px-2 py-1.5 text-left
                              transition-colors focus-ring
                              ${clickable
                                ? `cursor-pointer ${a.bgItemHover}`
                                : "cursor-default opacity-70"}`}
                >
                  <span className={`${a.text} font-medium shrink-0`}>{label}</span>
                  <span className="text-zinc-400 truncate" title={reason}>
                    — {reason}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Bölüm başlığı — tüm formlarda ortak.
 */
export function SectionHeading({ title, subtitle }) {
  return (
    <div className="pt-5 pb-1 first:pt-1">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          {title}
        </h3>
        {subtitle && <span className="text-xs text-zinc-600">{subtitle}</span>}
      </div>
      <div className="mt-1.5 h-px bg-white/[0.06]" />
    </div>
  );
}

/**
 * Sekme çubuğu — yatay kaydırma + aktif gösterge + ARIA.
 */
export function TabBar({ tabs, active, onSelect, accent = "emerald" }) {
  const a = ACCENTS[accent] || ACCENTS.emerald;
  return (
    <nav
      role="tablist"
      aria-label="Form bölümleri"
      className="flex-shrink-0 h-10 glass border-b border-white/[0.06]
                 flex items-center px-2 sm:px-4 gap-1 z-20 overflow-x-auto h-scroll"
    >
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${t.id}`}
            id={`tab-${t.id}`}
            type="button"
            onClick={() => onSelect(t.id)}
            className={`relative rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap
                        transition-colors duration-150 focus-ring flex-shrink-0
                        ${isActive
                          ? `${a.tabActiveText} ${a.tabActiveBg}`
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"}`}
          >
            {t.label}
            {t.pages && (
              <span className={`ml-1.5 text-[10px] font-mono
                                ${isActive ? a.tabActivePage : "text-zinc-600"}`}>
                {t.pages}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Doluluk göstergesi — küçük ekranda sadece sayı gösterir.
 */
export function ProgressIndicator({ filled, total, accent = "emerald" }) {
  const a = ACCENTS[accent] || ACCENTS.emerald;
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  return (
    <div
      className="flex items-center gap-2"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Form doluluk oranı: yüzde ${pct}`}
    >
      <div className="hidden sm:block w-20 h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full ${a.progressBar} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-zinc-400 tabular-nums w-14 text-right">
        {filled} / {total}
      </span>
    </div>
  );
}

/**
 * Mobil/desktop split — küçük ekranda dikey, büyük ekranda yan yana.
 * Form ve PDF preview'i içeride render eder.
 */
export function SplitPane({ form, preview, mobileTab = "form", onMobileTabChange, accent = "emerald" }) {
  const a = ACCENTS[accent] || ACCENTS.emerald;
  return (
    <main className="flex flex-col lg:flex-row flex-1 min-h-0">
      {/* Mobil sekme seçici — sadece küçük ekranda görünür */}
      <div className="lg:hidden flex-shrink-0 flex items-center gap-1 px-3 py-2 border-b border-white/[0.06] glass">
        <button
          type="button"
          onClick={() => onMobileTabChange("form")}
          aria-pressed={mobileTab === "form"}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors focus-ring
                      ${mobileTab === "form"
                        ? `${a.tabActiveBg} ${a.tabActiveText}`
                        : "text-zinc-400 hover:bg-white/[0.04]"}`}
        >
          Form
        </button>
        <button
          type="button"
          onClick={() => onMobileTabChange("preview")}
          aria-pressed={mobileTab === "preview"}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors focus-ring
                      ${mobileTab === "preview"
                        ? `${a.tabActiveBg} ${a.tabActiveText}`
                        : "text-zinc-400 hover:bg-white/[0.04]"}`}
        >
          Önizleme
        </button>
      </div>

      {/* Form paneli */}
      <div className={`flex-1 lg:w-1/2 lg:flex flex-col min-h-0 bg-transparent
                       lg:border-r border-white/[0.06]
                       ${mobileTab === "form" ? "flex" : "hidden lg:flex"}`}>
        {form}
      </div>

      {/* Önizleme paneli */}
      <div className={`flex-1 lg:w-1/2 lg:flex flex-col min-h-0 bg-zinc-900/50 overflow-hidden
                       ${mobileTab === "preview" ? "flex" : "hidden lg:flex"}`}>
        {preview}
      </div>
    </main>
  );
}
