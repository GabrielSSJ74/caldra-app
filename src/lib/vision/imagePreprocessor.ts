/**
 * imagePreprocessor — etapa 1 da pipeline CHAMFER VISION.
 *
 * Converte um arquivo de imagem em um buffer binário (preto/branco) pronto
 * para análise. Todos os cálculos aqui acontecem em PIXELS; a conversão para
 * milímetros ocorre apenas no geometryNormalizer.
 */

export type Binary = {
  /** 1 = tinta (geometria), 0 = fundo. */
  data: Uint8Array;
  width: number;
  height: number;
};

export type PreprocessOptions = {
  /** Rotação aplicada antes da análise, em graus (0/90/180/270 ou livre). */
  rotationDeg?: number;
  /** Recorte normalizado (0..1) sobre a imagem já rotacionada. */
  crop?: { x: number; y: number; w: number; h: number };
  /** Maior dimensão do buffer analisado (limita custo). */
  maxSize?: number;
  /** Inverte tinta/fundo quando o desenho é claro sobre fundo escuro. */
  invert?: boolean;
  /** Ampliação antes da binarização (modo LOGO: 2–4×). */
  upscale?: number;
  /** Raio do desfoque gaussiano aplicado antes do limiar (px). */
  blur?: number;
  /** Limiar manual 0–255; ausente = Otsu automático. */
  threshold?: number;
};


export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function isAcceptedImage(file: File) {
  return ACCEPTED_IMAGE_TYPES.includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    fr.readAsDataURL(file);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Imagem inválida ou corrompida."));
    img.src = src;
  });
}

/** Desenha a imagem aplicando rotação/recorte e devolve os pixels RGBA. */
export function rasterize(img: HTMLImageElement, opt: PreprocessOptions = {}) {
  const rot = ((opt.rotationDeg ?? 0) % 360 + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const rw = swap ? img.naturalHeight : img.naturalWidth;
  const rh = swap ? img.naturalWidth : img.naturalHeight;

  const crop = opt.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const cw = Math.max(1, Math.round(rw * crop.w));
  const ch = Math.max(1, Math.round(rh * crop.h));

  const max = opt.maxSize ?? 1400;
  const up = Math.max(1, Math.min(4, opt.upscale ?? 1));
  const scale = Math.min(up, (max * up) / Math.max(cw, ch));
  const W = Math.max(1, Math.round(cw * scale));
  const H = Math.max(1, Math.round(ch * scale));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponível neste dispositivo.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);


  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-rw * crop.x, -rh * crop.y);
  ctx.translate(rw / 2, rh / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.restore();

  return { ctx, width: W, height: H, pixels: ctx.getImageData(0, 0, W, H) };
}

/** Limiar automático de Otsu sobre o histograma de luminância. */
function otsu(hist: number[], total: number) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * (hist[i] ?? 0);
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t] ?? 0;
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * (hist[t] ?? 0);
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

/** Converte a imagem em máscara binária (1 = traço). */
export function binarize(image: ImageData, invert = false): Binary {
  const { width, height, data } = image;
  const gray = new Uint8Array(width * height);
  const hist = new Array<number>(256).fill(0);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const a = data[i + 3]! / 255;
    // pixels transparentes contam como fundo branco
    const r = data[i]! * a + 255 * (1 - a);
    const g = data[i + 1]! * a + 255 * (1 - a);
    const b = data[i + 2]! * a + 255 * (1 - a);
    const v = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    gray[p] = v;
    hist[v] = (hist[v] ?? 0) + 1;
  }
  const t = otsu(hist, width * height);
  const out = new Uint8Array(width * height);
  let ink = 0;
  for (let p = 0; p < out.length; p++) {
    const isInk = invert ? gray[p]! > t : gray[p]! <= t;
    out[p] = isInk ? 1 : 0;
    ink += out[p]!;
  }
  // desenho invertido (fundo escuro): se mais de 60% virou "tinta", inverte
  if (!invert && ink > out.length * 0.6) {
    for (let p = 0; p < out.length; p++) out[p] = out[p] ? 0 : 1;
  }
  return { data: out, width, height };
}

/** Remove pontos isolados (ruído sal e pimenta) por abertura morfológica leve. */
export function denoise(bin: Binary, strength = 1): Binary {
  if (strength <= 0) return bin;
  const { width: w, height: h } = bin;
  let src = bin.data;
  for (let pass = 0; pass < strength; pass++) {
    const out = new Uint8Array(src.length);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!src[i]) continue;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) if (!(dx === 0 && dy === 0)) n += src[i + dy * w + dx]!;
        out[i] = n >= 2 ? 1 : 0;
      }
    }
    src = out;
  }
  return { data: src, width: w, height: h };
}
