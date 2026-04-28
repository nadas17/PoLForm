import { useState, useEffect } from "react";
import OturumFormApp from "./OturumFormApp.jsx";
import PeselFormApp from "./PeselFormApp.jsx";
import DynamicFormApp from "./DynamicFormApp.jsx";
import { listForms } from "./api.js";

const STORAGE_KEY = "activeForm";

/* ──────── Form ikonları (Lucide-style SVG'ler) ──────── */
const ICONS = {
  FileText: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <rect x="3" y="4" width="18" height="16" rx="2"/>
      <path d="M7 9h10M7 13h6M7 17h4"/>
    </svg>
  ),
  Hash: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <line x1="4" y1="9" x2="20" y2="9"/>
      <line x1="4" y1="15" x2="20" y2="15"/>
      <line x1="10" y1="3" x2="8" y2="21"/>
      <line x1="16" y1="3" x2="14" y2="21"/>
    </svg>
  ),
  MapPin: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  Shield: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  Building2: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
      <path d="M6 12H4a2 2 0 0 0-2 2v8h4"/>
      <path d="M18 9h2a2 2 0 0 1 2 2v11h-4"/>
      <path d="M10 6h4M10 10h4M10 14h4M10 18h4"/>
    </svg>
  ),
};

/* Slug → Tailwind renk şeması */
const ACCENT_BY_SLUG = {
  oturum:    { ring: "hover:border-emerald-500/40", glow: "hover:shadow-emerald-500/10",
               bgIcon: "bg-emerald-500/15 group-hover:bg-emerald-500/25", icon: "text-emerald-400",
               badge: "text-emerald-400/80 bg-emerald-500/10", arrow: "text-emerald-400/60 group-hover:text-emerald-300" },
  pesel:     { ring: "hover:border-blue-500/40",    glow: "hover:shadow-blue-500/10",
               bgIcon: "bg-blue-500/15 group-hover:bg-blue-500/25", icon: "text-blue-400",
               badge: "text-blue-400/80 bg-blue-500/10", arrow: "text-blue-400/60 group-hover:text-blue-300" },
  zap3:      { ring: "hover:border-purple-500/40",  glow: "hover:shadow-purple-500/10",
               bgIcon: "bg-purple-500/15 group-hover:bg-purple-500/25", icon: "text-purple-400",
               badge: "text-purple-400/80 bg-purple-500/10", arrow: "text-purple-400/60 group-hover:text-purple-300" },
  zaw_fa:    { ring: "hover:border-amber-500/40",   glow: "hover:shadow-amber-500/10",
               bgIcon: "bg-amber-500/15 group-hover:bg-amber-500/25", icon: "text-amber-400",
               badge: "text-amber-400/80 bg-amber-500/10", arrow: "text-amber-400/60 group-hover:text-amber-300" },
  konto_org: { ring: "hover:border-rose-500/40",    glow: "hover:shadow-rose-500/10",
               bgIcon: "bg-rose-500/15 group-hover:bg-rose-500/25", icon: "text-rose-400",
               badge: "text-rose-400/80 bg-rose-500/10", arrow: "text-rose-400/60 group-hover:text-rose-300" },
};
const DEFAULT_ACCENT = ACCENT_BY_SLUG.oturum;

