# Refinamento profissional do 3D da Traçagem

## Diagnóstico confirmado

- O visor da Traçagem é o `Wire3D`, um renderizador técnico SVG próprio. Ele não usa AO, shadow map, depth buffer ou materiais Three.js; portanto desligar efeitos de GPU não corrigiria este caso.
- O halo inferior é uma elipse de “sombra de contato” desenhada pelo próprio visor.
- O efeito fantasma vem principalmente de superfícies externas e internas desenhadas simultaneamente com ordenação pela profundidade média de cada polígono. Em peças côncavas/intersectantes, essa ordenação não resolve oclusão corretamente.
- O Quadrado → Redondo já recebe a malha canônica da planificação. Cone/Redução usam cascas paramétricas; Curva de Gomos usa `elbowModel`; Boca de Lobo usa a interseção canônica para o ramal, mas hoje combina duas cascas sobrepostas.
- Auditoria inicial nos parâmetros padrão: Cone 256 faces/256 vértices; Curva 384/382; Quadrado → Redondo 88/62; Boca de Lobo 880/870; Redução 192/192. Não foram encontrados NaN, Infinity, faces exatamente duplicadas, triângulos de área zero ou normais não unitárias nesses casos.
- O renderer atual possui orbit por arraste e zoom por roda; não expõe vistas padrão, reset, seleção de face ou pan dedicado. Essas capacidades serão adicionadas sem substituir câmera, projeção ou gestos existentes.

## Fase A — diagnóstico reproduzível

- Criar um auditor puro de `WireModel` que reporte vértices, faces, triângulos, bounds, degenerações, duplicatas, faces quase coincidentes, normais, winding, arestas abertas e superfícies internas inesperadas.
- Executá-lo somente em desenvolvimento e criar uma pequena central de debug do visor: Normais, Faces, Estrutura, Bounds e IDs; “Shadow OFF” controla apenas a sombra artificial existente e “AO OFF” informa que este renderer não possui AO.
- Registrar snapshots matemáticos dos cinco modelos com parâmetros, bounds, contagens e referências para comparação antes/depois.

## Fase B — topologia, normais e identidade

- Estender `Face` e `Edge` de forma retrocompatível com IDs opcionais, referência canônica, grupo técnico e modo de shading; preservar consumidores atuais.
- Triangular polígonos de modo determinístico apenas na camada de representação, mantendo posições e medidas canônicas intactas.
- Corrigir winding por tipo de superfície: externa para fora, interna para dentro e bordas coerentes; rejeitar faces degeneradas em vez de atribuir uma normal artificial.
- Propagar IDs reais: faces/geratrizes do Quadrado → Redondo, gomos/junções da Curva, divisões radiais de Cone/Redução e entidades de interseção da Boca de Lobo.
- Na Boca de Lobo, remover a sobreposição visual entre tubo e ramal usando a curva de interseção já calculada; não criar linhas decorativas nem alterar a equação do cálculo.

## Fase C — eliminar ghost e ordenar corretamente

- Remover a elipse de sombra como padrão técnico; mantê-la apenas como opção de diagnóstico desligada por padrão.
- Separar passes de superfície externa, superfície interna visível nas bocas, bordas e linhas técnicas.
- Aplicar visibilidade por orientação e abertura: faces internas só aparecem quando geometricamente observáveis; nunca pintar toda a casca interna atrás da externa.
- Ordenar triângulos, não polígonos grandes, com regra estável e sem deslocar vértices. Validar rotações críticas onde a ordenação média atual falha.
- Isolar cada hipótese em testes visuais: internos, sombra, winding, ordenação e interseções.

## Fase D — visual técnico centralizado

- Criar `technical3DConfig` único para qualidade, iluminação matemática, material de chapa, arestas, seleção e níveis mobile/desktop.
- Preservar os tokens de chapa existentes, refinando contraste para fundo claro, escuro e AMOLED sem usar a cor principal do tema como significado técnico.
- Implementar shading por modelo: facetado no Quadrado → Redondo, contínuo por faixas em Cone/Redução e híbrido com junções explícitas na Curva de Gomos e Boca de Lobo.
- Manter iluminação uniforme baseada em normais reais, com destaque discreto e sem brilho fotográfico, textura, ferrugem ou contraste cinematográfico.

## Fase E — arestas, vistas e enquadramento

- Adicionar os modos `Superfície`, `Superfície + arestas` e `Estrutura`; o último mostra somente contornos, geratrizes, divisões, juntas e referências reais.
- Adicionar ISO, Frontal, Traseira, Superior, Inferior, Esquerda, Direita, Ajustar à tela e Resetar usando a câmera existente.
- Preservar orbit e zoom; adicionar pan compatível somente onde não conflitar com seleção e toque. Manter pinch e arraste estáveis no celular.
- Recalcular fit apenas quando modelo ou vista mudar, com margem estável e sem cortar a peça.

## Fase F — seleção, 2D e planificação

- Selecionar face, gomo ou componente pelo ID real; destacar temporariamente por contorno, espessura e rótulo, preservando a cor técnica.
- Criar o vínculo opcional `faceId ↔ geometryRef ↔ entityId`, sem referências inventadas. Onde o modelo ainda não oferece equivalência, a seleção fica apenas no 3D.
- Ligar referências já existentes da Traçagem Guiada às faces/arestas correspondentes quando a identidade canônica for comprovável.
- Substituir o achatamento genérico atual por: desdobramento matemático somente nos modelos com mapeamento face→triângulo 2D válido; transição simples nos demais. O estado 2D/3D continua montado e preserva câmera.

## Fase G — performance

- Manter o 3D sob demanda; nenhum modelo será pré-carregado na abertura do CALDRA.
- Memorizar triangulação, normais, projeções invariantes, classificação de faces e estilos; durante orbit atualizar somente projeção/ordenação necessárias.
- Reduzir polígonos e linhas secundárias no enquadramento distante sem remover geratrizes ou junções essenciais; elevar detalhe ao aproximar.
- Pausar animação fora da tela, respeitar redução de movimento e evitar recriação de materiais/arrays por frame.

## Fase H — validação e regressão

- Testes unitários do auditor, winding, normais, IDs, contagens, bounds e invariância dos cálculos para Cone, Curva de Gomos, Quadrado → Redondo, Boca de Lobo e Redução.
- Comparação visual automatizada em fundo claro/escuro/AMOLED, ISO/frontal, zoom mínimo/máximo e rotações críticas; o teste específico deve provar a ausência do halo e do ghost.
- Testar modos técnicos, seleção, vistas, reset, fit, planificação e retorno ao 3D em celular e desktop.
- Medir custo de construção e interação dos cinco modelos, especialmente Boca de Lobo, sem usar preload global.
- Executar testes completos e confirmar a compilação após cada fase. Uma fase só avança quando a anterior preserva parâmetros, bounds, referências, comprimentos e planificação.

## Limites preservados

- Sem troca de renderer, câmera, motor matemático, CHAMFER, exportadores, assinatura, planos ou navegação.
- Nenhuma correção visual poderá alterar coordenadas canônicas ou resultados de fabricação.
- As imagens fornecidas e as capturas reproduzidas serão usadas como baseline visual; elas não serão incorporadas ao produto.