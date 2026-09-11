# Catálogo de Projetos Paramétricos

## Direção aprovada
- A entrada de **PROJETOS** terá duas abas: **Catálogo** e **Meus projetos**.
- Os dossiês existentes, seus dados e todos os painéis atuais serão preservados.
- Serão preparados três modelos reais: **Escada reta**, **Plataforma industrial** e **Suporte de tubulação**.
- Escada e Plataforma serão concluídas primeiro; após regressão, o Suporte reutilizará a mesma arquitetura.

## Arquitetura
Cada modelo terá uma função pura única:

```text
parâmetros
  ↓
gerador paramétrico do projeto
  ├─ desenho técnico 2D e cotas
  ├─ modelo 3D e vistas ortográficas
  ├─ árvore conjunto → subconjunto → peça
  ├─ peças fabricáveis e geometria CNC
  ├─ BOM e lista de corte
  └─ sequência de montagem
            ↓
     instância no dossiê existente
            ↓
     CHAMFER / fabricação / campo
```

O catálogo guarda apenas definições imutáveis. Ao salvar, o CALDRA cria um dossiê independente com os parâmetros escolhidos e as peças geradas. Alterar o catálogo nunca modifica projetos já salvos.

## Entrega
1. Criar o registro do catálogo, filtros, busca, favoritos e recentes, sem misturá-lo ao registro de peças da Traçagem.
2. Transformar a tela de Projetos em duas abas, mantendo **Meus projetos** funcional e adicionando um catálogo técnico com previews vetoriais reais.
3. Criar uma rota própria para configurar cada modelo, com formulário específico e validação por projeto.
4. Implementar um núcleo geométrico compartilhado para cada modelo, do qual derivam 2D, 3D, dimensões, componentes e cálculos.
5. Implementar visualizador 2D com zoom, pan, fit, cotas e seleção sincronizada.
6. Implementar visualizador 3D interativo com reset e vistas 3D, frontal, superior e lateral; seleção sincronizada com 2D e lista.
7. Implementar vista explodida e decomposição com códigos, função, conjunto, etapa, material, quantidade e dimensões.
8. Gerar resumo, BOM, lista de corte, fabricação e montagem diretamente do resultado paramétrico.
9. Salvar a configuração em **Meus projetos**, usando o store atual, conjuntos, subconjuntos, peças e histórico.
10. Encaminhar as entidades reais das peças compatíveis ao CHAMFER e às exportações existentes, sem screenshots.
11. Validar Escada e Plataforma; então adicionar o Suporte de Tubulação pelo mesmo contrato e executar regressão geral.

## Arquivos novos previstos
- `src/lib/project-catalog/types.ts` — contrato único do modelo e resultado gerado.
- `src/lib/project-catalog/registry.ts` — categorias, busca, filtros e registro dos três modelos.
- `src/lib/project-catalog/stairs.ts` — cálculo e geometria canônica da Escada Reta.
- `src/lib/project-catalog/platform.ts` — cálculo e geometria canônica da Plataforma Industrial.
- `src/lib/project-catalog/pipe-support.ts` — cálculo e geometria canônica do Suporte de Tubulação.
- `src/lib/project-catalog/preferences.ts` — favoritos e recentes locais.
- `src/lib/project-catalog/save.ts` — conversão transacional do resultado em dossiê existente.
- `src/components/projects/catalog/ProjectCatalog.tsx` — catálogo técnico, busca e filtros.
- `src/components/projects/catalog/ProjectConfigurator.tsx` — parâmetros e fluxo de cálculo/salvamento.
- `src/components/projects/catalog/ProjectDrawing2D.tsx` — desenho técnico interativo.
- `src/components/projects/catalog/ProjectModel3D.tsx` — visualização 3D e vistas padronizadas.
- `src/components/projects/catalog/ProjectBreakdown.tsx` — decomposição, fabricação, BOM e montagem.
- `src/routes/projetos.catalogo.$slug.tsx` — área própria do modelo paramétrico.

## Arquivos existentes a modificar
- `src/routes/projetos.index.tsx` — adicionar as abas Catálogo / Meus projetos, preservando a lista atual.
- `src/lib/projects/store.ts` — aceitar criação atômica de um dossiê gerado e metadados opcionais de origem, com migração aditiva.
- `src/lib/projects/bom.ts` — reconhecer peças estruturais geradas pelo catálogo sem alterar engines atuais.
- `src/lib/projects/chamfer.ts` — encaminhar a geometria CNC canônica gerada pelo catálogo.
- `src/lib/projects/assemblySteps.ts` — usar etapas explícitas do modelo quando existirem e manter a derivação atual como fallback.
- `src/components/projects/ExplodedView.tsx` — usar posições 3D canônicas quando o dossiê vier do catálogo e manter a vista atual nos demais.
- `roadmap.md` — registrar e acompanhar esta evolução separadamente.

## Compatibilidade e validação
- Nenhum `modelId`, projeto salvo, desenho CHAMFER ou chave local existente será removido ou reinterpretado.
- O registro de peças e as engines de Traçagem continuam intactos; o catálogo de projetos apenas os compõe.
- Projetos antigos continuam usando os fallbacks atuais de BOM, vista explodida e montagem.
- Verificar cálculo determinístico, igualdade 2D/3D/BOM, persistência, favoritos/recentes, seleção sincronizada, abertura no CHAMFER e responsividade em celular/paisagem.
- Executar typecheck, build, testes das funções puras e fluxo visual completo no navegador.
