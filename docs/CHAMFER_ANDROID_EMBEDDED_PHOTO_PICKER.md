# CALDRA — CHAMFER Vision: Auditoria de Plataforma e Integração do Embedded Photo Picker (Android)

## 1. Auditoria da Plataforma Atual

Após inspeção integral do repositório:

- **Plataforma Real Identificada:** Aplicação Web **React 19 + TypeScript + Vite / TanStack Start** (`package.json`), executável em navegador mobile/desktop ou empacotável em contêiner nativo Android (`WebView` / Capacitor / Android Host Activity).
- **Localização Original do Botão `Importar imagem`:** `/src/components/lab2d/VisionDialog.tsx`, acionado a partir do menu `VISION` no editor CAD `/src/components/lab2d/Lab2DEditor.tsx`.
- **Comportamento Anterior:** O botão utilizava um `<label>` com `<input type="file" accept="image/png,image/jpeg,image/webp">` condicional apenas quando `step === "importar"`, sem tratamento explícito de cancelamento do seletor, sem preservação de `RotateGate`/fullscreen em dispositivos móveis ao abrir o seletor do sistema, convertendo a imagem inteira para Base64 duplicado em memória (`FileReader.readAsDataURL`) e destruindo o canal alfa de logos PNG em `rasterize()` ao preencher o canvas com `#ffffff` antes de desenhar a imagem.
- **Limitação Real da Plataforma Web:** Em execução puramente no navegador web (sem contêiner nativo Android), o sandbox de segurança do navegador **não permite listar nem incorporar silenciosamente a galeria de fotos reais do dispositivo** sem autorização explícita do usuário via seletor de arquivos do sistema (`<input type="file">`) ou ponte nativa. Conforme especificado, **não foi criada nenhuma galeria simulada com fotos falsas**.

---

## 2. Arquitetura Implementada no Ambiente Existente + Ponte Nativa Android

1. **Ponte Híbrida para Contêiner Android (`src/lib/vision/mediaPickerBridge.ts`):**
   - Detecta em tempo de execução (`detectVisionPickerPlatform()`) se o CALDRA está rodando dentro de um contêiner Android com suporte ao **Android Jetpack Embedded Photo Picker** (`window.CaldraAndroidPhotoPicker.isEmbeddedPhotoPickerAvailable() === true`), em contêiner Android com fallback para `ActivityResultContracts.PickVisualMedia`, ou em navegador Web padrão.
   - Suporta `onUriPermissionRevoked` (caso o usuário desmarque uma foto na galeria incorporada do Android 14+) para limpar imediatamente a seleção/prévia sem travar o CHAMFER Vision.
   - Mantém uma **Galeria Incorporada da Sessão Ativa** (cache em memória limitado às imagens já autorizadas pelo usuário na sessão atual) para reabertura instantânea com 1 toque sem precisar sair da tela.

2. **Preservação de Contexto do CHAMFER CAD (`Lab2DEditor.tsx`, `immersive.ts`, `VisionDialog.tsx`):**
   - Suprime o bloqueio `RotateGate` enquanto o modal `VisionDialog` ou `ImportDialog` está aberto, impedindo que a transição temporária para o seletor de mídia do Android em modo retrato oculte ou desmonte o modal ao retornar para o aplicativo.
   - Protege o `DialogContent` contra fechamento acidental (`onInteractOutside`, `onEscapeKeyDown`) enquanto o seletor de mídia está aberto ou a imagem está sendo carregada.
   - Preserva integralmente `entities`, `selectedIds`, `zoom`, `pan`, imagem de referência e estado da prévia em caso de cancelamento ou falha de leitura.

