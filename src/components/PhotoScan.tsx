import { useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Foto-invoer met OCR op het apparaat (tesseract.js, lazy geladen vanaf CDN).
 * De foto blijft in het geheugen en wordt na de scan weggegooid: er wordt
 * niets opgeslagen of geüpload.
 *
 * mode "odo"  → leest de kilometerstand (cijferreeks, voorkeur voor "… km")
 * mode "pump" → leest pompdisplay: Bedrag € / Liters / Prijs € per liter
 *               (met kruiscontrole en afleiding van de ontbrekende waarde)
 *
 * De datum uit de foto (EXIF DateTimeOriginal, anders bestandsdatum) wordt
 * meegegeven zodat het formulier de datum kan overnemen.
 */

export type OcrOdoResult = { odo: string; date: string | null };
export type OcrPumpResult = { amount: string | null; total: string | null; unitPrice: string | null; date: string | null };

const CDN_WORKER = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js";
const CDN_CORE = "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0";

/* ---------- EXIF: DateTimeOriginal uit een JPEG-ArrayBuffer ---------- */

function exifDate(ab: ArrayBuffer): string | null {
  const view = new DataView(ab);
  if (view.byteLength < 12 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  let tiffStart = -1;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      offset++;
      continue;
    }
    const marker = view.getUint8(offset + 1);
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda) break; // start of scan: EXIF zit daarvoor
    const len = view.getUint16(offset + 2);
    if (
      marker === 0xe1 &&
      offset + 10 < view.byteLength &&
      view.getUint32(offset + 4) === 0x45786966 && // "Exif"
      view.getUint16(offset + 8) === 0x0000
    ) {
      tiffStart = offset + 10;
      break;
    }
    offset += 2 + len;
  }
  if (tiffStart < 0) return null;
  const le = view.getUint16(tiffStart) === 0x4949;
  const ifd0 = view.getUint32(tiffStart + 4, le);
  const n = view.getUint16(tiffStart + ifd0, le);
  const readStr = (vo: number, count: number) => {
    let s = "";
    for (let i = 0; i < count && vo + i < view.byteLength; i++) s += String.fromCharCode(view.getUint8(vo + i));
    return s.replace(/\0+$/, "");
  };
  for (let i = 0; i < n; i++) {
    const e = tiffStart + ifd0 + 2 + i * 12;
    const tag = view.getUint16(e, le);
    if (tag !== 0x9003 && tag !== 0x0132) continue; // DateTimeOriginal / DateTime
    const count = view.getUint32(e + 4, le);
    const vo = count > 4 ? tiffStart + view.getUint32(e + 8, le) : e + 8;
    const m = readStr(vo, count).match(/(\d{4}):(\d{2}):(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return null;
}

/** Probeer fotodatum: EXIF, anders de bestandsdatum van de camera-input. */
async function photoDate(file: File): Promise<string | null> {
  try {
    const ab = await file.arrayBuffer();
    const exif = exifDate(ab);
    if (exif) return exif;
  } catch {
    /* geen EXIF — val terug op lastModified */
  }
  if (file.lastModified) {
    const d = new Date(file.lastModified);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  return null;
}

/* ---------- preprocessing: downscale + grijstinten + Otsu-binarisatie ---------- */

/** Otsu-drempel (displays met backlight/reflectie lezen hierdoor veel beter). */
function otsu(gray: Uint8ClampedArray): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i += 4) hist[gray[i]]++;
  const total = gray.length / 4;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

function preprocess(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas niet beschikbaar"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
        px[i] = px[i + 1] = px[i + 2] = g;
      }
      const t = otsu(px);
      for (let i = 0; i < px.length; i += 4) {
        const g = px[i] > t ? 255 : 0;
        px[i] = px[i + 1] = px[i + 2] = g;
      }
      ctx.putImageData(data, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("foto kon niet gelezen worden"));
    };
    img.src = url;
  });
}

/* ---------- parsing ---------- */

const dot = (s: string) => s.replace(",", ".");

function parseOdo(text: string): OcrOdoResult | null {
  // 84.213 / 84 213 / 84213 → 84213; decimalen achter komma afsnijden
  const norm = text.replace(/[.,](?=\d{1,2}(?!\d))/g, "").replace(/\s+/g, " ");
  // voorkeur: reeks met "km" erachter (bijv. "5431 km")
  const kmMatch = norm.match(/(\d{3,7})\s*km/i);
  if (kmMatch) return { odo: kmMatch[1], date: null };
  const groups = norm.match(/\d{3,7}/g) ?? [];
  const cands = groups.map(Number).filter((n) => n >= 100 && n <= 2_000_000);
  if (!cands.length) return null;
  return { odo: String(Math.max(...cands)), date: null };
}

/**
 * Pompdisplay (TOKHEIM e.d.): regels "Bedrag €: 19.52", "Liters: 9.21",
 * "Prijs €: 2.119". Eerst label-gebaseerd, dan globale fallbacks, dan
 * kruiscontrole liters x prijs ≈ bedrag en de ontbrekende waarde afleiden.
 */
