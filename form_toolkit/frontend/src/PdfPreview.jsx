// frontend/src/PdfPreview.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import * as pdfjs from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { getTemplatePdf, getFieldMap } from "./api.js";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

/* ─── Overlay hesaplama ─── */
function buildOverlayItems(fieldMap, data, familyData, scale) {
  if (!fieldMap || !data || scale <= 0) return [];

  const FAMILY_COLS = ["name", "sex", "dob", "kinship", "citizenship", "residence", "temp_permit", "dependent"];
  const flatData = { ...data };
  if (familyData) {
    familyData.forEach((row, i) => {
      FAMILY_COLS.forEach((col) => {
        if (row[col]) flatData[`family_${i + 1}_${col}`] = row[col];
      });
    });
  }

  for (const [prefix, rows] of [["p3a", 6], ["p5b", 4]]) {
    for (let i = 1; i <= rows; i++) {
      const period = (flatData[`${prefix}_r${i}_period`] || "").trim();
      const basis  = (flatData[`${prefix}_r${i}_basis`]  || "").trim();
      if (period || basis) {
        flatData[`${prefix}_r${i}`] = period && basis ? `${period}  ${basis}` : (period || basis);
      }
    }
  }

  const items = [];

  for (const field of fieldMap.form_fields) {
    const fid = field.field_id;
    const value = flatData[fid];
    if (value === undefined || value === null || value === "" || value === false) continue;

    const ftype = field.field_type;
    const [x0, y0, x1, y1] = field.bbox;

    if (ftype === "checkbox") {
      if (value === true || String(value).toLowerCase() === "true" || value === "X" || value === "1") {
        const cx = ((x0 + x1) / 2) * scale;
        const cy = ((y0 + y1) / 2) * scale;
        const size = Math.min((y1 - y0), (x1 - x0)) * scale;
        const fs = Math.max(6, size * 0.65);
        items.push({
          key: fid,
          left: cx - fs * 0.3,
          top:  cy - fs * 0.7,
          text: "X",
          fontSize: fs,
          color: "#1e3a8a",
          type: "checkbox",
        });
      }
    } else if (ftype === "char_boxes" || ftype === "date_boxes" || ftype === "card_boxes") {
      const text = String(value).toUpperCase();
      const cellBboxes = field.cell_bboxes;

      if (cellBboxes && cellBboxes.length > 0) {
        for (let i = 0; i < Math.min(text.length, cellBboxes.length); i++) {
          const ch = text[i];
          if (ch === " ") continue;
          const [cx0, cy0, cx1, cy1] = cellBboxes[i];
          const cellW = (cx1 - cx0) * scale;
          const cellH = (cy1 - cy0) * scale;
          const fs = Math.max(4, Math.min(10, cellH * 0.65, cellW * 0.85));
          items.push({
            key: `${fid}_${i}`,
            left: ((cx0 + cx1) / 2) * scale - fs * 0.3,
            top:  ((cy0 + cy1) / 2) * scale - fs * 0.8,
            text: ch,
            fontSize: fs,
            color: "#1e3a8a",
            type: "char",
          });
        }
      } else if (field.num_cells > 0) {
        const numCells = field.num_cells;
        const cellW = (x1 - x0) / numCells;
        for (let i = 0; i < Math.min(text.length, numCells); i++) {
          const ch = text[i];
          if (ch === " ") continue;
          const cx = (x0 + i * cellW + cellW / 2) * scale;
          const cy = ((y0 + y1) / 2) * scale;
          const cellH = (y1 - y0) * scale;
          const cellWpx = cellW * scale;
          const fs = Math.max(4, Math.min(10, cellH * 0.65, cellWpx * 0.85));
          items.push({
            key: `${fid}_${i}`,
            left: cx - fs * 0.3,
            top:  cy - fs * 0.8,
            text: ch,
            fontSize: fs,
            color: "#1e3a8a",
            type: "char",
          });
        }
      }
    } else if (ftype === "table_cell" || ftype === "signature_box") {
      const text = String(value);
      if (!text) continue;
      const boxW = (x1 - x0) * scale;
      const boxH = (y1 - y0) * scale;
      const fs = Math.max(3.5, Math.min(8, boxH * 0.55, boxW / (text.length * 0.52 || 1)));
      items.push({
        key: fid,
        left: x0 * scale + 1,
        top:  ((y0 + y1) / 2) * scale - fs * 0.8,
        text: text,
        fontSize: fs,
        color: "#1e40af",
        type: "table",
      });
    }
  }

  return items;
}

