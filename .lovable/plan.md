# O que falta — Refinamento 3D + espessura e fabricação

## Já entregue e validado

- Auditoria geométrica dos cinco modelos (sem valores inválidos, duplicatas ou normais irregulares).
- Fase A: auditor puro do modelo 3D (`auditModel`) e testes.
- Fase C: eliminação do halo e do fantasma — sombra falsa removida por padrão, triângulos ordenados individualmente, interior só visível quando geometricamente observável, linhas de referência com o mesmo corte de profundidade das arestas. Validado visualmente com capturas.
- Base da Fase D2: camada de fabricação separada com tipos, matemática de dobra (`BA = θ × (R + K × T)`, OSSB, BD, linha neutra) e invalidação de derivados, com testes. 146 testes passando.

## O que falta (pendências desta evolução)

- Fase B: recortar a interseção real da Boca de Lobo usando a curva já calculada e viés por grupo de casca na ordenação.
- Fase C2: espessura real derivada do modelo canônico, sem parede fictícia onde o deslocamento não for confiável.
- Fase D: configuração visual central do visor e sombreamento por modelo.
- Fase E: modos Superfície / Superfície + arestas / Estrutura, Dobra e Linha neutra, vistas padrão e ajuste à tela.
- Fase F: seleção por identificador real, vínculo com o 2D e entrega do estado técnico da dobra ao CHAMFER.
- Fase G: performance (memorização de triangulação e ordenação, pausa fora da tela).
- Fase H: regressão matemática, visual e interativa final em claro, escuro e AMOLED.

## Fora desta evolução, ainda em aberto no projeto

- Credenciais do Google Play (conta de serviço e nome do pacote) e o segredo das notificações de assinatura — precisam ser fornecidos por você para ativar a validação real da assinatura PRO.
- Correções de interface do CHAMFER listadas no roadmap (contraste, barra lateral, polilinha, pan por dois dedos, propriedades, importação CNC 2D).
- Tradução progressiva das telas internas.

## Limites preservados

- Sem troca de renderizador, câmera, motor matemático, CHAMFER, exportadores, planos ou navegação.
- Nenhuma mudança visual pode alterar coordenadas canônicas ou resultados de fabricação.
