# Refinamento profissional do 3D da Traçagem + espessura e fabricação

## Diagnóstico confirmado

- O visor da Traçagem é o `Wire3D`, um renderizador técnico SVG próprio. Ele não usa oclusão ambiente, mapa de sombra, buffer de profundidade nem materiais de GPU; desligar efeitos não corrigiria este caso.
- O halo inferior é uma elipse de "sombra de contato" desenhada pelo próprio visor.
- O efeito fantasma vem de superfícies externas e internas desenhadas juntas, ordenadas pela profundidade média de cada polígono. Em peças côncavas e em peças com corpos que se cruzam essa ordenação não resolve oclusão.
- Boca de Lobo, Tê e Y sobrepõem dois corpos inteiros sem recortar a interseção real, embora a curva de interseção já exista no cálculo.
- Arestas usam um corte grosseiro de linha oculta e as linhas de referência são desenhadas sempre por cima, reforçando o halo.
- Auditoria com parâmetros padrão: Cone 256 faces; Curva de Gomos 384; Quadrado → Redondo 88; Boca de Lobo 880; Redução 192. Sem valores inválidos, faces duplicadas, triângulos de área zero ou normais irregulares nesses casos.
- Hoje a espessura existe apenas como deslocamento aproximado da casca; não há camada de fabricação, dobra, linha neutra nem Fator K em nenhum motor.

## Fase A — diagnóstico reproduzível

- Auditor puro do modelo 3D: vértices, faces, triângulos, limites, degenerações, duplicatas, faces quase coincidentes, normais, orientação, aberturas e superfícies internas inesperadas.
- Central de diagnóstico apenas em desenvolvimento: normais, faces, estrutura, limites, identificadores e desligar a sombra artificial.
- Registrar a linha de base matemática dos cinco modelos para comparação antes/depois.

## Fase B — topologia, normais e identidade

- Estender face e aresta de forma retrocompatível com identificador, referência canônica, grupo técnico e modo de sombreamento.
- Triangulação determinística apenas na representação, sem mover vértices nem alterar medidas.
- Corrigir orientação por tipo de superfície e rejeitar faces degeneradas em vez de atribuir normal artificial.
- Propagar identidade real: faces e geratrizes do Quadrado → Redondo, gomos e junções da Curva, divisões de Cone e Redução, entidades de interseção da Boca de Lobo.
- Recortar a interseção real entre tubo e ramal usando a curva já calculada, sem alterar a equação.

## Fase C — eliminar o halo e o fantasma

- Remover a elipse de sombra como padrão; manter apenas como opção de diagnóstico desligada.
- Separar passes de superfície externa, interna, bordas e linhas técnicas.
- Visibilidade interna determinística: orientação da face, posição da câmera, pertencimento a uma abertura real e topologia. Bocas, terminações e regiões observáveis continuam mostrando o interior; nada é escondido em bloco.
- Ordenar triângulos com regra estável, com desempate por identidade e sem deslocar vértices.
- Aplicar às arestas e às linhas de referência o mesmo critério de profundidade das superfícies.

## Fase C2 — espessura real derivada do modelo canônico

- Representar externa, interna, borda e relação de espessura somente quando a espessura do modelo for válida e o deslocamento interno for geometricamente confiável.
- Onde não for confiável (ápices, cantos estreitos, raio menor que a espessura), manter representação de casca e registrar isso no diagnóstico; nunca inventar parede.
- Nenhuma espessura fictícia e nenhuma alteração de coordenada canônica ou de resultado de cálculo.

## Fase D — visual técnico centralizado

- Configuração única do visor: qualidade, iluminação, material de chapa, arestas, seleção e níveis para celular e desktop.
- Preservar os tokens de chapa, ajustando contraste para fundo claro, escuro e AMOLED, sem usar a cor do tema como significado técnico.
- Sombreamento por modelo: facetado no Quadrado → Redondo, contínuo em Cone e Redução, híbrido com junções explícitas na Curva de Gomos e na Boca de Lobo.
- Iluminação uniforme a partir das normais reais, sem brilho fotográfico, textura, ferrugem ou contraste dramático.

## Fase D2 — separação Geometria × Fabricação

