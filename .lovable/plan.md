# Correções pontuais do CHAMFER

A implementação será aditiva e limitada ao CHAMFER. Os motores geométrico e 3D, cálculos, planificações e exportadores permanecem inalterados.

## 1. Barra lateral e ferramentas

- Reduzir a barra principal à ordem: Selecionar, Linha, Polilinha, Círculo, Retângulo, Texto e três pontos para Importar CNC 2D.
- Remover da barra Régua/Cotar, Nós, Pan, Arco, Polígono e os controles antigos não solicitados, sem apagar sua lógica interna quando usada por outros fluxos.
- Manter Selecionar, Linha, Círculo e Retângulo ligados às implementações existentes.
- Transformar Tesoura em remoção direta da entidade tocada, sem expandir a seleção pelo grupo; atualizar apenas o grupo que perdeu o membro.

## 2. Polilinha e texto

- Corrigir o ciclo da Polilinha: primeiro ponto, vértices sucessivos, prévia do próximo segmento, fechamento ao tocar no primeiro ponto, duplo toque/Enter para concluir e Esc para cancelar.
- Salvar a criação como uma única entidade `polyline`, preservando layer/Manufacturing Role e edição posterior de vértices.
- Estender a entidade de texto existente com largura, altura, negrito e itálico, mantendo compatibilidade com textos antigos.
- Ao escolher Texto, abrir uma entrada com “Insira seu texto” e dimensões reais em milímetros; inserir a entidade no ponto tocado e permitir edição no painel existente.

## 3. Copiar, colar e gestos

- Fazer Copiar gravar somente as entidades selecionadas, preservando grupos, geometria, escala, layer e propriedades.
- Adicionar menu contextual por pressão longa na área de desenho, oferecendo Colar, Colar na posição e Cancelar somente quando houver conteúdo.
- Colar com novos IDs e grupos remapeados, sem afetar entidades fora da seleção.
- Generalizar o gesto de dois dedos: movimento do centro faz PAN e variação da distância faz zoom, independentemente da ferramenta ativa; um dedo continua reservado à ferramenta.

## 4. Importação CNC 2D

- Usar o botão de três pontos da barra lateral como entrada exclusiva para DXF/SVG vetorial.
- Evoluir a janela existente para o fluxo Selecionar arquivo → Analisar → Preview → Importar.
- Exibir formatos aceitos, dimensões, contornos, linhas internas e layers reconhecidos.
- Adicionar zoom, pan e fit no preview, mantendo confirmação obrigatória antes de inserir.

## 5. Barras e planos

- Remover P01/P02/+ da barra superior.
- Substituir o botão PLANO da barra inferior pela lista de planos e pelo botão +, preservando troca e criação independentes.
- Remover somente o botão SNAP da barra inferior; manter o mecanismo interno de captura.
- Reorganizar os controles restantes sem lacunas.

## 6. Vision, propriedades e temas

- Corrigir o CHAMFER VISION com tokens semânticos para superfícies, texto, ícones, bordas, estados normal/hover/pressionado/selecionado/desabilitado e overlay.
- Garantir contraste nos temas claro, escuro e AMOLED sem trocar as cores técnicas de fabricação.
- Fixar o painel lateral por sessão de abertura/seleção, usando o lado direito no desktop quando houver espaço e apresentação responsiva estável no mobile.
- Criar tokens independentes `GRID_MAJOR`, `GRID_MINOR` e `AXIS`, com contraste próprio no AMOLED e sem vínculo com a cor de destaque.
- Preservar BEND rosa completo P1→P2 e todas as funções CUT/MARK/BEND/RECORTE.

## 7. Verificação

- Adicionar testes focados para polilinha, clipboard, remoção dentro de grupo, texto dimensional e planos.
- Validar importação DXF/SVG com preview e confirmação.
- Verificar por interação real: mouse, toque, dois dedos, pressão longa, barra lateral, barra inferior, painel estável, Vision e grid nos três temas.
- Executar regressão para confirmar que BEND, grupos, Manufacturing Roles e os exportadores existentes não mudaram.

## Detalhes técnicos

- Reutilizar `Lab2DEditor`, `ImportDialog`, `VisionDialog`, `usePanelSide`, `groups` e o modelo `Entity`; não criar implementações paralelas.
- Extrair somente lógica pura testável quando necessário, especialmente clipboard, polilinha, texto e remoção de membro agrupado.
- Não alterar o motor Three.js, engines de geometria, planificações ou o serviço único de exportação DXF.
