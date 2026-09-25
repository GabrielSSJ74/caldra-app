# Correção global 2D/3D e Quadrado → Redondo

## Objetivo

Unificar a visualização de todos os modelos de Traçagem em uma única área alternável entre 2D e 3D, sem alterar nem duplicar o motor 3D existente. Reconstruir a geometria do Quadrado → Redondo a partir da mesma malha matemática usada pela planificação.

## Implementação

1. **Visor reutilizável 2D ↔ 3D**
   - Criar um componente único de área principal com controle segmentado `[2D] [3D]`.
   - Manter dimensões e posição estáveis durante a troca.
   - Manter as duas visualizações montadas após o primeiro uso, ocultando apenas a inativa, para preservar câmera, zoom, orientação e estado visual.
   - Aplicar o mesmo componente ao `GeometryStudio` e ao `SquareToRoundStudio`, cobrindo todos os modelos de Traçagem sem ramificações por família.
   - Remover os acionadores duplicados e garantir que o 3D nunca seja renderizado como bloco adicional abaixo do 2D.

2. **Geometria canônica do Quadrado → Redondo**
   - Estender o modelo matemático existente para expor vértices, geratrizes, faces triangulares e contornos da superfície média.
   - Construir cada quadrante como um leque real de triângulos entre um vértice da base e os pontos do quarto de círculo correspondente, mais a face triangular de ligação ao vértice seguinte.
   - Preservar base retangular, excentricidades X/Y, diâmetro, altura, divisões e espessura nominal.
   - Converter essa malha canônica para o formato já aceito pelo `Wire3D`; nenhuma alteração será feita no renderizador 3D.
   - Fazer a planificação consumir as mesmas relações topológicas e comprimentos verdadeiros da malha.

3. **Coerência técnica**
   - Mostrar no 3D as arestas que correspondem às geratrizes/divisões reais.
   - Manter no Traçado os mesmos pontos, linhas e geratrizes usados pela malha e pela planificação.
   - Passar `baseA`, `baseB`, `offsetX`, `offsetY`, divisões e espessura completos ao adaptador 3D, eliminando a aproximação quadrada atual baseada apenas no maior lado.
   - Preservar exportação vetorial, envio ao CHAMFER e cálculos existentes.

4. **Validação e regressão**
   - Adicionar testes para base quadrada, base retangular, alturas e diâmetros diferentes.
   - Verificar contornos da base/topo, quantidade de faces e geratrizes, comprimentos 3D versus planificação e limites geométricos.
   - Executar testes existentes e verificar a aplicação em celular e desktop, incluindo alternância imediata e ausência de 2D/3D simultâneos.
   - Conferir Traçagem, Planificação, CHAMFER, Projetos, Calculadora e Estudos por sinais de compilação e navegação.

## Restrição técnica

O `Wire3D` e seu mecanismo de câmera/interação permanecem intactos. A mudança será limitada ao componente de apresentação compartilhado e à geometria que alimenta o motor.
