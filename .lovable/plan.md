# Correção definitiva de fabricação, exportação e preferências

Implementação aditiva sobre o CALDRA atual. O motor geométrico validado, o motor 3D, o modelo interno BEND e os exportadores DXF permanecem como fontes canônicas; somente recebem decomposição ou apresentação corrigida.

## 1. Dobras no CHAMFER

- Substituir completamente ponto + linha pela representação nova: duas marcas rosas curtas, uma em cada extremidade da entidade BEND.
- Calcular cada marca no próprio extremo P1/P2, orientada perpendicularmente à borda CUT local e tocando essa borda sem afastamento.
- Preservar uma única entidade BEND completa para seleção, grupos, histórico, hit-test e exportação.
- Manter linha completa na Traçagem, no desenho técnico e no PNG técnico; nunca exportar os marcadores nem converter BEND em MARK.

## 2. Quadrado → Redondo em duas partes

- Corrigir a decomposição canônica para que as duas costuras atravessem os centros de faces opostas da base e os pontos correspondentes da boca circular, em vez de vértices/dobras.
- Inserir os pontos médios de divisão na geometria da superfície antes do desenvolvimento e gerar duas cadeias independentes e equivalentes.
- Produzir Parte A e Parte B com contorno, geratrizes, dobras, pontos, códigos `Q-R-001-A/B`, quantidade 1 e juntas de solda próprias.
- Alimentar o visualizador 3D existente com as faces corretamente atribuídas a A/B; manter visualização montada/explodida sem criar outro motor.
- Testar remontagem A+B contra a peça única: aberturas, altura, envelope, área, arestas de união, simetria e ausência de emenda sobre dobra.

## 3. PNG de Traçado como prancha técnica

- Identificar explicitamente no fluxo de exportação quando a origem é Traçagem; somente nesse caso o PNG usa a nova prancha.
- Criar um plano técnico independente do canvas: geometria completa, linhas de construção/dobra/geratrizes, pontos, identificações e cotas canônicas aplicáveis.
- Reutilizar o sistema de cotas existente e ampliar a composição para cotas lineares, alinhadas, radiais, diâmetros e ângulos já representáveis pelo modelo.
- Calcular limites incluindo cotas/chamadas, margem, orientação, escala e resolução; fundo branco e cores técnicas fixas.
- Usar o mesmo plano no preview e no arquivo final, com nome descritivo e metadados existentes. SVG, PDF e DXF não mudam.

## 4. Calculadora científica

- Remover apenas a barra visual Científica/Engenharia/Financeira/Estatística.
- Manter `%` no teclado principal e ajustar o avaliador para porcentagem convencional contextual: valor isolado e multiplicação usam fração; soma/subtração aplicam percentual sobre o operando à esquerda.
- Cobrir os nove exemplos fornecidos e executar regressão das demais operações, funções, memória e histórico.

## 5. Meus Modelos

- Evoluir cada item salvo para snapshot versionado contendo família, parâmetros atuais completos, estratégia de fabricação e datas.
- Garantir que o botão salve o estado real do configurador, não os defaults do catálogo.
- Restaurar o snapshot antes do recálculo ao abrir; oferecer salvar na mesma instância e salvar como novo, sem alterar o registro padrão.
- Migrar itens antigos de forma compatível e testar alteração, fechamento, reabertura e independência entre instâncias.

## 6. Aparência e idioma

- Remover Estático da interface e migrar valores `estatico`/legado para `suave` (ou `padrao` quando animação reduzida exigir fundo imóvel), preservando outras preferências.
- Adicionar destaque `Padrão`, com contraste neutro preto/branco por tema, sem afetar CUT, MARK, BEND, RECORTE ou DIMENSION.
- Separar `Idioma` da configuração regional usada por moeda/chapas; oferecer Português, English e Español, com português inicial e fallback.
- Introduzir uma camada central de tradução persistente e substituir textos visíveis por chaves em todas as áreas do aplicativo, por módulos, sem traduzir fórmulas, unidades ou papéis universais.
- Garantir atualização imediata, SSR/hidratação estáveis e ausência de chaves internas na tela.

## 7. Verificação

- Testes unitários para marcas BEND, grupos e exportação; geometria das duas metades; porcentagem; snapshots/migração; preferências e fallback de idioma.
- Verificação visual no CHAMFER e na Traçagem, preview/arquivo PNG, temas claro/escuro/AMOLED, desktop e mobile.
- Executar suíte completa e confirmar compilação sem erros antes de concluir.

## Detalhes técnicos

- A orientação das marcas BEND será obtida pela tangente da entidade CUT mais próxima de cada extremo, com fallback perpendicular à própria BEND somente quando não houver borda válida.
- A divisão do Quadrado → Redondo passa por centros de lados opostos e pontos angulares correspondentes da boca; esses pontos viram fronteiras de desenvolvimento, não linhas BEND.
- A internacionalização será incremental por dicionários tipados e fallback central; textos técnicos e dados persistidos continuam semanticamente estáveis.
