# Roadmap CALDRA / CHAMFER

Regra do usuário: **executar uma fase inteira por vez**, na ordem.

## Concluído
- Fase 1 — Calculadora impecável (módulos puros, QA 60/60, conferência, peso/custo, materiais, unidades)
- Fase 2A — Plano de corte (ordem, direção, ponto de partida, corte comum, grupos)

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
- [ ] Backup .cal exportar/importar (schema versionado, substituir ou mesclar)
- [ ] Histórico de cálculos, favoritos, duplicar peça, biblioteca de componentes
- [ ] Modo Oficina (alto contraste, alvos 56px, persistente)
- [ ] QA ampliado: migração de backup, entitlement, funil

## Fase 4 — Inteligência (CONCLUÍDA)
- [x] A1 Reconstrução paramétrica (chapa perfurada / flange / anel) com tabela editável, preview e template em CORTE (original preservado em CONSTRUÇÃO)
- [x] A2 OCR técnico com Tesseract.js lazy, caixas na imagem, confirmação individual/em massa, texto corrigível, medida reaproveitável na calibração
- [x] B1 Botão APRENDER com 4 passos (parâmetros, cálculo, desenvolvimento, fabricação) usando os motores puros
- [x] B2 Modos APRENDIZ / MESTRE em Configurações (só apresentação, um único caminho de cálculo)

## Fase 5 — Plataforma (pendente)
- Nesting modo CHAPA, custo de fabricação, orçamento PDF, ficha + QR, nuvem, versões, regional

## Decisões pendentes do usuário
- Preços do paywall (mensal / anual / vitalício Pix) — usar placeholders configuráveis até definir
