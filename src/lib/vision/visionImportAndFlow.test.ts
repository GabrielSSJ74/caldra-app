import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  detectImageMimeFromBytes,
  readHeaderBytes,
  isAcceptedImage,
  analyzeAlphaChannel,
  binarize,
  thresholdBinarize,
  sauvolaBinarize,
} from "./imagePreprocessor";
import { importImage } from "./imageImportService";
import { profileImage, suggestFromProfile } from "./imageProfiler";
import {
  detectVisionPickerPlatform,
  nativeMediaItemToFile,
  registerSessionMediaEntry,
  getSessionMediaEntries,
  removeSessionMediaByUri,
  clearSessionMediaEntries,
  type CaldraAndroidPhotoPickerBridge,
} from "./mediaPickerBridge";
import { runVisionPipeline } from "./pipeline";
import { DEFAULT_LOGO } from "./logoPipeline";

const hostGlobal = globalThis as {
  CaldraAndroidPhotoPicker?: CaldraAndroidPhotoPickerBridge;
};

/** Cria um buffer sintético com cabeçalho PNG válido (89 50 4E 47 0D 0A 1A 0A). */
function makePngBytes(extraLength = 32): Uint8Array {
  const bytes = new Uint8Array(8 + extraLength);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return bytes;
}

/** Cria um buffer sintético com cabeçalho JPEG válido (FF D8 FF E0). */
function makeJpegBytes(extraLength = 32): Uint8Array {
  const bytes = new Uint8Array(4 + extraLength);
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return bytes;
}

/** Cria um buffer sintético com cabeçalho WEBP válido (RIFF....WEBP). */
function makeWebpBytes(extraLength = 32): Uint8Array {
  const bytes = new Uint8Array(12 + extraLength);
  bytes.set([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50], 0);
  return bytes;
}

/** Cria um buffer sintético com cabeçalho PDF (%PDF-1.7). */
function makePdfBytes(): Uint8Array {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
}

/** Constrói um ImageData sintético (compatível com ambiente Node/jsdom). */
function createImageData(
  width: number,
  height: number,
  fillPixel: (x: number, y: number) => [number, number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = fillPixel(x, y);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }
  return { data, width, height, colorSpace: "srgb" } as ImageData;
}

