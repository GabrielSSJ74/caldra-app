# CHAMFER VISION — Modo LOGO com curvas reais

Dois modos na mesma ferramenta, um único caminho de código:

- **Técnico** (existente): chapa, peça, croqui → LINE / ARC / CIRCLE / POLYLINE.
- **LOGO** (novo): traçado por curvas de Bézier preservadas como curvas, para fidelidade máxima com poucos pontos.

## 1. Limpeza antes de construir

Remover o que está morto ou duplica caminho na tentativa anterior:

- `perspectiveCorrectionService.ts` — nunca chamado. Ou integrar de fato na UI (recorte de 4 pontos antes da análise) ou deletar. Plano: **integrar**, já que o modo Técnico com foto precisa dele.
- Vetorização manual de fallback no `VisionDialog` — segundo caminho para a mesma função; removida.
- Texto da UI que promete recorte/perspectiva "após a análise" — substituído por controles reais.
- `toEntities()` deixa de fixar a camada `"corte"`; a camada de destino passa a ser parâmetro.
- Botão CHAMFER VISION passa a exigir Modo Mestre (`isMestre`), como especificado.

A pipeline técnica (binarização Otsu, contornos, ajuste de círculo, calibração px→mm, normalização, validação) é correta e gera entidades editáveis reais — **é reaproveitada, não refeita**.

## 2. Nova entidade nativa: `path`

O modelo atual só tem line / polyline / circle / arc / text. Adicionar:

```
{ type: "path"; segs: BezierSeg[]; closed: boolean; hole?: boolean; parent?: string }
```

Cada segmento guarda ponto final e dois pontos de controle (cúbica). Impacto:

- **Render SVG**: emite `d="M … C …"` nativo — curva perfeita na tela em qualquer zoom.
- **Snap/seleção/bbox**: pontos de controle e extremos entram como candidatos; hit-test por amostragem adaptativa.
- **Transformações** (mover, escalar, girar, espelhar): aplicadas aos pontos de controle.
- **Edição de nós**: arrastar ponto final e alças de controle.
- **DXF**: exportar como `SPLINE` (grau 3, knots de Bézier), aceito por CypCut e similares. Hoje o exportador ignora SPLINE — será implementado.
- **PDF/PNG/SVG**: curva nativa, sem achatamento.

Fallback opcional na exportação: "achatar curvas em polilinha" para máquinas antigas.

## 3. Motor de traçado (Potrace)

Adicionar Potrace em WASM/JS puro rodando no browser (sem servidor), expondo os parâmetros que importam:

| Parâmetro | Padrão LOGO |
|---|---|
| `turdsize` | 3 (2–5) — remove sujeira sem comer detalhe |
| `alphamax` | 1.0 — menor preserva cantos retos |
| `opttolerance` | 0.2 — alta fidelidade |
| `turnpolicy` | `minority` — bom para letras |

Todos ajustáveis na UI, com prévia ao vivo.

## 4. Pré-processamento específico de LOGO

- **Upscale 2–4×** antes de binarizar (configurável, automático conforme resolução).
- **Blur gaussiano leve (1–2 px)** aplicado só em JPG/WebP, para matar mosquito noise de borda; PNG passa direto.
- **Threshold com prévia** e inversão tinta/fundo exposta (hoje existe na API, nunca é usada).
- **Morfologia leve** para fechar microfuros.

## 5. Hierarquia externo/interno

Potrace já devolve a árvore de contornos. O sistema preserva:

- cada furo (miolo do O, do A, do R) vira **contorno independente** no modelo, marcado como `hole`, com referência ao contorno pai;
- na exportação DXF a hierarquia é preservada por agrupamento e ordem, para o CypCut aplicar offset interno no furo e externo na silhueta.

## 6. Logo colorida — uma passada por cor

- Quantização de paleta (K-means, nº de cores ajustável, com prévia dos chips de cor).
- Uma máscara B/N por cor → traçado independente → **cada cor vira uma camada CAD própria**, nomeada pela cor de origem.
- As cores técnicas do CHAMFER continuam mandando na renderização: as camadas geradas recebem cor técnica (corte por padrão), com a cor de origem guardada como metadado e reatribuível pelo usuário.
- Modo monocromático continua sendo o padrão de um clique.

## 7. Reconhecimento seletivo dentro do modo LOGO

Depois do traçado, roda o detector sobre cada contorno:

- contorno circular dentro da tolerância → vira **CIRCLE** de verdade (furo de fixação, olho de mascote);
- trecho reto longo → vira **LINE**;
- o resto permanece **PATH** com Bézier.

Controle na UI: "Reconhecer círculos e retas" ligado por padrão, com tolerância própria.

## 8. Interface

`VisionDialog` ganha seletor de modo no topo (Técnico | Logo). O painel de controles troca conforme o modo; prévia, calibração px→mm, escolha de camada de destino e imagem original como camada de referência continuam iguais para os dois. A validação final reporta nº de curvas, **total de pontos de controle** e peso estimado do DXF — para o usuário ver na hora se a geometria está enxuta.

No modo LOGO a exportação DXF sai como SPLINE + ARC + CIRCLE, nunca rasterizada, e nenhuma curva é amostrada em polilinha (o achatamento fica como opção explícita do usuário, desligada por padrão).

## Detalhes técnicos

- Novos arquivos: `src/lib/vision/logoTracer.ts` (Potrace + parâmetros), `src/lib/vision/colorQuantizer.ts`, `src/lib/vision/bezier.ts` (amostragem, bbox, hit-test, transformações), `src/lib/lab2d/spline.ts` (Bézier → SPLINE DXF).
- Arquivos tocados: `core.ts` (tipo `path`), `render.ts`, `Lab2DEditor.tsx`, `dxfService.ts`, `exporters.ts`, `vectorizer.ts`, `geometryNormalizer.ts`, `VisionDialog.tsx`.
- Dependência: build WASM/JS de Potrace compatível com browser; se nenhuma servir sem Node, o algoritmo (que é compacto e de licença permissiva) é portado direto para TypeScript no `logoTracer.ts`.
- Tudo roda no cliente; nada de servidor, nada de mudança na identidade visual, navegação ou cores técnicas.
