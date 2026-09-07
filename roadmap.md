# Roadmap CALDRA / CHAMFER

Regra do usuário: **executar uma fase inteira por vez**, na ordem.

## Concluído
- Fase 1 — Calculadora impecável (módulos puros, QA 60/60, conferência, peso/custo, materiais, unidades)
- Fase 2A — Plano de corte (ordem, direção, ponto de partida, corte comum, grupos)

## Calculadora Científica (EM ANDAMENTO)
- [x] Criar módulo independente, funcional e fiel à referência visual
- [x] Adicionar card CALCULADORA CIENTÍFICA ao lado de ESTUDOS sem mover os demais cards
- [ ] Validar motor matemático, histórico, configurações, ferramentas rápidas e responsividade

## Fase 3 — Lançamento (EM ANDAMENTO)
### Etapa A — Monetização e entitlement
- [ ] Ativar Lovable Cloud (perfil com `plan`, tabela `activation_codes`)
- [ ] `entitlementService` como fonte única (substituir checagens espalhadas)
- [ ] Camada de compra: Play Billing (TWA) com degradação para web
- [ ] Código de ativação CALDRA-XXXXX-XXXXX-XXXXX (atômico, sem reuso)
- [ ] Paywall único: comparativo FREE × PRO real, mensal/anual/já tenho/restaurar
- [ ] Gate suave por feature (modal específico, nunca genérico)

### Etapa B — Conformidade Play Store / LGPD
- [ ] Rotas públicas /privacidade e /termos (constantes de empresa e contato)
- [ ] Excluir conta e dados (confirmação em 2 etapas, cascade, fallback offline)
- [ ] Coleta consentida (opt-in na 1ª execução, revogável em Configurações)

### Etapa C — Onboarding, qualidade e retenção
- [ ] Onboarding máx. 3 telas, pulável
- [ ] Projeto-exemplo marcado EXEMPLO, removível, com dicas contextuais
- [ ] Sentry via env + analytics de funil (provider plugável, sem PII)
- [x] Backup .cal exportar/importar (schema versionado, substituir ou mesclar)
- [ ] Histórico de cálculos, favoritos, duplicar peça, biblioteca de componentes
- [ ] Modo Oficina (alto contraste, alvos 56px, persistente)
- [ ] QA ampliado: migração de backup, entitlement, funil

## Fase 4 — Inteligência (CONCLUÍDA)
- [x] A1 Reconstrução paramétrica (chapa perfurada / flange / anel) com tabela editável, preview e template em CORTE (original preservado em CONSTRUÇÃO)
- [x] A2 OCR técnico com Tesseract.js lazy, caixas na imagem, confirmação individual/em massa, texto corrigível, medida reaproveitável na calibração
- [x] B1 Botão APRENDER com 4 passos (parâmetros, cálculo, desenvolvimento, fabricação) usando os motores puros
- [x] B2 Modos APRENDIZ / MESTRE em Configurações (só apresentação, um único caminho de cálculo)

## Fase 5 — Plataforma (CONCLUÍDA)
- [x] Nesting modo CHAPA (chapas comerciais, folga, margem, giro 90°, aproveitamento e sobra)
- [x] Custo de fabricação (corte, furos, dobras, solda, mão de obra, setup, fator de espessura)
- [x] Orçamento em PDF (fornecedor/cliente, margem, desconto, imposto regional, validade)
- [x] Ficha de produção em PDF com QR de rastreio e cotas de conferência
- [x] Nuvem e versões (sincronização por `updatedAt`, snapshots nomeados, restauro)
- [x] Regional (Brasil/Portugal/EUA/Europa: moeda, formato, chapas e imposto padrão)
- Rota `/oficina` reúne CHAPA · CUSTO · ORÇAMENTO · FICHA · NUVEM

## Professionalization Pass
- [x] Parte 3.0 — CHAMFER em tela cheia + paisagem obrigatória + modais contidos
- [x] Parte 1 — WORKSPACE_FRAME 1500x3000 paramétrico, auto-fit da Traçagem, Centralizar Peça
- [x] Parte 2 — Design System CALDRA (escala tipográfica, foco/desabilitado, botões, skeleton/spinner, estados de erro) em `src/components/chameleon/ds.tsx` + tokens em `styles.css`
- [x] Parte 3 — Feedback de instrumento técnico (barra GEOMETRIA · PLANIFICAÇÃO · FABRICAÇÃO nos estúdios)
- [x] Parte 4 — Cold start (splash pré-JS), ícone/splash (favicon + manifest + apple-touch), matriz visual (/matriz-visual), changelog (/novidades), reportar problema (diagnóstico + copiar/e-mail)

- [x] Fase LXDS/UI — LXDS REFERENCE MAP (`docs/LXDS-REFERENCE-MAP.md`), modo de análise LXDS somente leitura, amostra CYPCT_GOLDEN_SAMPLE_01 no QA, janelas de exportação tematizadas e pinch-zoom sem deslocamento
- [x] Fase CNC — layers CUT/MARK/BEND, exportador DXF CNC com conferência, trajetória (direção, start point, lead-in/out), FLUXO CALDRA + prévia animada, painel de multi-seleção e lado do painel estável (sem oscilação)

## Decisões pendentes do usuário
- Preços do paywall (mensal / anual / vitalício Pix) — usar placeholders configuráveis até definir
