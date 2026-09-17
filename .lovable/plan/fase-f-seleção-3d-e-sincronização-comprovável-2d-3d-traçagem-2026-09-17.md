# Fase F — Seleção 3D e sincronização comprovável 2D ↔ 3D ↔ Traçagem

## Objetivo

Fechar o refinamento do 3D da Traçagem: tocar numa face/aresta do Wire3D destaca a entidade correspondente no 2D, na Traçagem Guiada e na planificação — e vice-versa — usando as referências estáveis já existentes (`outline:`, `fold:`, `point:`, `dim:`). Sem trocar renderer, câmera, motores ou geometria canônica.

## Estado atual (confirmado por leitura)

- `Wire3D.tsx` já emite IDs estáveis por entidade (`face:i:j`, `edge:i`, `reference:i`) e atributos `data-entity-id` / `data-category`; políticas de visibilidade em `src/lib/viz3d/visibility.ts` com categoria `selection` (overlay) reservada.
- `src/lib/geometry/refs.ts` já define `GeometryRef`, `HighlightState` (normal/focus/isolated) e o vínculo campo→cota→entidade usado no 2D e na Traçagem.
- Hoje não há seleção no 3D nem mapeamento entre arestas 3D e refs do desenvolvimento.

## O que falta (pendências registradas no roadmap)

1. **Fase F (este plano)** — seleção + sincronização.
2. Fases C2/D2 — espessura real e camada de fabricação (Fator K, linha neutra) ligadas à interface (plano separado, depois desta).
3. Fora do 3D: interface CHAMFER, tradução progressiva, regressão ampliada do catálogo e credenciais Google Play/RTDN (dependem de você).

## Escopo da Fase F

1. **Mapeamento 3D → ref canônica** (`src/lib/viz3d/selection.ts`, puro):
   - Geradores de `WireModel` passam a carregar, por aresta/face, a `GeometryRef` de origem (geratriz → `fold:i`/segmento de `outline:i`; aberturas → `point:`).
   - Somente metadado; nenhuma alteração geométrica ou de cálculo.
2. **Seleção no Wire3D**:
   - Toque/clique em aresta ou face seleciona a entidade (hit-test por proximidade ao segmento em tela, alvo ≥ 12 px no mobile).
   - Seleção renderizada como overlay na categoria `selection` (acima de tudo, sem mudar cores técnicas nem ordem de faces).
   - Props controladas: `selectedRef`, `onSelectRef(ref | null)`; sem seleção interna escondida.
3. **Sincronização nos estúdios** (`GeometryStudio`, `SquareToRoundStudio`):
   - Estado único de destaque: selecionar no 3D aplica `HighlightState` "focus" no 2D/Traçagem; focar campo/cota no 2D destaca a entidade correspondente no 3D quando o mapeamento existir.
   - Destaque temporário, com rótulo textual (não depende só de cor) e respeito a redução de movimento.
4. **Testes e validação**:
   - Unitários: mapeamento aresta→ref nos cinco modelos; refs inexistentes nunca quebram (fallback silencioso).
   - Playwright: tocar aresta no 3D destaca no 2D; focar parâmetro no 2D destaca no 3D; mobile e desktop; temas claro/escuro/AMOLED.
   - Suíte completa + typecheck ao final.

## Não entra nesta fase

- Espessura real, Fator K, modos Dobra/Linha neutra (Fases C2/D2).
- CHAMFER, exportadores, motores matemáticos, planos/entitlement.
- Nenhuma mudança de renderer, câmera, gestos ou ordenação de profundidade.

## Critérios de aceitação

- Toda aresta 3D mapeável seleciona e destaca a ref correspondente no 2D em todos os cinco modelos.
- Nenhuma entidade some ou muda de cor técnica ao selecionar; seleção sobrevive à rotação.
- 155+ testes passando, typecheck limpo, evidência Playwright mobile + desktop.
