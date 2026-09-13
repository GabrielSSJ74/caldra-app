# Quadrado → Redondo: estratégia de fabricação + representação da dobra

Duas mudanças independentes, ambas aditivas. O cálculo geométrico base e o motor 3D existente não são substituídos.

## 1. Estratégia de fabricação (parâmetro, não novo modelo)

No configurador do Quadrado → Redondo entra uma escolha:

- **PEÇA ÚNICA**
- **2 PARTES + SOLDA**

A geometria final do conjunto é exatamente a mesma nos dois casos. O que muda é a decomposição fabricável.

**Peça única** — um desenvolvimento, uma peça, código e quantidade preservados, resultado idêntico ao validado hoje.

**2 partes + solda** — a transição é dividida matematicamente em duas metades (cada metade cobre dois quadrantes da base, com costura própria). Cada metade gera:

- planificação independente, calculada pelo mesmo método de triangulação e pelos mesmos comprimentos verdadeiros;
- código próprio (`Q-R-001-A`, `Q-R-001-B`) e quantidade própria;
- duas emendas de solda registradas como união real da decomposição, com posição indicada.

Somadas, as duas metades reconstroem a mesma área e o mesmo contorno da peça única — isso vira teste automático.

A união por solda aparece na decomposição, na lista de peças e na sequência de fabricação/montagem.

## 2. Onde a escolha aparece

| Área | Peça única | 2 partes + solda |
| --- | --- | --- |
| Vista 2D | uma peça | duas metades com a emenda indicada |
| Vista 3D | corpo único | metades A e B, montadas ou separadas na explodida |
| Planificação | um desenvolvimento | dois desenvolvimentos lado a lado |
| Árvore / lista de peças / corte | 1 item | 2 itens + união soldada |
| Envio ao CHAMFER | uma peça | as duas metades, geometria vetorial real |

## 3. Linha de dobra: geometria ≠ representação

Uma dobra continua guardando internamente sua linha completa (ponto inicial e ponto final). Nada é apagado nem convertido.

O que muda é apenas **como ela é desenhada em cada contexto**:

- **Traçagem**: linha de dobra completa, de ponta a ponta (leitura pedagógica).
- **CHAMFER**: em cada extremidade, um **ponto preenchido sobre a borda da peça + uma linha curta saindo dele** — `●────` / `────●`. Ponto pequeno, circular e centralizado exatamente no ponto da borda, sem afastamento e sem espaço entre borda, ponto e linha. Mesma cor rosa técnica da dobra. Nada de testemunhas afastadas, prolongamentos nem símbolos complexos. Selecionar destaca ponto + linha juntos e volta ao rosa ao desmarcar.
- **Desenho técnico**: linha completa, com traço técnico de dobra.
- **Exportações**: inalteradas. O DXF técnico leva a linha completa; o DXF laser CNC mantém a função BEND na camada BEND. Dobra nunca vira marcação — a simplificação é só visual.
- Dentro de grupos, o papel BEND e a representação ponto + linha permanecem intactos.

## 4. Sobre dobradeira

A estratégia é apresentada como opção de fabricação. O CALDRA não afirma compatibilidade com prensa nem verifica interferência de máquina — não existe módulo de simulação de dobra. A estrutura fica preparada para receber isso no futuro (matriz, punção, garganta, curso, sequência), sem nada disso ser implementado agora.

## 5. Detalhes técnicos

- `src/lib/geometry/types.ts`: `GeometryResult` ganha `joints?: { id; kind: "weld"; label; a; b }[]`; `GeometryPiece` já existe e será usado para A/B.
- `src/lib/geometry/squareToRound.ts`: novo campo `strategy: "single" | "two-weld"` em `SquareToRoundInput` (default `single`). A rotina de encadeamento de triângulos é extraída para uma função que recebe o intervalo de quadrantes, permitindo desenvolver `[0,1]` e `[2,3]` separadamente. `pieces` e `joints` preenchidos só no modo dividido. `buildModel` marca cada face/geratriz com `piece: "A" | "B"`.
- `src/lib/viz3d/wire.ts`: o construtor de malha `quadrado-redondo` já existente passa a aceitar `strategy` e a separar as duas metades em grupos (com afastamento na explodida). Nenhum motor novo, nenhuma reescrita do renderizador.
- `src/components/chameleon/SquareToRoundStudio.tsx`: seletor de estratégia junto ao bloco Método; abas Desenvolvimento/Exportação/CHAMFER passam a iterar `result.pieces` quando existirem (`piecesToEntities` já suporta).
- `src/lib/lab2d/technical.ts`: novo `BendRender = "full" | "witness"` e helper `bendWitnessSegments(line, mm)` que devolve os dois trechos curtos a partir da linha completa — puro cálculo de desenho, não toca em `Entity`.
- `src/lib/lab2d/canvasScene.ts`: no traçado de entidades da camada `dobra`, desenha as testemunhas em vez da linha inteira; a seleção e o hit-test continuam usando a linha completa.
- `src/lib/lab2d/render.ts` e as exportações DXF ficam intactas (linha completa, role BEND).

## 6. Testes

- Quadrado → Redondo peça única e 2 partes: mesma área desenvolvida total, mesmos comprimentos verdadeiros, 2 peças, códigos A/B, quantidades, posição das emendas, presença da união na montagem.
- Dobra: linha completa preservada na entidade; testemunhas do CHAMFER contidas nas extremidades e mais curtas que a linha; DXF mantém role BEND e nunca MARK.
- Regressão: typecheck, suíte completa e build.
