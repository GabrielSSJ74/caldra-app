# Unificação paramétrica da Traçagem

## Princípio

Uma família de peça = um modelo paramétrico. As variações (ângulo, número de gomos, tipo de derivação) passam a ser **parâmetros**, nunca modelos separados. Nenhum cálculo atual é apagado: os métodos continuam existindo dentro do motor, que escolhe o método matemático certo conforme os parâmetros.

**Regra absoluta:** o motor 3D atual não é tocado. Câmera, orbit, pan, zoom, fit, gestos, iluminação, materiais, seleção e tela cheia permanecem exatamente como estão. Muda apenas **a geometria que ele recebe**.

## Fase 1 — Consolidar a lista (visível imediatamente)

Hoje a lista de Tubulações repete a mesma família:
`Curva 1 Gomo`, `Curva 2 Gomos`, `Curva 3 Gomos`, `Curva 4 Gomos`, `Curva Múltiplos Gomos` → um único **CURVA DE GOMOS**.
`Corte Angular` + `Boca de Lobo` → uma única **BOCA DE LOBO** (com o corte angular preservado como um dos modos de cálculo).
`Quadrado → Redondo` permanece único.

Busca e favoritos antigos continuam funcionando: os identificadores removidos passam a apontar para o modelo consolidado (mapa de compatibilidade), sem quebrar recentes, favoritos ou projetos salvos.

## Fase 2 — BOCA DE LOBO paramétrica de verdade

Motor único com seleção de método:

- **Corte oblíquo** (tubo cortado em ângulo) — método atual por ordenadas, preservado sem alteração de resultado.
- **Derivação em tubo** (boca de lobo real) — interseção cilindro/cilindro calculada geometricamente.

Parâmetros: diâmetro do tubo principal, diâmetro da derivação, ângulo da derivação, excentricidade/posição, comprimento, espessura. O ângulo é campo livre (30°, 45°, 60°, 90°…), validado pelo domínio matemático.

Resultado: linha de interseção real, desenvolvimento da derivação e do furo no tubo principal, cotas, pontos de traçado e dados de fabricação. Duas peças fabricáveis distintas (TUBO PRINCIPAL / DERIVAÇÃO) com código, quantidade, material, espessura e conjunto.

## Fase 3 — CURVA DE GOMOS com gomos como entidades

Parâmetros: diâmetro, raio, ângulo total livre, quantidade de gomos, espessura. Validação específica (raio maior que o raio do tubo, gomos inteiros ≥ 2, ângulo dentro do domínio).

A curva passa a ser decomposta:

```text
CURVA G-001
├── GOMO 01  (meio gomo de ponta)
├── GOMO 02
├── GOMO 03
└── GOMO 04  (meio gomo de ponta)
```

Cada gomo tem código, posição, orientação, dimensões, geometria e planificação própria. As pontas deixam de ser apenas um aviso e passam a ter desenvolvimento correto.

## Fase 4 — QUADRADO → REDONDO: 3D verdadeiro

O 3D deixa de parecer um cone truncado: a superfície é construída a partir das mesmas geratrizes usadas na triangulação do desenvolvimento, mostrando os quatro planos triangulares e os quatro setores cônicos. Planificação e 3D passam a vir da mesma geometria.

## Fase 5 — Vistas de estudo e envio ao CHAMFER

Cada modelo ganha as vistas **RESULTADO · TRAÇADO · 3D · PLANIFICAÇÃO**. No modo TRAÇADO aparecem divisões, geratrizes, projeções e pontos de interseção; no modo RESULTADO, apenas o essencial. Animação pedagógica (divisão → projeção → interseção → desenvolvimento) gerada da própria geometria, sem vídeo.

**ENVIAR PARA CHAMFER** envia geometria vetorial real (contorno, dobras, linhas de referência, identificação, espessura, material) — nunca imagem. Na curva é possível enviar todos os gomos ou apenas o gomo selecionado.

## Detalhes técnicos

- `src/lib/library/registry.ts` — consolidar `tub.curva-*` e `tub.corte-angular`; mapa `ALIASES` id-antigo → id-novo **com os parâmetros históricos** (ex.: `tub.curva-3` abre a curva já com 3 gomos), consumido por favoritos, recentes e links.
- `src/lib/geometry/engines.ts` — `obliqueEngine` ganha o campo de método e delega ao cálculo correto; `elbowEngine` passa a expor gomos. A matemática atual continua sendo o método padrão, para não mudar resultados existentes.
- Novos módulos puros: `src/lib/geometry/branch.ts` (interseção cilindro/cilindro) e `src/lib/geometry/elbowSegments.ts` (gomos como entidades), ambos com testes.
- `src/lib/viz3d/wire.ts` — apenas passa a montar os pontos/geratrizes vindos da geometria canônica para `boca-de-lobo`, `curva-de-gomos` e `quadrado-redondo`. **Nenhuma alteração** em `Model3DViewer`, `Cad3DStage`, câmeras, controles, luzes, materiais ou seleção.
- CHAMFER reutiliza o caminho vetorial já existente (`src/lib/projects/chamfer.ts`), sem novo motor.

## Regressão

Comparação antes/depois não só dos números, mas de pontos, segmentos, contornos, fechamento, escala e da geometria enviada ao CHAMFER. Casos obrigatórios: boca de lobo a 30°, 45°, 60° e 90°; curva 45°/3, 90°/3 e 90°/5 gomos; quadrado→redondo com larguras, comprimentos, diâmetros e alturas variados. Mais typecheck, build, testes e verificação no navegador.
