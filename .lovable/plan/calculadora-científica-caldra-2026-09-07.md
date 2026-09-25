# Calculadora Científica CALDRA

## Objetivo

Criar uma nova tela funcional de calculadora científica, responsiva e fiel à referência enviada, sem alterar o CHAMFER nem outros módulos existentes.

## Implementação

- Adicionar uma rota própria para a calculadora, com metadados específicos e retorno claro ao CALDRA.
- Reproduzir a composição da referência: painel navy, cabeçalho, display, histórico, seletor RAD/DEG/GRAD, casas decimais, teclado, ferramentas rápidas e navegação inferior.
- Usar tokens visuais próprios da calculadora integrados aos temas do CALDRA, preservando estrutura, proporções e contraste em mobile, tablet, landscape e desktop.
- Criar um motor matemático isolado e testável, sem `eval`, com precedência, parênteses, operações básicas, potência, raiz, trigonometria nos três modos, logaritmos e constantes.
- Implementar SHIFT temporário, precisão interna sem arredondamento antecipado, formatação brasileira e mensagens de erro amigáveis.
- Implementar histórico reutilizável e configurações próprias da calculadora para ângulo, casas decimais, feedback tátil, som e limpeza do histórico.
- Implementar as ferramentas secundárias em painéis temporários: constantes, frações, raízes, matrizes e conversões; manter Engenharia, Financeira e Estatística como módulos separados e não poluir o teclado científico.
- Adicionar um acesso discreto à calculadora na área apropriada da tela inicial, seguindo o padrão dos módulos existentes.

## Validação

- Testar exemplos obrigatórios: `2 + 3 × 4`, `(2 + 3) × 4`, `√144`, `2¹⁰`, trigonometria em DEG/RAD/GRAD, casas decimais e erros matemáticos.
- Conferir visualmente lado a lado com a referência em mobile e desktop, incluindo proporções, ordem das teclas, botão 0 largo, SHIFT e `=` destacados.
- Verificar teclado, histórico, configurações, painéis secundários, acessibilidade, ausência de sobreposição e saúde geral do app.

## Limites

- Nenhuma mudança no CHAMFER, canvas, ferramentas de desenho, projetos, exportação ou regras de negócio existentes.
- A imagem enviada será usada somente como referência visual, não como conteúdo incorporado.
