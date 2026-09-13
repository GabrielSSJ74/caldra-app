# Correção cirúrgica do Paywall e CHAMFER

## Objetivo
Corrigir somente a composição visual do Paywall e a montagem em tela cheia do CHAMFER, preservando integralmente planos, ferramentas, motores e exportações.

## Implementação
- Separar backdrop e conteúdo do Paywall no portal já existente, removendo qualquer efeito capaz de atingir o modal.
- Ajustar o modal para limites baseados em `100dvh`, margens seguras e rolagem interna em telas pequenas e orientação horizontal.
- Rastrear a ação “Abrir no CHAMFER” para fechar o gate antes de navegar à rota real do editor.
- Garantir que a raiz do CHAMFER escape do layout normal e ocupe `100vw × 100dvh`, sem padding, largura máxima, overflow ou deslocamento herdado.
- Confirmar que o bloqueio de rolagem do Paywall é removido ao fechar e ao navegar.

## Validação
- Testar Paywall aberto por CHAMFER, DXF Laser CNC e Oficina em celular e desktop.
- Testar a transição Paywall → CHAMFER e a entrada direta na rota do CHAMFER.
- Conferir posicionamento das barras e área de desenho em vertical e paisagem.
- Rodar verificação de tipos, testes automatizados e confirmar o estado final da compilação.

## Limites preservados
- Nenhuma alteração na matriz FREE/PRO.
- Nenhuma alteração em geometria, canvas, 2D, 3D, Layers, DXF ou CNC.