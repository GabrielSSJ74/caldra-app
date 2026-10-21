/**
 * imageImportService — entrada da pipeline CHAMFER VISION.
 * Só aceita formatos realmente suportados; PDF ainda não é implementado
 * e é recusado explicitamente (nunca simulado).
 *
 * Suporta arquivos locais e URIs provenientes de provedores de mídia compatíveis
 * (Google Fotos, Android Photo Picker `content://...`, documentos em nuvem),
 * preservando a resolução original e evitando cópias desnecessárias em memória.
 */

import {
  analyzeAlphaChannel,
  detectImageMimeFromBytes,
  isAcceptedImage,
  loadImage,
  rasterize,
  readAsDataUrl,
  readHeaderBytes,
} from "./imagePreprocessor";

const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB

export type ImportedImage = {
  name: string;
  dataUrl: string;
  element: HTMLImageElement;
  widthPx: number;
  heightPx: number;
  mimeType?: string;
  sizeBytes?: number;
  hasAlpha?: boolean;
  sourceUri?: string;
  /** Libera o Object URL temporário da memória quando a imagem é substituída ou descartada. */
  release?: () => void;
};

export type ImportImageOptions = {
  sourceUri?: string;
  preferObjectUrl?: boolean;
};

export async function importImage(
  file: File,
  options: ImportImageOptions = {},
): Promise<ImportedImage> {
  if (!file || typeof file.size !== "number" || file.size <= 0) {
    throw new Error("Arquivo vazio ou URI de mídia indisponível.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Imagem muito grande (máx. 50 MB). Escolha uma versão menor.");
  }

  let detectedMime: ReturnType<typeof detectImageMimeFromBytes> = null;
  try {
    const header = await readHeaderBytes(file, 16);
    detectedMime = detectImageMimeFromBytes(header);
  } catch {
    throw new Error("Não foi possível ler o arquivo ou o URI selecionado está indisponível.");
  }

  if (
    detectedMime === "application/pdf" ||
    /\.pdf$/i.test(file.name) ||
    file.type.toLowerCase() === "application/pdf"
  ) {
    throw new Error("PDF ainda não é suportado pelo CHAMFER VISION. Envie PNG, JPG ou WEBP.");
  }

  if (!isAcceptedImage(file, detectedMime)) {
    throw new Error("Formato não suportado. Use PNG, JPG, JPEG ou WEBP.");
  }

  const effectiveMime =
    detectedMime ||
    (file.type && file.type.startsWith("image/") ? file.type.toLowerCase() : "image/png");

  let objectUrl: string | null = null;
  let dataUrl = "";
  let element: HTMLImageElement | null = null;

  const canUseObjectUrl =
    options.preferObjectUrl !== false &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function";

  if (canUseObjectUrl) {
    try {
      objectUrl = URL.createObjectURL(file);
      element = await loadImage(objectUrl);
      dataUrl = objectUrl;
    } catch {
      if (objectUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(objectUrl);
      }
      objectUrl = null;
      element = null;
    }
  }

  if (!element) {
    dataUrl = await readAsDataUrl(file);
    element = await loadImage(dataUrl);
  }

  const widthPx = element.naturalWidth || element.width;
  const heightPx = element.naturalHeight || element.height;

  if (!widthPx || !heightPx || widthPx <= 0 || heightPx <= 0) {
    if (objectUrl && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(objectUrl);
    }
    throw new Error("Imagem inválida ou com dimensões ilegíveis.");
  }

  let hasAlpha = false;
  if (effectiveMime === "image/png" || effectiveMime === "image/webp") {
    try {
      const sample = rasterize(element, { maxSize: 256 });
      hasAlpha = analyzeAlphaChannel(sample.pixels).hasAlpha;
    } catch {
      hasAlpha = false;
    }
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (objectUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        /* ignorado */
      }
    }
  };

  return {
    name: file.name || "imagem-vision",
    dataUrl,
    element,
    widthPx,
    heightPx,
    mimeType: effectiveMime,
    sizeBytes: file.size,
    hasAlpha,
    sourceUri: options.sourceUri,
    release,
  };
}