function FormCard({ form, onClick }) {
  const accent = ACCENT_BY_SLUG[form.slug] || DEFAULT_ACCENT;
  const icon = ICONS[form.icon] || ICONS.FileText;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${form.title} formunu aç`}
      className={`group relative rounded-2xl p-5 sm:p-6 text-left focus-ring
                  glass border transition-all duration-300
                  hover:-translate-y-0.5 hover:shadow-lg
                  ${accent.ring} ${accent.glow}`}
    >
      <div className="relative">
        <div aria-hidden="true"
             className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors
                         ${accent.bgIcon} ${accent.icon}`}>
          {icon}
        </div>
        <h2 className="text-base sm:text-lg font-semibold text-zinc-50 mb-1 leading-snug">
          {form.title}
        </h2>
        <p className="text-xs sm:text-sm text-zinc-500 mb-4 leading-relaxed line-clamp-2">
          {form.description}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {form.total_pages > 0 && (
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${accent.badge}`}>
              {form.total_pages} sayfa
            </span>
          )}
          {form.total_fields > 0 && (
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${accent.badge}`}>
              {form.total_fields} alan
            </span>
          )}
          <span aria-hidden="true" className={`ml-auto transition-colors ${accent.arrow}`}>→</span>
        </div>
      </div>
    </button>
  );
}

export default function App() {
  const [activeForm, setActiveForm] = useState(() => {
    try { return sessionStorage.getItem(STORAGE_KEY) || null; }
    catch { return null; }
  });
  const [forms, setForms] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      if (activeForm) sessionStorage.setItem(STORAGE_KEY, activeForm);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, [activeForm]);

  // İlk yüklemede form listesini çek
  useEffect(() => {
    let cancelled = false;
    listForms()
      .then(({ forms }) => { if (!cancelled) setForms(forms); })
      .catch(err => { if (!cancelled) setError(err.message || "Form listesi alınamadı"); });
    return () => { cancelled = true; };
  }, []);

  const handleBack = () => setActiveForm(null);

  // Aktif form varsa onu render et
  if (activeForm) {
    if (activeForm === "oturum") return <OturumFormApp onBack={handleBack} />;
    if (activeForm === "pesel")  return <PeselFormApp onBack={handleBack} />;

    const meta = forms?.find(f => f.slug === activeForm);
    return <DynamicFormApp slug={activeForm} formMeta={meta} onBack={handleBack} />;
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 overflow-x-hidden">
      {/* Header */}
      <header className="flex-shrink-0 h-12 glass border-b border-white/[0.06]
                         flex items-center px-4 gap-3 z-30">
        <span aria-hidden="true"
              className="w-6 h-6 rounded bg-gradient-to-br from-emerald-500 to-blue-500
                         flex items-center justify-center text-white text-xs font-bold leading-none flex-shrink-0">F</span>
        <span className="text-sm font-semibold text-zinc-50">Form Doldurma Aracı</span>
        <span className="hidden sm:inline text-xs text-zinc-500">— Polonya başvuru formları</span>
      </header>

      {/* Landing */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        <div className="text-center mb-10 max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-50 mb-2">
            Hangi formu dolduracaksınız?
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Belgelerinizi yükleyin, AI otomatik olarak alanları çıkarsın.
            Türkçeden Lehçeye çeviri ve PDF doldurma desteği dâhil.
          </p>
        </div>

        {/* Form listesi — backend'den dinamik */}
        {error && (
          <div role="alert" className="mb-6 max-w-md text-center text-sm text-red-400 glass-elevated rounded-lg p-4">
            <span className="font-medium">Hata:</span> {error}
            <p className="text-xs text-zinc-500 mt-1">Backend (port 5002) çalışıyor mu?</p>
          </div>
        )}

        {!forms && !error && (
          <div role="status" aria-live="polite"
               className="flex items-center gap-3 text-sm text-zinc-400">
            <div aria-hidden="true"
                 className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
            Formlar yükleniyor…
          </div>
        )}

        {forms && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 w-full max-w-5xl">
            {forms.map(f => (
              <FormCard key={f.slug} form={f} onClick={() => setActiveForm(f.slug)} />
            ))}
          </div>
        )}

        {/* Alt bilgi şeridi */}
        <div className="mt-10 flex items-center gap-6 text-[11px] text-zinc-500 flex-wrap justify-center">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            AI tabanlı belge ayrıştırma
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            TR → PL otomatik çeviri
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            Canlı PDF önizleme
          </span>
        </div>
      </main>
    </div>
  );
}
