import { useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Foto-invoer met OCR op het apparaat (tesseract.js, lazy geladen vanaf CDN).
 * De foto blijft in het geheugen en wordt na de scan weggegooid: er wordt
 * niets opgeslagen of geüpload.
 *
 * Elke foto wordt in twee varianten verwerkt (Otsu-gebinariseerd en
 * grijscontrast) en beide OCR-passes worden geparseerd en samengevoegd;
 * de pass met de beste kruiscontrole (liters x prijs = bedrag) wint.
 *
 * mode "odo"  → kilometerstand (cijferreeks, voorkeur voor "… km")
 * mode "pump" → pompdisplay: Bedrag € / Liters / Prijs € per liter
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

/* ---------- preprocessing: downscale + grijs + 2 varianten ---------- */

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

/** Levert twee dataURLs: Otsu-gebinariseerd en grijs met contrast-uitrekking. */
function preprocess(file: File): Promise<{ bin: string; gray: string }> {
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
      // grijstinten
      for (let i = 0; i < px.length; i += 4) {
        const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
        px[i] = px[i + 1] = px[i + 2] = g;
      }
      // variant 1: grijs + contrast-uitrekking
      let min = 255;
      let max = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] < min) min = px[i];
        if (px[i] > max) max = px[i];
      }
      const range = Math.max(1, max - min);
      const grayPx = new Uint8ClampedArray(px);
      for (let i = 0; i < grayPx.length; i += 4) {
        const g = Math.round(((grayPx[i] - min) / range) * 255);
        grayPx[i] = grayPx[i + 1] = grayPx[i + 2] = g;
      }
      ctx.putImageData(new ImageData(grayPx, w, h), 0, 0);
      const gray = canvas.toDataURL("image/jpeg", 0.9);
      // variant 2: Otsu-binarisatie op dezelfde grijswaarden
      const t = otsu(px);
      for (let i = 0; i < px.length; i += 4) {
        const g = px[i] > t ? 255 : 0;
        px[i] = px[i + 1] = px[i + 2] = g;
      }
      ctx.putImageData(data, 0, 0);
      const bin = canvas.toDataURL("image/jpeg", 0.9);
      URL.revokeObjectURL(url);
      resolve({ bin, gray });
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

type PumpParse = { amount: string | null; total: string | null; unitPrice: string | null };

/**
 * Pompdisplay (TOKHEIM e.d.): regels "Bedrag €: 19.52", "Liters: 9.21",
 * "Prijs €: 2.119". Eerst label-gebaseerd, dan globale fallbacks; een
 * 2-decimalen-getal op een "Prijs"-regel wordt niet als totaal genomen.
 * Daarna kruiscontrole liters x prijs ≈ bedrag en de ontbrekende waarde
 * afleiden.
 */
function parsePump(text: string): PumpParse {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  let total: string | null = null;
  let amount: string | null = null;
  let unitPrice: string | null = null;
  const priceLines = lines.filter((l) => /prijs/i.test(l));
  const onPriceLine = (s: string) => priceLines.some((l) => l.includes(s));

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
      const m3 = l.match(/\d{1,2}[.,]\d{3}/);
      const m2 = l.match(/\d{1,2}[.,]\d{2}/);
      if (m3) unitPrice = dot(m3[0]);
      else if (m2) unitPrice = dot(m2[0]);
    }
  }
  // globale fallbacks
  if (total == null) {
    const m = text.match(/(?:€|eur)\s*(\d{1,5})[.,](\d{2})/i) ?? text.match(/\b(\d{1,5}[.,]\d{2})\b/);
    const v = m ? dot(m[1] ?? m[0]) : null;
    if (v != null && !onPriceLine(v)) total = v;
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
  return finishPump({ amount, total, unitPrice });
}

function pumpNums(p: PumpParse) {
  return {
    a: p.amount != null ? Number(p.amount) : null,
    t: p.total != null ? Number(p.total) : null,
    u: p.unitPrice != null ? Number(p.unitPrice) : null,
  };
}

