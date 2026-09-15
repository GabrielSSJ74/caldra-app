# CALDRA — Traçagem Guiada, vínculo parâmetro↔geometria e assinatura confiável

Evolução aditiva em três pilares. Nada do que já funciona é reescrito: motores de cálculo,
CHAMFER, 2D/3D, modelo paramétrico, temas e a matriz Free/Pro permanecem como estão.

## Pilar 1 — Traçagem Guiada

Nova camada que **lê** a geometria já calculada e a transforma numa sequência de passos
para riscar a chapa na bancada. Nenhum cálculo novo: os passos apontam para linhas,
pontos e cotas que o motor atual já produz.

- Nova aba **TRAÇAGEM** ao lado de Resultado, Planificação e 3D, dentro do estúdio atual.
- Sequência padrão por modelo: linha de referência → divisão → geratrizes → transferência
  de medidas → contorno → marcação final → "desenvolvimento concluído".
- Cada passo mostra: título, instrução curta, medida envolvida, de onde a medida vem,
  ferramenta sugerida (régua, riscador, compasso, esquadro) e destaque no desenho.
- Controles: Anterior, Próximo, Repetir, Mostrar tudo, Ocultar instruções e reprodução
  automática opcional (nunca obrigatória).
- **Modo Bancada**: paleta visual de ferramentas pedagógicas que indicam onde posicionar,
  de onde medir e para onde transferir. É orientação visual, não simulação física.
- Modelos na primeira entrega: Quadrado→Redondo, Cone/Tronco, Reduções, Curva de Gomos,
  Boca de Lobo. Os demais entram depois, reaproveitando a mesma estrutura.
- Mudou um parâmetro, a sequência se regenera sozinha — ela é derivada, nunca digitada.

## Pilar 2 — Parâmetro ↔ cota ↔ desenho

- Cada entidade do desenho ganha uma referência estável, ligada ao campo que a controla.
- Tocar ou editar um campo destaca a linha/arco/ponto correspondente, a cota associada e
  o próprio campo; o restante do desenho é atenuado, nunca apagado.
- Três estados: normal, foco e isolado. Trocar de campo limpa o destaque anterior.
- O destaque é temporário e some ao perder o foco: CORTE, MARCAÇÃO, DOBRA, RECORTE e COTA
  mantêm as cores técnicas. Cor de tema nunca substitui cor técnica.
- Acessibilidade: o destaque usa também espessura, brilho, contorno e rótulo — não só cor,
  com intensidade ajustável para quem enxerga pouco.
- O mesmo destaque acende no 2D, na etapa correspondente da Traçagem, e no 3D/CHAMFER
  quando existir relação disponível.

## Pilar 3 — Assinatura PRO que não se perde

Hoje o plano é decidido por cache local mais uma leitura simples do perfil. Passa a existir
um registro de assinatura no servidor como única autoridade.

- Registro por conta com: loja, produto, token de compra, token relacionado, situação,
  direito concedido, início, validade, renovação automática, última verificação, ambiente.
- Situações reais da loja: ativa, cancelada, período de carência, retida, pausada,
  expirada, pendente.
- Compra: o app envia o comprovante ao servidor, o servidor confirma com a Google e só
  então concede o PRO. O app nunca concede sozinho.
- Falha de rede, tempo esgotado ou resposta incompleta **não** rebaixam ninguém para FREE.
  O acesso só cai quando o servidor confirma que a assinatura realmente terminou.
- Endpoint preparado para receber as notificações de ciclo de vida da Google (renovação,
  cancelamento, carência, retenção, expiração). A notificação apenas dispara uma nova
  consulta à Google; o estado completo vem sempre da consulta.
- Trocar de aparelho ou sair e entrar na conta preserva o acesso: ele pertence à conta.
- Em Configurações → **Minha assinatura**: plano, situação, validade, última sincronização,
  botões Restaurar compras e Verificar assinatura. Verificar apenas ressincroniza, nunca
  concede acesso. O token de compra nunca aparece para o usuário.
- Mensagem clara na falha: "Não foi possível sincronizar agora. Seu acesso atual permanece
  preservado enquanto a assinatura estiver válida."

A matriz Free/Pro atual continua intacta e segue sendo o único lugar de decisão de acesso.

## Detalhes técnicos

- `src/lib/tracagem/steps.ts`: tipo `TraceStep { id, title, instruction, geometryRefs[],
  measurements[], tool, order, animation, validation }` + `buildTraceSequence(slug, result)`
  puro, derivado de `GeometryResult` (`development`, `foldLines`, `points`, `trueLengths`,
  `steps`). Um provider por modelo em `src/lib/tracagem/models/*.ts`.
- `src/lib/geometry/refs.ts`: `GeometryRef` estável (`line:<i>`, `point:<id>`, `dim:<field>`)
  + `linkFieldToRefs(slug, values)`; consumido por Traçagem, cotas e realce.
- UI: `src/components/chameleon/TracagemPanel.tsx` (passos + controles + Modo Bancada) e
  `src/components/chameleon/BenchTools.tsx`. Aba adicionada em `GeometryStudio` e
  `SquareToRoundStudio` sem mexer nas abas existentes.
- Realce: `HighlightProvider` (contexto leve) + prop `highlight` já existente em
  `SchematicViews`/`ParametricDiagram` estendida para `{ refs, level: normal|focus|isolated }`.
  Overlay de realce desenhado por cima, cores semânticas preservadas.
- Backend: migração criando `public.subscriptions` (grants + RLS por `auth.uid()`),
  função `resolve_entitlement(user)` e ampliação de `profiles.plan` sem quebrar dados atuais.
  Server functions `verifyPurchase`, `syncEntitlement`, `restorePurchases`; rota pública
  `src/routes/api/public/rtdn.ts` validando a assinatura da mensagem.
  `entitlementService.ts` passa a distinguir `sync_ok | sync_failed | offline` e só rebaixa
  o plano com resposta conclusiva do servidor.
- Testes (Vitest): sequência determinística, refs existentes, regeneração ao mudar
  parâmetro, mapeamento campo→cota→entidade, restauração de cor, e máquina de estados da
  assinatura (compra, renovação, cancelamento, carência, retenção, expiração, falha de
  rede, troca de aparelho, restauração, token relacionado, notificação).

## Ordem de entrega

1. Referências de geometria + vínculo parâmetro↔cota↔desenho (com testes).
2. Traçagem Guiada: motor de passos, aba, controles, Modo Bancada, 5 modelos (com testes).
3. Assinatura: tabela, verificação no servidor, endpoint de notificações, tela Minha
   assinatura, política anti-rebaixamento (com testes).

## Dependência externa

A verificação real na Google Play exige uma credencial de conta de serviço do Google Play
Console. Vou deixar toda a estrutura pronta e pedir essa credencial na hora de ligar a
verificação; até lá a validação roda em modo de ambiente de teste, sem conceder PRO
indevidamente.