function parsePump(text: string): OcrPumpResult {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  let total: string | null = null;
  let amount: string | null = null;
  let unitPrice: string | null = null;

  for (const l of lines) {
    const low = l.toLowerCase();
    if (total == null && /bedrag|totaal|betaald/i.test(low)) {
      const m = l.match(/\d{1,5}[.,]\d{2}/);
      if (m) total = dot(m[0]);
    }
    if (amount == null && /liter|liters|ltr/i.test(low)) {
      const m = l.match(/\d{1,3}[.,]\d{1,2}/);
      if (m) amount = dot(m[0]);
    }
    if (unitPrice == null && /prijs|€\s*\/|eur\s*\/|\/\s*l(?!tr)/i.test(low)) {
      const m = l.match(/\d{1,2}[.,]\d{3}/);
      if (m) unitPrice = dot(m[0]);
    }
  }
  // globale fallbacks
  if (total == null) {
    const m = text.match(/(?:€|eur)\s*(\d{1,5})[.,](\d{2})/i) ?? text.match(/\b(\d{1,5}[.,]\d{2})\b/);
    if (m) total = dot(m[1] ?? m[0]);
  }
  if (amount == null) {
    const m =
      text.match(/\b(\d{1,3}[.,]\d{1,2})\s*(?:l\b|ltr|liters?|kwh)/i) ??
      text.match(/(?:liters?|l)\s*:?\s*(\d{1,3}[.,]\d{1,2})/i);
    if (m) amount = dot(m[1] ?? m[0]);
  }
  if (unitPrice == null) {
    const m = text.match(/\b(\d{1,2}[.,]\d{3})\b/);
    if (m) unitPrice = dot(m[1]);
  }

  // kruiscontrole + afleiding
  const a = amount != null ? Number(amount) : null;
  const t = total != null ? Number(total) : null;
  const p = unitPrice != null ? Number(unitPrice) : null;
  if (a != null && p != null && t != null && Math.abs(a * p - t) > Math.max(0.05, t * 0.05)) {
    // inconsistent: bedrag is meestal het betrouwbaarst, leid liters opnieuw af
    amount = (t / p).toFixed(2);
  } else {
    if (a == null && t != null && p != null) amount = (t / p).toFixed(2);
    if (t == null && a != null && p != null) total = (a * p).toFixed(2);
    if (p == null && a != null && t != null && a > 0) unitPrice = (t / a).toFixed(3);
  }
  return { amount, total, unitPrice, date: null };
}

/* ---------- OCR ---------- */

async function ocr(dataUrl: string, onProgress: (pct: number, msg: string) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("nld", 1, {
    workerPath: CDN_WORKER,
    corePath: CDN_CORE,
    logger: (m: { status?: string; progress?: number }) => {
      if (m.progress != null) onProgress(Math.round(m.progress * 100), m.status ?? "");
    },
  });
  try {
    const { data } = await worker.recognize(dataUrl);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/* ---------- component ---------- */

export function PhotoScan({
  mode,
  isEv,
  onResult,
}: {
  mode: "odo" | "pump";
  isEv: boolean;
  onResult: (r: OcrOdoResult | OcrPumpResult) => void;
}): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setFound(null);
    setPct(0);
    try {
      const [dataUrl, date] = await Promise.all([preprocess(file), photoDate(file)]);
      const text = await ocr(dataUrl, (p, s) => {
        setPct(p);
        setStatus(s);
      });
      if (mode === "odo") {
        const r = parseOdo(text);
        if (r) {
          setFound(`${r.odo} km${date ? ` · ${date}` : ""}`);
          onResult({ ...r, date });
        } else {
          setError("Geen kilometerstand herkend. Probeer de foto scherper en rechter, of vul handmatig in.");
        }
      } else {
        const r = parsePump(text);
        const parts = [
          r.amount && (isEv ? `${r.amount} kWh` : `${r.amount} l`),
          r.total && `€ ${r.total}`,
          r.unitPrice && `${r.unitPrice}/${isEv ? "kWh" : "l"}`,
          date && `datum ${date}`,
        ]
          .filter(Boolean)
          .join(" · ");
        if (parts) {
          setFound(parts);
          onResult({ ...r, date });
        } else {
          setError("Geen waarden herkend. Probeer de foto scherper en rechter, of vul handmatig in.");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan mislukt");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const label = mode === "odo" ? "📷 km-stand scannen" : isEv ? "📷 laadpaal scannen" : "📷 pompdisplay scannen";

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="border border-slate-300 bg-white text-xs px-2 py-1 rounded hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? `Scannen… ${pct}%` : label}
      </button>
      {busy && status && <span className="text-[10px] text-slate-400">{status}</span>}
      {found && !busy && <span className="text-xs text-green-700">✓ {found} overgenomen</span>}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </span>
  );
}