function finishPump(p: PumpParse): PumpParse {
  const nums = pumpNums(p);
  let a = nums.a;
  const t = nums.t;
  const u = nums.u;
  if (a != null && u != null && t != null && Math.abs(a * u - t) > Math.max(0.05, t * 0.05)) {
    // inconsistent: bedrag is meestal het betrouwbaarst, leid liters opnieuw af
    a = t / u;
    p.amount = a.toFixed(2);
  } else {
    if (a == null && t != null && u != null) p.amount = (t / u).toFixed(2);
    if (t == null && a != null && u != null) p.total = (a * u).toFixed(2);
    if (u == null && a != null && t != null && a > 0) p.unitPrice = (t / a).toFixed(3);
  }
  return p;
}

/** |liters x prijs - bedrag| / bedrag; null als niet alle drie bekend. */
function pumpResidual(p: PumpParse): number | null {
  const { a, t, u } = pumpNums(p);
  if (a == null || t == null || u == null) return null;
  return Math.abs(a * u - t) / Math.max(0.01, t);
}

function pumpScore(p: PumpParse): number {
  let s = 0;
  if (p.amount) s++;
  if (p.total) s++;
  if (p.unitPrice) s++;
  const r = pumpResidual(p);
  if (r != null) s += r <= 0.05 ? 2 : -2;
  return s;
}

/** Vul ontbrekende velden aan uit een andere pass, alleen als consistent. */
function mergePump(best: PumpParse, other: PumpParse): PumpParse {
  const out = { ...best };
  const { a, t, u } = pumpNums(out);
  const ok = (x: number, ref: number) => Math.abs(x - ref) <= Math.max(0.05, Math.abs(ref) * 0.06);
  if (out.amount == null && other.amount != null) {
    const v = Number(other.amount);
    if (t == null || u == null || ok(v * u, t as number)) out.amount = other.amount;
  }
  if (out.total == null && other.total != null) {
    const v = Number(other.total);
    if (a == null || u == null || ok(a * u, v)) out.total = other.total;
  }
  if (out.unitPrice == null && other.unitPrice != null) {
    const v = Number(other.unitPrice);
    if (a == null || t == null || ok(a * v, t as number)) out.unitPrice = other.unitPrice;
  }
  return out;
}

/** Kies de beste parse en vul aan uit de rest. */
function pickPump(texts: string[]): PumpParse {
  const parses = texts.map(parsePump);
  const ranked = parses
    .map((p, i) => ({ i, s: pumpScore(p), r: pumpResidual(p) ?? 99 }))
    .sort((x, y) => y.s - x.s || x.r - y.r);
  let merged = parses[ranked[0].i];
  for (const j of ranked.slice(1)) merged = mergePump(merged, parses[j.i]);
  return merged;
}

/* ---------- OCR ---------- */

async function ocrAll(dataUrls: string[], onProgress: (pct: number, msg: string) => void): Promise<string[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("nld", 1, {
    workerPath: CDN_WORKER,
    corePath: CDN_CORE,
    logger: (m: { status?: string; progress?: number }) => {
      if (m.progress != null) onProgress(Math.round(m.progress * 100), m.status ?? "");
    },
  });
  try {
    const texts: string[] = [];
    for (const url of dataUrls) {
      const { data } = await worker.recognize(url);
      texts.push(data.text);
    }
    return texts;
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
  const [rawText, setRawText] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setFound(null);
    setRawText(null);
    setPct(0);
    try {
      const [{ bin, gray }, date] = await Promise.all([preprocess(file), photoDate(file)]);
      const texts = await ocrAll([bin, gray], (p, s) => {
        setPct(Math.round(p / 2));
        setStatus(s);
      });
      setRawText(texts.map((t) => t.trim()).filter(Boolean).join("\n---\n"));
      if (mode === "odo") {
        // voorkeur voor de binariseer-pass, dan de grijs-pass
        const r = parseOdo(texts[0]) ?? parseOdo(texts[1]);
        if (r) {
          setFound(`${r.odo} km${date ? ` · ${date}` : ""}`);
          onResult({ ...r, date });
        } else {
          setError("Geen kilometerstand herkend. Probeer de foto scherper en rechter, of vul handmatig in.");
        }
      } else {
        const r = pickPump(texts);
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
      {rawText && !busy && (
        <details className="text-[10px] text-slate-400 w-full">
          <summary className="cursor-pointer select-none">ruwe OCR-tekst (diagnose)</summary>
          <pre className="whitespace-pre-wrap mt-1 max-w-md">{rawText.slice(0, 500)}</pre>
        </details>
      )}
    </span>
  );
}