- Criar uma camada de fabricação independente do motor geométrico: espessura, dobras, raio interno, ângulo, linha neutra, Fator K, allowance e deduction.
- A geometria continua responsável por forma, superfícies, dimensões, interseções, planificação geométrica e relações paramétricas.
- Superfície desenvolvível (cone, cilindro, transição) mantém planificação puramente geométrica mesmo com espessura no projeto. Compensação de dobra só entra em peça efetivamente dobrada.
- Fator K com a relação `BA = θ × (R + K × T)`, com K padrão do projeto e K específico por dobra quando informado. Sem valor universal, sem valor embutido e sem conversão inventada entre K e Y.
- Métodos de desenvolvimento configuráveis, exibindo apenas os efetivamente suportados. Fator Y e tabela de oficina ficam previstos na estrutura, sem opção falsa na interface.
- Estrutura preparada para a Biblioteca de Dobra (material, espessura, processo, ferramenta, raio, ângulo, K, Y, allowance, deduction) sem popular tabelas não validadas.
- Sem dado validado: entrada manual, identificação clara como parâmetro de fabricação e nenhuma afirmação de adequação a máquina ou processo.

## Fase E — arestas, vistas e enquadramento

- Modos `Superfície`, `Superfície + arestas` e `Estrutura`; o último mostra contornos, geratrizes, divisões, juntas e referências reais.
- Onde houver dobra real com dados suficientes, modos `Dobra` e `Linha neutra`: região da dobra, raio interno, ângulo, espessura, posição `R + K × T` e o K aplicado. Só aparecem quando os dados existem.
- Vistas ISO, frontal, traseira, superior, inferior, esquerda, direita, ajustar à tela e resetar, usando a câmera existente.
- Preservar órbita e zoom; pan apenas onde não conflitar com seleção e toque. Pinça e arraste estáveis no celular.
- Recalcular enquadramento só quando modelo ou vista mudar, com margem estável e sem cortar a peça.

## Fase F — seleção, 2D, fabricação e planificação

- Selecionar face, gomo ou componente pelo identificador real, com destaque temporário por contorno, espessura e rótulo, preservando a cor técnica.
- Vínculo opcional entre face, referência geométrica e entidade 2D, sem referências inventadas.
- Entregar ao CHAMFER o estado técnico da dobra (identificador, ângulo, raio interno, espessura, K, linha neutra, allowance, deduction e método) como dado, nunca como rótulo visual.
- Alterar espessura, raio, ângulo, K ou método recalcula linha neutra, desenvolvimento de fabricação, 2D, 3D, cotas e CHAMFER, marca os derivados afetados como desatualizados e preserva a revisão anterior.
- Desdobramento animado somente onde existir correspondência matemática válida; nos demais, transição simples com geometria correta.

## Fase G — performance

- Manter o 3D sob demanda; nenhum modelo pré-carregado na abertura do aplicativo.
- Memorizar triangulação, normais, classificação de faces e estilos; durante a órbita atualizar apenas projeção e ordenação.
- O nível de detalhe altera apenas apresentação: rótulos, arestas secundárias, marcadores e referências. Medidas, vértices, faces principais, geratrizes, interseções e planificação nunca mudam com zoom, órbita ou troca de vista.
- Pausar animação fora da tela, respeitar redução de movimento e evitar recriação de objetos por quadro.

## Fase H — validação e regressão

- Testes do auditor, orientação, normais, identificadores, contagens, limites e invariância dos cálculos nos cinco modelos.
- Testes de fabricação: peça sem dobra, uma dobra, múltiplas dobras, variação de espessura, de K, de raio e de ângulo, verificando linha neutra, desenvolvimento, 2D, 3D, dados entregues ao CHAMFER e invalidação de derivados.
- Comparação visual em fundo claro, escuro e AMOLED, em vistas e zooms extremos, provando ausência do halo e do fantasma.
- Testar modos técnicos, seleção, vistas, enquadramento, planificação e retorno ao 3D em celular e desktop.
- Executar testes completos e confirmar compilação ao fim de cada fase; uma fase só avança preservando parâmetros, limites, referências, comprimentos e planificação.

## Limites preservados

- Sem troca de renderizador, câmera, motor matemático, CHAMFER, exportadores, assinatura, planos ou navegação.
- Nenhuma mudança visual pode alterar coordenadas canônicas ou resultados de fabricação.
- Prioridade fixa: geometria, espessura, dobra, linha neutra, Fator K, planificação de fabricação, visualização, CHAMFER, desempenho e só então estética.
- As imagens enviadas e as capturas reproduzidas servem apenas como referência do problema.
