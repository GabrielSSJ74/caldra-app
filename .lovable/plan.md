# CALDRA — execução animada da Traçagem Guiada

Extensão incremental da Traçagem já existente. Os motores matemáticos, a geometria canônica, o CHAMFER, o 3D, exportadores, temas e a matriz Free/Pro permanecem intactos.

## Motor visual técnico 2D

- Evoluir `TraceStep.animation` para uma sequência tipada de ações: `MOVE`, `POSITION`, `OPEN`, `ROTATE`, `DRAW`, `TRANSFER`, `MARK`, `HIGHLIGHT`, `MEASURE` e `COMPLETE`.
- Cada ação referencia somente `geometryRefs` e medidas já calculadas. Um resolvedor converte essas referências em pontos, segmentos e trajetórias da `DevelopmentPattern`; nenhuma coordenada de fabricação será duplicada nos passos.
- Criar uma camada SVG sobre a vista de desenvolvimento para representar, em desenho técnico fino, riscador, régua, esquadro, compasso, transferidor, origem/destino e marcadores numerados.
- Revelar progressivamente apenas a geometria já executada. Linhas concluídas permanecem visíveis, a ação atual recebe contraste e o restante fica discreto. “Mostrar tudo” continua sendo a exceção explícita.
- Preservar permanentemente as cores técnicas existentes de corte, dobra, marcação, recorte e cotas; a animação acrescenta contorno, espessura e brilho temporários.

## Execução por ferramenta

- **Riscador:** posicionamento no início canônico, deslocamento até o fim e traço progressivo sobre o segmento ou percurso real.
- **Compasso:** centro e abertura derivados dos pontos/segmentos canônicos; sequência de posicionar, abrir, exibir o raio, girar e construir o percurso quando a geometria referenciada permitir arco.
- **Transferência:** destacar origem, capturar a distância calculada, deslocar o instrumento até o destino e marcar o ponto resultante.
- **Régua/esquadro:** alinhar à referência real, demonstrar projeção perpendicular/paralela e acompanhar o traçado.
- **Transferidor:** posicionar no vértice canônico, alinhar a base, indicar o ângulo derivado da trajetória e entregar o traçado ao riscador.
- **Pontos:** toque do instrumento, aparecimento progressivo do marcador e identificação canônica já existente.

## Reprodução e aprendizagem

- Controles de pausar, continuar, repetir, velocidades `0.5×`, `1×`, `2×` e modo `Passo a passo`, no qual “Próximo” avança uma ação por vez.
- **Ver como fazer:** reproduz ações e passos em sequência, anuncia `PASSO n/total` e termina em `DESENVOLVIMENTO CONCLUÍDO`.
- **Faça comigo:** apresenta uma ação por vez e aguarda interação no alvo canônico ou confirmação da medida real antes de prosseguir; acertos recebem confirmação curta e erros não alteram a geometria.
- Ao concluir, alternância entre **Desenvolvimento final** e **Como foi construído**, permitindo rever a sequência a qualquer momento.
- Respeitar redução de movimento do dispositivo, sem perder as instruções, a ordem ou os controles manuais.

## Estrutura técnica

- Adicionar tipos e construtor puro de ações ao módulo de Traçagem, mantendo `buildTraceSequence` determinístico.
- Criar um resolvedor geométrico puro para transformar referências existentes em trajetórias SVG e metadados de centro, raio, ângulo, origem e destino.
- Criar um componente focado no palco animado e um controlador de reprodução separado da apresentação do painel.
- Manter a regeneração automática: qualquer mudança de parâmetro recalcula a geometria atual, reconstrói passos e ações e reinicia a execução sem estado obsoleto.

## Validação

- Testar que todas as ações apontam para referências existentes e resolvem coordenadas finitas da geometria canônica.
- Testar trajetórias de linha, ponto, compasso, transferência, velocidade, pausa/continuação, repetição, passo a passo, sequência completa e regeneração ao alterar parâmetros.
- Verificar no celular e no desktop que instrumentos, instruções e controles não se sobrepõem.
- Executar testes do projeto e conferir a compilação após a implementação.

## Limite consciente

O modo “Faça comigo” valida toques e confirmações dentro da representação 2D. Ele não simula física, não movimenta ferramenta real e não cria uma oficina 3D; toda orientação continua vinculada à geometria calculada pelo CALDRA.