3. **Pipeline de Imagem e Transparência PNG (`imageImportService.ts`, `imagePreprocessor.ts`, `imageProfiler.ts`):**
   - Utiliza `URL.createObjectURL(file)` com liberação explícita (`release()`) em vez de duplicar buffers Base64 gigantes na memória RAM.
   - Valida a assinatura binária (*magic bytes* de PNG, JPEG, WEBP e bloqueio de PDF) para suportar URIs de provedores de mídia em nuvem (Google Fotos / Android Cloud Media Provider `content://media/picker/...`) mesmo quando o nome do arquivo não traz extensão.
   - Preserva o canal alfa em `rasterize()` (`ctx.clearRect` em vez de `ctx.fillRect("#ffffff")`) e introduz `analyzeAlphaChannel()` + `effectivePixelLuminance()` para vetorizar corretamente logos PNG transparentes tanto com traço escuro quanto com traço branco/claro sobre fundo transparente.

---

## 3. Especificação Nativa Android (Kotlin + Jetpack Compose) para Contêiner Host

Quando o CALDRA é empacotado em um contêiner Android nativo (Kotlin + Jetpack Compose), o módulo host deve declarar a biblioteca oficial `androidx.photopicker:photopicker-compose` e expor a ponte `CaldraAndroidPhotoPicker` para o `WebView`:

### 3.1. Dependência Gradle (`build.gradle.kts`)

```kotlin
dependencies {
    implementation("androidx.photopicker:photopicker-compose:1.0.0-alpha01")
    implementation("androidx.activity:activity-compose:1.9.3")
}
```

### 3.2. Verificação de Compatibilidade (Android 14 / API 34 + SDK Extensions R >= 15)

```kotlin
import android.os.Build
import android.os.ext.SdkExtensions

fun isEmbeddedPhotoPickerSupported(): Boolean {
    return Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
        SdkExtensions.getExtensionVersion(Build.VERSION_CODES.R) >= 15
}
```

### 3.3. Componente Compose com `EmbeddedPhotoPicker` + Fallback `PickVisualMedia`

```kotlin
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.photopicker.compose.EmbeddedPhotoPicker
import androidx.photopicker.compose.EmbeddedPhotoPickerFeatureInfo
import androidx.photopicker.compose.rememberEmbeddedPhotoPickerState

@Composable
fun CaldraEmbeddedVisionPickerSheet(
    visible: Boolean,
    expanded: Boolean,
    accentColorHex: Long = 0xFFF59E0B,
    onUriGranted: (Uri) -> Unit,
    onUriRevoked: (Uri) -> Unit,
    onDismiss: () -> Unit,
) {
    if (!visible) return

    if (isEmbeddedPhotoPickerSupported()) {
        val pickerState = rememberEmbeddedPhotoPickerState(
            onSessionError = { _ -> onDismiss() },
            onUriPermissionGranted = { uris ->
                uris.lastOrNull()?.let(onUriGranted)
            },
            onUriPermissionRevoked = { uris ->
                uris.forEach(onUriRevoked)
            },
            onSelectionComplete = {
                onDismiss()
            }
        )

        val sheetHeight by animateDpAsState(
            targetValue = if (expanded) 520.dp else 300.dp,
            label = "EmbeddedPickerHeight"
        )

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(sheetHeight)
        ) {
            EmbeddedPhotoPicker(
                state = pickerState,
                embeddedPhotoPickerFeatureInfo = EmbeddedPhotoPickerFeatureInfo.Builder()
                    .setMaxSelectionLimit(1)
                    .setOrderedSelection(false)
                    .setAccentColor(accentColorHex)
                    .setMimeTypes(listOf("image/png", "image/jpeg", "image/webp"))
                    .build()
            )
        }
    } else {
        // Fallback automático para dispositivos Android < 14 ou sem SDK Extension R >= 15
        val fallbackLauncher = rememberLauncherForActivityResult(
            contract = PickVisualMedia()
        ) { uri: Uri? ->
            if (uri != null) {
                onUriGranted(uri)
            } else {
                onDismiss()
            }
        }

        LaunchedEffect(Unit) {
            fallbackLauncher.launch(
                PickVisualMediaRequest(PickVisualMedia.ImageOnly)
            )
        }
    }
}
```
