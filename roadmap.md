# Roadmap CALDRA / CHAMFER

Regra do usuário: **executar uma fase inteira por vez**, na ordem.

## Concluído
- Fase 1 — Calculadora impecável (módulos puros, QA 60/60, conferência, peso/custo, materiais, unidades)
- Fase 2A — Plano de corte (ordem, direção, ponto de partida, corte comum, grupos)

## Calculadora Científica (CONCLUÍDO)
- [x] Criar módulo independente, funcional e fiel à referência visual
- [x] Adicionar card CALCULADORA CIENTÍFICA ao lado de ESTUDOS sem mover os demais cards
- [x] Validar motor matemático, histórico, configurações, ferramentas rápidas e responsividade

## Ajustes de refino (CONCLUÍDO)
- [x] AURORA suave mais rápido + novo estilo PADRÃO (sem fundo animado)
- [x] Meus Materiais movido de Configurações para a Oficina
- [x] Configurações reordenadas (Backup, Privacidade e Suporte no fim)
- [x] Paywall com comparativo completo (VISION, plano de corte, DXF CNC, nuvem, AURORA)
- [x] Calculadora: ângulo/casas nas preferências centrais, DEG padrão, %, fatorial, tema do app, display vazio
- [x] QA da calculadora (28 casos) — 103/103 OK
- [x] 3D deixou de ser etapa: virou alternância 2D/3D na área de resultado, com carregamento sob demanda

## Biblioteca de peças / Traçagem (CONCLUÍDO)
- [x] Registro único de modelos (caldeiraria, tubulações, CNC 2D) com capacidades e metadados
- [x] Abas Todas / Caldeiraria / Tubulações / CNC 2D + filtros por família contextuais
- [x] Busca inteligente (nome, sinônimos, categoria, números) e cards com prévia real
- [x] Favoritos, Recentes e Meus Modelos como atalhos (referência única, sem duplicar peças)
- [x] Geradores vetoriais CNC 2D → CHAMFER (1:1 em mm)

## Escola CALDRA (CONCLUÍDO)
- [x] Currículo de 16 módulos com 41 aulas publicadas (fundamentos → fabricação)
- [x] Base de conhecimento única (conceito, fórmula, passo a passo, erros comuns)
- [x] Diagnóstico de nível, mapa de competências e progresso por aula
- [x] Simuladores de triângulo e arco + envio de fórmula para a calculadora
- [x] Exercícios gerados por fórmula com correção passo a passo e placar por aula

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

## Projetos como dossiê de fabricação (CONCLUÍDO)
- Projeto = cliente/obra com peças-instância independentes, progresso e histórico.
- Peças abrem a mesma tela de Traçagem (paramétricas e CNC 2D) com breadcrumb e autosave.

## Ecossistema CALDRA (evolução em fases)
- [x] Fase 1 — Master Project Model: código único do projeto (ESC-001), revisão, migração segura dos projetos existentes.
- [x] Fase 2 — Conjuntos / subconjuntos / peças: árvore de estrutura, código único por peça (ESC-EST-001), vínculo e revisão de peça.
- [x] Fase 3 — vínculo Traçagem → Projeto (salvar no conjunto).
- [x] Fase 4 — vínculo Planificação → Projeto (modo "Do projeto" com aninhamento real).
- [x] Fase 5 — CHAMFER Modo Projeto (peça do dossiê abre desenho vinculado, com volta ao projeto).
- [x] Fase 6 — BOM + Lista de Corte (painel no dossiê + CSV).
- [x] Fase 7 — Validação de Fabricação (impedimentos, alertas e observações por peça).
- [x] Fase 8 — Pacote de Fabricação (PDF único: capa, estrutura, BOM, conferência e ficha por peça).
- [ ] Fase 9 — Vista Explodida.
- [ ] Fase 10 — Modo Montagem.
- [x] Fase 11 — QR / identificação (etiquetas QR por peça + abertura do dossiê com a peça destacada).
- [ ] Fase 12 — Campo / obra.