/* ─── Ana bileşen ─── */
const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export default function PdfPreview({ data, familyData, formType }) {
  const [pdfDoc, setPdfDoc]       = useState(null);
  const [fieldMap, setFieldMap]   = useState(null);
  const [currentPage, setPage]    = useState(1);
  const [totalPages, setTotal]    = useState(formType === "pesel" ? 4 : 8);
  const [scale, setScale]         = useState(1);
  const [zoomMul, setZoomMul]     = useState(1.0); // kullanıcı zoom çarpanı
  const [overlayItems, setOverlay] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [pageInput, setPageInput] = useState("");

  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const scrollRef    = useRef(null);
  const renderTask   = useRef(null);

  /* İlk yükleme: PDF + field_map */
  useEffect(() => {
    let cancelled = false;
    let loadingTask = null;
    setLoading(true);
    setError(null);

    Promise.all([getTemplatePdf(formType), getFieldMap(formType)])
      .then(([arrayBuffer, fm]) => {
        if (cancelled) return;
        setFieldMap(fm);
        setTotal(fm.meta?.total_pages ?? 8);
        loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        return loadingTask.promise;
      })
      .then((doc) => {
        if (cancelled || !doc) return;
        setPdfDoc(doc);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "PDF yüklenemedi");
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (loadingTask) loadingTask.destroy();
    };
  }, [formType]);

  /* Sayfa render */
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

    if (renderTask.current) {
      renderTask.current.cancel();
      renderTask.current = null;
    }

    let cancelled = false;

    pdfDoc.getPage(currentPage).then((page) => {
      if (cancelled) return;
      if (!canvasRef.current || !containerRef.current) return;

      const containerW = scrollRef.current
        ? Math.max(200, scrollRef.current.clientWidth - 32)
        : 400;
      const pdfW = page.getViewport({ scale: 1 }).width;
      const autoScale = (containerW / pdfW) * zoomMul;

      const viewport = page.getViewport({ scale: autoScale });
      const canvas = canvasRef.current;
      canvas.width  = viewport.width;
      canvas.height = viewport.height;

      setScale(autoScale);

      const ctx = canvas.getContext("2d");
      const task = page.render({ canvasContext: ctx, viewport });
      renderTask.current = task;

      task.promise.then(() => { renderTask.current = null; }).catch(() => {});
    });

    return () => {
      cancelled = true;
      if (renderTask.current) {
        renderTask.current.cancel();
        renderTask.current = null;
      }
    };
  }, [pdfDoc, currentPage, zoomMul]);

  /* Overlay güncelle */
  useEffect(() => {
    if (!fieldMap || scale <= 0) return;
    const pageFields = {
      ...fieldMap,
      form_fields: fieldMap.form_fields.filter((f) => f.page === currentPage),
    };
    setOverlay(buildOverlayItems(pageFields, data, familyData, scale));
  }, [data, familyData, fieldMap, currentPage, scale]);

  /* Pencere yeniden boyutlandırılınca render güncelle */
  useEffect(() => {
    let timer = null;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setZoomMul((z) => z * 1.0001), 150); // re-render tetikle
    };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); clearTimeout(timer); };
  }, []);

  /* Klavye kısayolları — sol/sağ ok ile sayfa */
  useEffect(() => {
    const onKey = (e) => {
      // Form alanlarında girdi alırken etkin olmasın
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "ArrowLeft")  setPage((p) => Math.max(1, p - 1));
      if (e.key === "ArrowRight") setPage((p) => Math.min(totalPages, p + 1));
      if (e.key === "+" || e.key === "=") setZoomMul((z) => clampZoom(z + 0.25));
      if (e.key === "-")                  setZoomMul((z) => clampZoom(z - 0.25));
      if (e.key === "0")                  setZoomMul(1.0);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [totalPages]);

  const clampZoom = (z) => Math.max(0.5, Math.min(2.5, Math.round(z * 100) / 100));

  const prevPage = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const nextPage = useCallback(() => setPage((p) => Math.min(totalPages, p + 1)), [totalPages]);
  const zoomIn   = useCallback(() => setZoomMul((z) => clampZoom(z + 0.25)), []);
  const zoomOut  = useCallback(() => setZoomMul((z) => clampZoom(z - 0.25)), []);
  const zoomReset = useCallback(() => setZoomMul(1.0), []);

  const handlePageJump = (e) => {
    e.preventDefault();
    const n = parseInt(pageInput, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      setPage(n);
    }
    setPageInput("");
  };

  return (
    <div className="flex flex-col h-full" aria-label="PDF önizleme paneli">
      {/* Üst bar — sayfa & zoom kontrolleri */}
      <div className="flex-shrink-0 h-9 glass border-b border-white/[0.06]
                      flex items-center justify-between px-2 sm:px-3 gap-2">
        <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide hidden sm:inline">
          Önizleme
        </span>

        <div className="flex items-center gap-1">
          <button onClick={prevPage} disabled={currentPage <= 1}
            type="button"
            aria-label="Önceki sayfa"
            className="w-6 h-6 flex items-center justify-center rounded-md text-zinc-400
                       hover:text-zinc-100 hover:bg-white/[0.08]
                       disabled:opacity-25 disabled:cursor-not-allowed
                       transition-colors text-sm focus-ring">
            <span aria-hidden="true">‹</span>
          </button>

          <form onSubmit={handlePageJump} className="flex items-center">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pageInput || currentPage}
              aria-label={`Sayfa numarası, toplam ${totalPages}`}
              onFocus={() => setPageInput(String(currentPage))}
              onBlur={() => setPageInput("")}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
              className="w-7 h-6 bg-white/[0.04] border border-white/[0.06] rounded-md
                         text-[11px] text-zinc-100 text-center font-mono tabular-nums
                         focus:bg-white/[0.08] focus:border-white/15 outline-none transition-colors"
            />
          </form>
          <span className="text-[11px] text-zinc-500 tabular-nums font-mono">
            / {totalPages}
          </span>

          <button onClick={nextPage} disabled={currentPage >= totalPages}
            type="button"
            aria-label="Sonraki sayfa"
            className="w-6 h-6 flex items-center justify-center rounded-md text-zinc-400
                       hover:text-zinc-100 hover:bg-white/[0.08]
                       disabled:opacity-25 disabled:cursor-not-allowed
                       transition-colors text-sm focus-ring">
            <span aria-hidden="true">›</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={zoomOut} disabled={zoomMul <= 0.5}
            type="button" aria-label="Uzaklaştır"
            className="w-6 h-6 flex items-center justify-center rounded-md text-zinc-400
                       hover:text-zinc-100 hover:bg-white/[0.08]
                       disabled:opacity-25 disabled:cursor-not-allowed transition-colors focus-ring">
            <span aria-hidden="true" className="text-base leading-none">−</span>
          </button>
          <button onClick={zoomReset}
            type="button" aria-label="Yakınlaştırmayı sıfırla"
            title="Klavye: 0"
            className="text-[10px] text-zinc-300 px-1.5 h-6 rounded-md tabular-nums font-mono
                       hover:bg-white/[0.08] transition-colors focus-ring min-w-[42px]">
            {Math.round(zoomMul * 100)}%
          </button>
          <button onClick={zoomIn} disabled={zoomMul >= 2.5}
            type="button" aria-label="Yakınlaştır"
            className="w-6 h-6 flex items-center justify-center rounded-md text-zinc-400
                       hover:text-zinc-100 hover:bg-white/[0.08]
                       disabled:opacity-25 disabled:cursor-not-allowed transition-colors focus-ring">
            <span aria-hidden="true" className="text-base leading-none">+</span>
          </button>
        </div>
      </div>

      {/* Canvas alanı */}
      <div ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto pdf-scroll flex flex-col items-center
                   bg-transparent py-4 gap-4">
        {loading && (
          <div className="flex flex-col items-center justify-center h-40 text-sm text-zinc-400 gap-3"
               role="status" aria-live="polite">
            <div aria-hidden="true"
                 className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
            <span>PDF yükleniyor…</span>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center h-40 text-sm text-red-400 px-4 text-center gap-2"
               role="alert">
            <span aria-hidden="true" className="text-2xl">⚠</span>
            <span>{error}</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-xs text-zinc-300 underline hover:text-zinc-100">
              Sayfayı yenile
            </button>
          </div>
        )}
        {!loading && !error && (
          <div ref={containerRef} className="relative shadow-2xl shadow-black/60 flex-shrink-0">
            <canvas ref={canvasRef} className="block" aria-label={`PDF sayfa ${currentPage}`} />
            <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
              {overlayItems.map((item) => (
                <span
                  key={item.key}
                  style={{
                    position: "absolute",
                    left: item.left,
                    top: item.top,
                    fontSize: item.fontSize,
                    color: item.color,
                    fontFamily: "Helvetica, Arial, sans-serif",
                    fontWeight: "600",
                    whiteSpace: "nowrap",
                    lineHeight: 1,
                  }}
                >
                  {item.text}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
