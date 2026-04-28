// frontend/src/api.js
/**
 * Flask API client — unified across all forms via /api/forms/<slug>/...
 *
 * Tüm fonksiyonlar `formType` (slug) parametresi ile çalışır:
 * "oturum", "pesel", "zap3", "zaw_fa", "konto_org", ...
 */

const API_BASE = "/api/forms";

function url(slug, path) {
  return `${API_BASE}/${slug}${path}`;
}

/**
 * Backend'den kayıtlı tüm formları listeler.
 * @returns {Promise<{forms: Array<{slug,title,description,icon,total_pages,total_fields}>}>}
 */
export async function listForms() {
  const res = await fetch(`${API_BASE}`);
  if (!res.ok) throw new Error("Form listesi alınamadı");
  return res.json();
}

/**
 * Form'un UI tanımını (ui_schema.json) getirir.
 * @param {string} slug
 */
export async function getUiSchema(slug) {
  const res = await fetch(url(slug, "/ui-schema"));
  if (!res.ok) throw new Error("UI şeması yüklenemedi");
  return res.json();
}

/**
 * Boş PDF şablonunu ArrayBuffer olarak getirir.
 * @param {string} slug
 */
export async function getTemplatePdf(slug) {
  const res = await fetch(url(slug, "/template-pdf"));
  if (!res.ok) throw new Error("PDF şablonu yüklenemedi");
  return res.arrayBuffer();
}

/**
 * Tüm field_map'i getirir (overlay için bbox'lar dahil).
 * @param {string} slug
 */
export async function getFieldMap(slug) {
  const res = await fetch(url(slug, "/field-map"));
  if (!res.ok) throw new Error("Alan haritası yüklenemedi");
  return res.json();
}

/**
 * Form verisini PDF olarak indirir.
 * @param {Object} data
 * @param {string} slug
 * @param {string} [downloadName]
 */
export async function generatePdf(data, slug, downloadName) {
  const res = await fetch(url(slug, "/generate-pdf"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Sunucu hatası: ${res.status}`);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;

  const today = new Date().toISOString().slice(0, 10);
  a.download = downloadName || `${slug}_${today}.pdf`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

/**
 * Belgeyi sunucuya gönderir, parse edip alan eşleştirmesini döndürür.
 * @param {File}   file
 * @param {string} slug
 */
export async function parseDocument(file, slug) {
  const formData = new FormData();
  formData.append("document", file);
  const res = await fetch(url(slug, "/parse-document"), {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Sunucu hatası: ${res.status}`);
  }
  return res.json();
}

/**
 * download_name şablonundaki tokenları doldurur:
 *   "{nazwisko}_{imie}_{date}.pdf" → "YILMAZ_MEHMET_2026-04-27.pdf"
 *
 * @param {string} template
 * @param {Object} data
 * @returns {string}
 */
export function formatDownloadName(template, data) {
  if (!template) return null;
  const today = new Date().toISOString().slice(0, 10);
  return template
    .replace(/\{date\}/g, today)
    .replace(/\{(\w+)\}/g, (_, key) => {
      const v = data[key];
      return v ? String(v).replace(/[^\w-]/g, "_") : "";
    })
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
