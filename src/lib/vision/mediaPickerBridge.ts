/**
 * mediaPickerBridge — auditoria de plataforma, integração com o Android
 * Embedded Photo Picker (Jetpack `androidx.photopicker:photopicker-compose`)
 * quando executado em contêiner nativo Android compatível (API 34+ e
 * SDK Extensions R >= 15), fallback para o Photo Picker convencional do
 * Android / navegador Web e cache de mídia da sessão ativa.
 *
 * IMPORTANTE:
 * - Em ambiente puramente Web (React no navegador), NÃO simula uma galeria
 *   falsa nem alega acesso irrestrito às fotos do dispositivo. Usa o seletor
 *   de mídia autorizado pelo navegador mantendo o contexto do CHAMFER CAD.
 * - Quando empacotado em contêiner Android nativo com a ponte
 *   `window.CaldraAndroidPhotoPicker`, delega ao `EmbeddedPhotoPicker` oficial.
 */

export type VisionPickerPlatform =
  | "android-embedded-bridge"
  | "android-system-bridge"
  | "web-browser";

export type EmbeddedPickerPanelState = "peek" | "expanded" | "hidden";

export type NativePickedMediaItem = {
  /** URI concedido pelo seletor nativo (ex.: content://media/picker/...). */
  uri: string;
  /** Nome amigável do arquivo, quando disponível no ContentResolver. */
  name?: string;
  /** MIME type reportado pelo ContentResolver (image/png, image/jpeg, image/webp). */
  mimeType?: string;
  /** Bytes codificados em base64 ou Object URL entregue pela ponte do WebView. */
  dataUrl?: string;
  /** Tamanho em bytes. */
  sizeBytes?: number;
};

export type NativePickedMediaResult =
  | { status: "selected"; items: NativePickedMediaItem[] }
  | { status: "cancelled" }
  | { status: "error"; message: string };

/**
 * Contrato oficial para integração entre o WebView/contêiner Android nativo
 * e o módulo CHAMFER Vision usando `androidx.photopicker:photopicker-compose`.
 */
export interface CaldraAndroidPhotoPickerBridge {
  /**
   * Retorna true somente se o dispositivo suportar o Embedded Photo Picker:
   * Android 14+ (API 34+) e `SdkExtensions.getExtensionVersion(Build.VERSION_CODES.R) >= 15`.
   */
  isEmbeddedPhotoPickerAvailable: () => boolean;
  /**
   * Retorna a versão da extensão R do SDK Android, se disponível.
   */
  getSdkExtensionVersionR?: () => number;
  /**
   * Abre o seletor incorporado (`EmbeddedPhotoPicker`) dentro do painel do Vision
   * ou usa `ActivityResultContracts.PickVisualMedia` como fallback em aparelhos
   * Android incompatíveis com a versão incorporada.
   */
  openPhotoPicker: (options: {
    mimeTypes: string[];
    maxItems?: number;
    preferEmbedded?: boolean;
    accentColorHex?: string;
    orderedSelection?: boolean;
  }) => Promise<NativePickedMediaResult>;
  /**
   * Alterna o estado do painel incorporado entre "peek" (fotos recentes) e "expanded".
   */
  setEmbeddedPanelState?: (state: EmbeddedPickerPanelState) => void;
  /**
   * Notifica quando o acesso a um URI é revogado pelo usuário no seletor incorporado
   * (`onUriPermissionRevoked`).
   */
  onUriPermissionRevoked?: (callback: (uris: string[]) => void) => () => void;
}

declare global {
  interface Window {
    CaldraAndroidPhotoPicker?: CaldraAndroidPhotoPickerBridge;
  }
}

export type PlatformCapabilities = {
  platform: VisionPickerPlatform;
  isAndroidUserAgent: boolean;
  hasNativeBridge: boolean;
  supportsEmbeddedPhotoPicker: boolean;
  sdkExtensionR: number | null;
  description: string;
};

/**
 * Audita a plataforma em tempo de execução sem presumir ambiente nativo.
 */
