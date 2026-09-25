# CALDRA FREE e CALDRA PRO — integração definitiva

Objetivo: dois planos oficiais (FREE e PRO), uma única matriz central de recursos, bloqueios contextuais e tela de comparação atualizada. Nenhum cálculo, geometria, CHAMFER, motor 3D, traçagem ou exportador é reescrito.

## 1. Matriz central (fonte única)

O projeto já tem uma camada de permissões em `src/lib/subscription/features.ts` e o provedor `SubscriptionProvider`. Vou consolidar nela, sem criar um segundo sistema:

- Planos passam a ser apenas `free` e `pro`. Contas antigas gravadas como `mestre` ou `oficina` são lidas como `pro` (migração silenciosa, nenhum dado alterado).
- A matriz ganha os recursos que hoje faltam: CHAMFER VISION, importação/catálogo CNC 2D, DXF Técnico, DXF Laser CNC, PDF técnico, SVG, Oficina, cor de destaque, estilo de fundo, estudos avançados.
- Limites centralizados: `FREE_PROJECT_LIMIT = 5`, PRO ilimitado. O número 5 deixa de aparecer solto em telas.
- Helpers públicos: `hasFeature`, `getFeatureLimit`, `isPro`, `isFree`, além do `can` / `requirePro` já usados.

## 2. Free — o que fica livre

Calculadora completa, Biblioteca completa (fim do bloqueio por item), os quatro temas, os três idiomas, cor Azul, fundo Padrão, traçagem básica, Meus Modelos, PNG, SVG, projetos 1 a 5, estudos introdutórios.

Mudanças de padrão para instalação nova (nunca sobrescrevendo preferência já salva):

- tema inicial: Claro
- cor de destaque inicial: Azul
- estilo de fundo inicial: Padrão

## 3. Pro — o que é liberado

Traçagem avançada, CHAMFER completo, CHAMFER VISION, CNC 2D (importação e catálogo), PDF técnico, DXF Técnico, DXF Laser CNC, plano de corte, nesting, custos, orçamento, ficha de produção, Oficina inteira, estudos avançados, nuvem, versões, projetos ilimitados, cores de destaque adicionais, fundos Fluido e Suave.

O Catálogo de Projetos Paramétricos fica fora desta tarefa, exatamente como está hoje.

## 4. Paywall contextual

O convite por recurso já existe (`FEATURE_PITCH` + diálogo). Vou completá-lo:

- textos novos para cada recurso adicionado à matriz;
- CTA único em todo o app: **Conhecer o PRO**;
- Oficina passa a mostrar apresentação do recurso + convite, em vez de sumir;
- ao tentar criar o sexto projeto: "Você atingiu o limite de 5 projetos do plano Free." + "Ir para o PRO";
- em Configurações, cores extras e fundos Fluido/Suave abrem o convite em vez de aparecerem apenas apagados.

Sem convite para: calculadora, biblioteca, temas, idioma, azul, fundo padrão, traçagem básica, projetos 1–5.

## 5. Tela de planos

`/pro` e o diálogo passam a mostrar a tabela pedida, na ordem pedida, com valores reais lidos da matriz (5 / Ilimitado, Todos, Azul / Todas, 3 / 3). Cabeçalhos:

- CALDRA FREE — "O essencial para trabalhar no dia a dia." / "Comece a traçar, calcular e aprender."
- CALDRA PRO — "O laboratório completo: da medida ao arquivo que a máquina corta." / "Projete, fabrique e leve seu trabalho até o CNC."

Linguagem positiva para o Free, sem "limitado" ou "incompleto".

## 6. Limpeza e compatibilidade

- Varredura por checagens paralelas de plano (`isMestre`, `premium`, `plan === ...`) e migração para os helpers centrais.
- "Modo Mestre" nos textos de interface passa a se chamar PRO.
- "Região" já rotulada como Idioma é confirmada; nenhuma restrição de idioma.
- "Estático" não volta a existir no seletor de fundo.
- Nada é apagado: projetos, modelos, materiais, histórico, tema e idioma salvos permanecem.

## 7. Testes

Suíte nova em `src/lib/subscription/entitlements.test.ts` cobrindo a matriz Free (tudo liberado que deve estar, tudo bloqueado que deve estar, sexto projeto barrado) e Pro (tudo liberado, projetos ilimitados), mais a migração `mestre`/`oficina` → `pro`. Rodo os testes existentes e o typecheck para garantir que calculadora, traçagem, CHAMFER, DXF, exportações, temas e Oficina seguem funcionando.

## Detalhes técnicos

Arquivos principais tocados: `src/lib/subscription/features.ts`, `SubscriptionProvider.tsx`, `entitlementService.ts`, `src/components/chameleon/Paywall.tsx` e `ui.tsx`, `src/lib/settings/SettingsProvider.tsx`, `src/routes/configuracoes.tsx`, `oficina.tsx`, `projetos.index.tsx`, `biblioteca.tsx`, rotas de escola e os pontos de exportação em `GeometryStudio.tsx` / diálogos do CHAMFER. Motores de geometria, 3D, DXF e cálculo não são modificados.
