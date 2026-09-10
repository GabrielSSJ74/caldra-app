# O que falta no CALDRA

## Estado atual
Tudo funcionando, build OK. Do roteiro do ecossistema (CONCEPÇÃO → PROJETO → FABRICAÇÃO → MONTAGEM) as Fases 1–11 estão concluídas. Restam os itens abaixo.

## 1. Fase 12 — Campo / obra (última do ecossistema)
- Checklist de instalação por projeto, otimizado para celular (alvos grandes, alto contraste, funciona offline).
- Registro de ocorrência no local: texto, foto da peça/instalação, data e autor.
- Marcação de peça como "instalada" direto pela etiqueta QR (abrir `?peca=` → confirmar instalação).
- Resumo de campo no dossiê: peças instaladas × pendentes, ocorrências abertas.
- Tudo persistido localmente com sincronização quando a nuvem estiver ativa.

## 2. Lançamento (Fase 3 do roteiro) — depende de decisões suas
- **Monetização real**: ativar plano PRO com código de ativação CALDRA-XXXXX e Play Billing (quando o APK existir). **Pendente de você: preços** (mensal / anual / vitalício).
- **Conformidade**: páginas públicas de Privacidade e Termos, exclusão de conta em 2 etapas, consentimento de coleta opt-in (necessário para publicar na Play Store).
- **Retenção/qualidade**: projeto-exemplo removível, histórico de cálculos, Modo Oficina (alto contraste, alvos 56px), Sentry/analytics sem dados pessoais.

## 3. PWA → APK (já pedido, parcialmente feito)
- Manifest e ícones prontos. Falta: service worker/cache offline e estrutura TWA/Bubblewrap para gerar APK de teste + AAB. **Instalação real só funciona após publicar o app** (URL pública estável).

## Sugestão de ordem
1. Fase 12 (fecha o ecossistema).
2. PWA: service worker + estrutura TWA.
3. Conformidade (Privacidade/Termos/exclusão) — desbloqueia Play Store.
4. Monetização — assim que definir os preços.

## Detalhes técnicos
- Campo/obra: novos campos no store de projetos (`fieldChecks`, `occurrences` por instanceId), migração segura, mesma abordagem das fases anteriores (aditiva, sem duplicar engines).
- TWA: pasta `android-twa/` com `twa-manifest.json` apontando para a URL publicada; geração via Bubblewrap local (não altera código web).
- Service worker: precache dos assets do build + runtime cache somente leitura; dados do usuário permanecem no localStorage/IndexedDB, sem risco de perda na atualização.