export function detectVisionPickerPlatform(): PlatformCapabilities {
  const host = (
    typeof window !== "undefined" ? window : globalThis
  ) as { CaldraAndroidPhotoPicker?: CaldraAndroidPhotoPickerBridge };
  const bridge = host.CaldraAndroidPhotoPicker;

  if (typeof window === "undefined" && !bridge) {
    return {
      platform: "web-browser",
      isAndroidUserAgent: false,
      hasNativeBridge: false,
      supportsEmbeddedPhotoPicker: false,
      sdkExtensionR: null,
      description: "Aplicação Web React (SSR / ambiente sem DOM)",
    };
  }

  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isAndroidUserAgent = /Android/i.test(ua);

  if (bridge && typeof bridge.openPhotoPicker === "function") {
    let embedded = false;
    let extR: number | null = null;
    try {
      embedded = Boolean(bridge.isEmbeddedPhotoPickerAvailable?.());
      extR = bridge.getSdkExtensionVersionR?.() ?? null;
    } catch {
      embedded = false;
    }

    if (embedded) {
      return {
        platform: "android-embedded-bridge",
        isAndroidUserAgent: true,
        hasNativeBridge: true,
        supportsEmbeddedPhotoPicker: true,
        sdkExtensionR: extR,
        description:
          "Android Embedded Photo Picker ativo (Jetpack Photopicker · API 34+ · Ext R ≥ 15)",
      };
    }

    return {
      platform: "android-system-bridge",
      isAndroidUserAgent: true,
      hasNativeBridge: true,
      supportsEmbeddedPhotoPicker: false,
      sdkExtensionR: extR,
      description:
        "Android Photo Picker convencional (PickVisualMedia fallback em dispositivo sem suporte ao modo incorporado)",
    };
  }

  return {
    platform: "web-browser",
    isAndroidUserAgent,
    hasNativeBridge: false,
    supportsEmbeddedPhotoPicker: false,
    sdkExtensionR: null,
    description: isAndroidUserAgent
      ? "Aplicação Web React em navegador Android — seleção via Photo Picker do navegador preservando o estado do CAD"
      : "Aplicação Web React — seleção direta de arquivos de mídia preservando o estado do CAD",
  };
}

/**
 * Converte um item retornado pela ponte nativa Android (`NativePickedMediaItem`)
 * em um objeto `File` validável pela pipeline `importImage` do CHAMFER Vision.
 */
export async function nativeMediaItemToFile(item: NativePickedMediaItem): Promise<File> {
  if (!item || (!item.dataUrl && !item.uri)) {
    throw new Error("URI de mídia indisponível ou permissão revogada.");
  }

  const rawName = item.name?.trim() || item.uri.split("/").pop() || "imagem-vision";
  const fallbackMime = item.mimeType || "image/png";

  if (item.dataUrl) {
    if (item.dataUrl.startsWith("data:")) {
      const commaIdx = item.dataUrl.indexOf(",");
      if (commaIdx < 0) {
        throw new Error("Dados de imagem da ponte nativa estão incompletos.");
      }
      const header = item.dataUrl.slice(0, commaIdx);
      const base64 = item.dataUrl.slice(commaIdx + 1);
      const mimeMatch = header.match(/^data:([^;]+);base64$/i);
      const mime = mimeMatch?.[1] || fallbackMime;
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return new File([bytes], rawName, { type: mime });
    }

    const res = await fetch(item.dataUrl);
    if (!res.ok) {
      throw new Error("Não foi possível ler o URI concedido pelo seletor.");
    }
    const blob = await res.blob();
    return new File([blob], rawName, { type: blob.type || fallbackMime });
  }

  // Caso o contêiner WebView intercepte esquemas customizados de content URI
  const res = await fetch(item.uri);
  if (!res.ok) {
    throw new Error("Não foi possível acessar o URI de mídia selecionado.");
  }
  const blob = await res.blob();
  return new File([blob], rawName, { type: blob.type || fallbackMime });
}

/* ============================================================================
 * CACHE LEVE DE IMAGENS IMPORTADAS NA SESSÃO ATUAL (SEM ACESSO FALSO AO DISPOSITIVO)
 * Permite reabrir rapidamente uma foto ou logo já selecionada na sessão atual
 * sem duplicar buffers pesados em memória.
 * ============================================================================ */

export type SessionMediaEntry = {
  id: string;
  name: string;
  file: File;
  widthPx: number;
  heightPx: number;
  hasAlpha: boolean;
  addedAt: number;
  sourceUri?: string;
};

const MAX_SESSION_ENTRIES = 6;
let sessionEntries: SessionMediaEntry[] = [];

export function getSessionMediaEntries(): readonly SessionMediaEntry[] {
  return sessionEntries;
}

export function registerSessionMediaEntry(entry: Omit<SessionMediaEntry, "id" | "addedAt">): SessionMediaEntry {
  const existingIdx = sessionEntries.findIndex(
    (e) =>
      (entry.sourceUri && e.sourceUri === entry.sourceUri) ||
      (e.name === entry.name && e.file.size === entry.file.size && e.widthPx === entry.widthPx),
  );
  const created: SessionMediaEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    addedAt: Date.now(),
  };

  if (existingIdx >= 0) {
    sessionEntries.splice(existingIdx, 1);
  }
  sessionEntries = [created, ...sessionEntries].slice(0, MAX_SESSION_ENTRIES);
  return created;
}

export function removeSessionMediaByUri(uri: string): boolean {
  const before = sessionEntries.length;
  sessionEntries = sessionEntries.filter((e) => e.sourceUri !== uri);
  return sessionEntries.length < before;
}

export function clearSessionMediaEntries(): void {
  sessionEntries = [];
}
