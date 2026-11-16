import { useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Foto-invoer met OCR op het apparaat (tesseract.js, lazy geladen vanaf CDN).
 * De foto blijft in het geheugen en wordt na de scan weggegooid: er wordt
 * niets opgeslagen of geüpload.
 *
 * mode "odo"     → leest de kilometerstand (langste plausibele cijferreeks)
 * mode "receipt" → leest liters/kWh, totaalbedrag en prijs per liter/kWh
 */

export type OcrOdoResult = { odo: string };
export type OcrReceiptResult = { amount: string | null; total: string | null; unitPrice: string | null };

const CDN_WORKER = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js";
const CDN_CORE = "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0";

/** Downscale naar max 1600px + grijstinten + contrast-uitrekking (helpt OCR). */
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
      let min = 255;
      let max = 0;
      for (let i = 0; i < px.length; i += 4) {
        const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
        px[i] = px[i + 1] = px[i + 2] = g;
        if (g < min) min = g;
        if (g > max) max = g;
      }
      const range = Math.max(1, max - min);
      for (let i = 0; i < px.length; i += 4) {
        const g = Math.round(((px[i] - min) / range) * 255);
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

function parseOdo(text: string): OcrOdoResult | null {
  // 84.213 / 84 213 / 84213 → 84213 (decimalen achter komma afsnijden)
  const norm = text.replace(/[.,](?=\d{1,2}(?!\d))/g, "").replace(/\s+/g, " ");
  const groups = norm.match(/\d{3,7}/g) ?? [];
  const cands = groups.map(Number).filter((n) => n >= 100 && n <= 2_000_000);
  if (!cands.length) return null;
  return { odo: String(Math.max(...cands)) };
}

function parseReceipt(text: string): OcrReceiptResult {
  const lines = text.split(/\n+/).map((l) => l.trim());
  const dot = (s: string) => s.replace(",", ".");
  let total: string | null = null;
  // 1) regel met TOTAAL/TE BETALEN/BETAALD + bedrag
  for (const l of lines) {
    if (/totaal|te betalen|betaald|eindbedrag|subtotaal/i.test(l)) {
      const m = l.match(/(\d{1,4}[.,]\d{2})\s*€?|€?\s*(\d{1,4}[.,]\d{2})/);
      const v = m?.[1] ?? m?.[2];
      if (v && !total) total = dot(v);
    }
  }
  // 2) anders: het grootste bedrag met 2 decimalen
  if (!total) {
    const amounts = (text.match(/\d{1,4}[.,]\d{2}/g) ?? []).map(dot).map(Number);
    if (amounts.length) total = String(Math.max(...amounts));
  }
  // liters/kWh: "36,52 L" / "12,4 kWh" / "36,52 LTR"
  const amountMatch =
    text.match(/(\d{1,3}[.,]\d{1,2})\s*(?:l\b|ltr|liters?|kwh)/i) ??
    text.match(/(?:liters?|l|kwh)\D{0,6}(\d{1,3}[.,]\d{1,2})/i);
  const amount = amountMatch ? dot(amountMatch[1]) : null;
  // prijs per eenheid: typisch 3 decimalen (1,899)
  const unitMatch = text.match(/(\d{1,2}[.,]\d{3})\s*(?:€|eur|\/\s*[lk])?/i);
  const unitPrice = unitMatch ? dot(unitMatch[1]) : null;
  return { amount, total, unitPrice };
}

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

export function PhotoScan({
  mode,
  isEv,
  onResult,
}: {
  mode: "odo" | "receipt";
  isEv: boolean;
  onResult: (r: OcrOdoResult | OcrReceiptResult) => void;
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
      const dataUrl = await preprocess(file);
      const text = await ocr(dataUrl, (p, s) => {
        setPct(p);
        setStatus(s);
      });
      const result = mode === "odo" ? parseOdo(text) : parseReceipt(text);
      if (!result) {
        setError("Geen waarde herkend. Probeer scherper/foto rechter, of vul handmatig in.");
      } else if (mode === "odo") {
        setFound(((result as OcrOdoResult).odo) + " km");
        onResult(result);
      } else {
        const r = result as OcrReceiptResult;
        const parts = [r.amount && (isEv ? `${r.amount} kWh` : `${r.amount} l`), r.total && `€ ${r.total}`, r.unitPrice && `${r.unitPrice}/l`]
          .filter(Boolean)
          .join(" · ");
        if (parts) {
          setFound(parts);
          onResult(r);
        } else {
          setError("Geen bedragen herkend. Vul handmatig in of probeer opnieuw.");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan mislukt");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const label = mode === "odo" ? "📷 km-stand scannen" : isEv ? "📷 bon scannen (kWh)" : "📷 bon scannen";

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