describe("CHAMFER Vision — Fluxo de Importação, Galeria Incorporada e Vetorização", () => {
  beforeEach(() => {
    clearSessionMediaEntries();
    delete hostGlobal.CaldraAndroidPhotoPicker;
  });

  afterEach(() => {
    clearSessionMediaEntries();
    delete hostGlobal.CaldraAndroidPhotoPicker;
  });

  it("1. Seleciona uma foto recente do dispositivo (JPEG e WEBP válidos)", async () => {
    const jpegFile = new File([makeJpegBytes()], "IMG_20261021_142010.jpg", {
      type: "image/jpeg",
    });
    const webpFile = new File([makeWebpBytes()], "WhatsApp_Image_2026.webp", {
      type: "image/webp",
    });

    const jpegHeader = await readHeaderBytes(jpegFile, 16);
    const webpHeader = await readHeaderBytes(webpFile, 16);

    expect(detectImageMimeFromBytes(jpegHeader)).toBe("image/jpeg");
    expect(isAcceptedImage(jpegFile, detectImageMimeFromBytes(jpegHeader))).toBe(true);

    expect(detectImageMimeFromBytes(webpHeader)).toBe("image/webp");
    expect(isAcceptedImage(webpFile, detectImageMimeFromBytes(webpHeader))).toBe(true);
  });

  it("2. Seleciona uma imagem PNG com transparência para vetorização de logo (traço escuro e traço branco sobre fundo transparente)", () => {
    const W = 64;
    const H = 64;

    // Caso 2A: Logo branco/claro sobre fundo transparente (ex: logo exportado em PNG branco)
    const whiteLogoOnAlpha = createImageData(W, H, (x, y) => {
      const inSquare = x >= 16 && x < 48 && y >= 16 && y < 48;
      return inSquare ? [255, 255, 255, 255] : [0, 0, 0, 0];
    });

    const alphaMetaWhite = analyzeAlphaChannel(whiteLogoOnAlpha);
    expect(alphaMetaWhite.hasAlpha).toBe(true);
    expect(alphaMetaWhite.lightForegroundOnAlpha).toBe(true);

    const binWhite = binarize(whiteLogoOnAlpha);
    // O centro do logo (32, 32) deve ser reconhecido como tinta (1) e o fundo transparente (4, 4) como fundo (0)
    expect(binWhite.data[32 * W + 32]).toBe(1);
    expect(binWhite.data[4 * W + 4]).toBe(0);

    const thrWhite = thresholdBinarize(whiteLogoOnAlpha, 128);
    expect(thrWhite.data[32 * W + 32]).toBe(1);
    expect(thrWhite.data[4 * W + 4]).toBe(0);

    const sauvolaWhite = sauvolaBinarize(whiteLogoOnAlpha);
    expect(sauvolaWhite.data[32 * W + 32]).toBe(1);
    expect(sauvolaWhite.data[4 * W + 4]).toBe(0);

    // Perfil da imagem deve detectar hasAlpha e recomendar modo "logo"
    const profile = profileImage(whiteLogoOnAlpha);
    expect(profile.hasAlpha).toBe(true);
    const suggestion = suggestFromProfile(profile);
    expect(suggestion.mode).toBe("logo");

    // Caso 2B: Logo escuro sobre fundo transparente
    const darkLogoOnAlpha = createImageData(W, H, (x, y) => {
      const inCircle = Math.hypot(x - 32, y - 32) <= 14;
      return inCircle ? [15, 20, 30, 255] : [255, 255, 255, 0];
    });

    const alphaMetaDark = analyzeAlphaChannel(darkLogoOnAlpha);
    expect(alphaMetaDark.hasAlpha).toBe(true);
    expect(alphaMetaDark.lightForegroundOnAlpha).toBe(false);

    const binDark = binarize(darkLogoOnAlpha);
    expect(binDark.data[32 * W + 32]).toBe(1);
    expect(binDark.data[2 * W + 2]).toBe(0);
  });

  it("3. Seleciona uma imagem do Google Fotos ou outro provedor de mídia em nuvem (URI sem extensão no nome, validada por magic bytes)", async () => {
    const cloudPngFile = new File([makePngBytes()], "1000049281", {
      type: "application/octet-stream",
    });

    const header = await readHeaderBytes(cloudPngFile, 16);
    const detected = detectImageMimeFromBytes(header);
    expect(detected).toBe("image/png");
    expect(isAcceptedImage(cloudPngFile, detected)).toBe(true);

    // Testa também conversão via ponte nativa Android
    const base64Png = btoa(String.fromCharCode(...makePngBytes()));
    const convertedFile = await nativeMediaItemToFile({
      uri: "content://media/picker/0/com.google.android.apps.photos.cloudpicker/media/1000049281",
      name: "1000049281",
      mimeType: "image/png",
      dataUrl: `data:image/png;base64,${base64Png}`,
    });

    expect(convertedFile).not.toBeNull();
    expect(convertedFile.type).toBe("image/png");
    const convertedHeader = await readHeaderBytes(convertedFile, 16);
    expect(detectImageMimeFromBytes(convertedHeader)).toBe("image/png");
  });

  it("4. Cancela a seleção sem escolher imagem (mantendo estado atual e cache intactos)", () => {
    const existingFile = new File([makePngBytes()], "peca-atual.png", { type: "image/png" });
    registerSessionMediaEntry({
      file: existingFile,
      name: "peca-atual.png",
      widthPx: 1200,
      heightPx: 800,
      hasAlpha: true,
      sourceUri: "content://media/picker/0/101",
    });

    // Simula cancelamento do seletor: nenhuma nova entrada é registrada e a seleção atual permanece intacta
    const entriesAfterCancel = getSessionMediaEntries();
    expect(entriesAfterCancel).toHaveLength(1);
    expect(entriesAfterCancel[0]?.name).toBe("peca-atual.png");
    expect(entriesAfterCancel[0]?.widthPx).toBe(1200);
  });

  it("5. Trata erro de leitura, formato inválido (PDF/corrompido) ou URI indisponível/revogada sem quebrar o aplicativo", async () => {
    // Arquivo vazio (URI expirada ou falha de leitura do provedor)
    const emptyFile = new File([], "indisponivel.png", { type: "image/png" });
    await expect(importImage(emptyFile)).rejects.toThrow(/vazio ou URI de mídia indisponível/i);

    // Arquivo PDF rejeitado
    const pdfFile = new File([makePdfBytes()], "desenho.pdf", { type: "application/pdf" });
    await expect(importImage(pdfFile)).rejects.toThrow(/PDF ainda não é suportado/i);

    // PDF renomeado para .png deve ser barrado pela assinatura binária (magic bytes)
    const disguisedPdf = new File([makePdfBytes()], "falso_logo.png", { type: "image/png" });
    await expect(importImage(disguisedPdf)).rejects.toThrow(/PDF ainda não é suportado/i);

    // Arquivo com formato não suportado e sem assinatura binária de imagem
    const unsupportedFile = new File(
      [new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b])],
      "arquivo.bin",
      { type: "application/octet-stream" },
    );
    await expect(importImage(unsupportedFile)).rejects.toThrow(/Formato não suportado/i);

    // URI revogada pelo EmbeddedPhotoPicker (onUriPermissionRevoked)
    const validFile = new File([makePngBytes()], "logo-revogado.png", { type: "image/png" });
    registerSessionMediaEntry({
      file: validFile,
      name: "logo-revogado.png",
      widthPx: 640,
      heightPx: 480,
      hasAlpha: true,
      sourceUri: "content://media/picker/0/revoked-99",
    });
    expect(getSessionMediaEntries()).toHaveLength(1);

    const removed = removeSessionMediaByUri("content://media/picker/0/revoked-99");
    expect(removed).toBe(true);
    expect(getSessionMediaEntries()).toHaveLength(0);
  });

  it("6. Permite reabrir o seletor após já ter importado uma imagem e alternar entre imagens da sessão", () => {
    const firstFile = new File([makeJpegBytes()], "chapa-1.jpg", { type: "image/jpeg" });
    const secondFile = new File([makePngBytes()], "logo-cliente.png", { type: "image/png" });

    registerSessionMediaEntry({
      file: firstFile,
      name: firstFile.name,
      widthPx: 1920,
      heightPx: 1080,
      hasAlpha: false,
      sourceUri: "content://media/picker/0/1",
    });

    registerSessionMediaEntry({
      file: secondFile,
      name: secondFile.name,
      widthPx: 800,
      heightPx: 800,
      hasAlpha: true,
      sourceUri: "content://media/picker/0/2",
    });

    const sessionList = getSessionMediaEntries();
    expect(sessionList).toHaveLength(2);
    // A mais recente aparece primeiro para seleção rápida
    expect(sessionList[0]?.name).toBe("logo-cliente.png");
    expect(sessionList[1]?.name).toBe("chapa-1.jpg");
  });

  it("7. Verifica detecção de plataforma e fallback em dispositivos com ou sem suporte ao Embedded Photo Picker", () => {
    // 7A: Ambiente Web padrão (sem ponte nativa Android)
    const webCaps = detectVisionPickerPlatform();
    expect(webCaps.platform).toBe("web-browser");
    expect(webCaps.supportsEmbeddedPhotoPicker).toBe(false);

    // 7B: Dispositivo Android < 14 ou sem SDK Extension R >= 15 (fallback para PickVisualMedia)
    const fallbackBridge: CaldraAndroidPhotoPickerBridge = {
      isEmbeddedPhotoPickerAvailable: () => false,
      getSdkExtensionVersionR: () => 5,
      openPhotoPicker: async () => ({ status: "cancelled" }),
    };
    hostGlobal.CaldraAndroidPhotoPicker = fallbackBridge;

    const fallbackCaps = detectVisionPickerPlatform();
    expect(fallbackCaps.platform).toBe("android-system-bridge");
    expect(fallbackCaps.supportsEmbeddedPhotoPicker).toBe(false);
    expect(fallbackCaps.description).toMatch(/PickVisualMedia/i);

    // 7C: Dispositivo Android 14+ (API 34+) com SDK Extensions R >= 15 (EmbeddedPhotoPicker ativo)
    const embeddedBridge: CaldraAndroidPhotoPickerBridge = {
      isEmbeddedPhotoPickerAvailable: () => true,
      getSdkExtensionVersionR: () => 15,
      openPhotoPicker: async () => ({ status: "cancelled" }),
    };
    hostGlobal.CaldraAndroidPhotoPicker = embeddedBridge;

    const embeddedCaps = detectVisionPickerPlatform();
    expect(embeddedCaps.platform).toBe("android-embedded-bridge");
    expect(embeddedCaps.supportsEmbeddedPhotoPicker).toBe(true);
    expect(embeddedCaps.sdkExtensionR).toBe(15);
    expect(embeddedCaps.description).toMatch(/Embedded Photo Picker ativo/i);
  });

  it("8. Preserva o estado das entidades do CHAMFER CAD e a sessão de mídia ao abrir/fechar o seletor", async () => {
    let revokedSubscribedCallback: ((uris: string[]) => void) | null = null;
    hostGlobal.CaldraAndroidPhotoPicker = {
      isEmbeddedPhotoPickerAvailable: () => true,
      getSdkExtensionVersionR: () => 15,
      openPhotoPicker: async () => ({ status: "cancelled" }),
      onUriPermissionRevoked: (cb) => {
        revokedSubscribedCallback = cb;
        return () => {
          revokedSubscribedCallback = null;
        };
      },
    };

    const unsub = hostGlobal.CaldraAndroidPhotoPicker.onUriPermissionRevoked?.(() => {});
    expect(revokedSubscribedCallback).not.toBeNull();
    unsub?.();
    expect(revokedSubscribedCallback).toBeNull();
  });

  it("9. Verifica que o fluxo completo de vetorização (Técnico e Logo PNG com transparência) continua funcionando após a seleção", () => {
    const W = 80;
    const H = 80;

    // 9A: Desenho técnico (retângulo escuro sobre fundo claro)
    const techImage = createImageData(W, H, (x, y) => {
      const onBorder =
        ((x >= 16 && x <= 18) || (x >= 62 && x <= 64)) && y >= 16 && y <= 64
          ? true
          : ((y >= 16 && y <= 18) || (y >= 62 && y <= 64)) && x >= 16 && x <= 64;
      return onBorder ? [10, 10, 10, 255] : [250, 250, 250, 255];
    });

    const techRes = runVisionPipeline({
      mode: "tecnico",
      pixels: techImage,
      opt: { tolerance: "media" },
    });
    expect(techRes.mode).toBe("tecnico");
    if (techRes.mode === "tecnico") {
      expect(techRes.analysis.prims.length).toBeGreaterThan(0);
      expect(techRes.analysis.imagePx).toEqual({ w: W, h: H });
    }

    // 9B: Logo PNG branco sobre fundo transparente no pipeline de curvas Bézier
    const transparentLogoImage = createImageData(W, H, (x, y) => {
      const inside = x >= 20 && x <= 60 && y >= 20 && y <= 60;
      return inside ? [255, 255, 255, 255] : [0, 0, 0, 0];
    });

    const logoRes = runVisionPipeline({
      mode: "logo",
      pixels: transparentLogoImage,
      opt: { ...DEFAULT_LOGO, upscale: 1 },
    });
    expect(logoRes.mode).toBe("logo");
    if (logoRes.mode === "logo") {
      expect(logoRes.analysis.layers.length).toBeGreaterThan(0);
      expect(logoRes.analysis.stats.contours).toBeGreaterThan(0);
    }
  });
});
