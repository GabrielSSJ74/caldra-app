import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeRealNestingProof,
  dismissProPromoFor7Days,
  formatCleanProjectStatus,
  formatProjectPartsSubtitle,
  formatRealHeaderProjectStatus,
  getCatalogModelsCount,
  getHomeQuickShortcuts,
  getVerifiedProDeliverables,
  isProPromoDismissed,
  PRO_PROMO_DISMISS_TTL_MS,
  resolveHomeAcademyCardState,
  resolveHomeProjectsViewModel,
  resolveProjectThumbnailKind,
} from "../homeWorkshopEngine";
import type { Project } from "@/lib/projects/store";
import type { StorageLike } from "@/lib/settings/appearancePreferences";

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function makeFakeProject(overrides: Partial<Project>): Project {
  return {
    id: overrides.id ?? "proj-1",
    code: overrides.code ?? "PRJ-001",
    name: overrides.name ?? "Projeto Teste",
    status: overrides.status ?? "em-desenvolvimento",
    createdAt: overrides.createdAt ?? 1000,
    updatedAt: overrides.updatedAt ?? 2000,
    parts: overrides.parts ?? [],
  };
}

describe("homeWorkshopEngine — Regras Puras da Home Oficina Digital", () => {
  it("1. Retorna contagem dinâmica real de 48 modelos do catálogo PART_REGISTRY", () => {
    const count = getCatalogModelsCount();
    assert.equal(count, 48);
  });

  it("2. Formata o status real do cabeçalho sem inventar projetos fictícios", () => {
    assert.equal(formatRealHeaderProjectStatus(0), "Pronto para iniciar");
    assert.equal(formatRealHeaderProjectStatus(1), "1 projeto ativo");
    assert.equal(formatRealHeaderProjectStatus(4), "4 projetos ativos");
  });

  it("3. Trata explicitamente projetos com 0 peças com mensagem instrutiva clara", () => {
    assert.equal(
      formatProjectPartsSubtitle(0),
      "Nenhuma peça ainda • Toque para adicionar",
    );
    assert.equal(formatProjectPartsSubtitle(1), "1 peça cadastrada");
    assert.equal(formatProjectPartsSubtitle(3), "3 peças cadastradas");
  });

  it("4. Estado B (Usuário Novo, 0 projetos): oculta seção Continue trabalhando e retorna heroProject nulo", () => {
    const vm = resolveHomeProjectsViewModel([]);
    assert.equal(vm.isRecurringUser, false);
    assert.equal(vm.totalProjectsCount, 0);
    assert.equal(vm.heroProject, null);
    assert.equal(vm.showContinueWorkingSection, false);
    assert.equal(vm.continueWorkingProjects.length, 0);
  });

  it("5. Estado A (Usuário Recorrente): aplica Regra Anti-Duplicação entre Hero e Continue trabalhando", () => {
    const p1 = makeFakeProject({
      id: "p-chamine",
      code: "CHA-001",
      name: "Chaminé Industrial",
      updatedAt: 5000,
      parts: [
        {
          id: "part-1",
          modelId: "tronco-de-cone",
          name: "Redução Cônica",
          inputs: {},
          quantity: 1,
          createdAt: 1000,
        },
      ],
    });
    const p2 = makeFakeProject({
      id: "p-flange",
      code: "FLA-001",
      name: "Flange DN 150",
      updatedAt: 4000,
      parts: [
        {
          id: "part-2",
          modelId: "flange-cego",
          name: "Flange Cego",
          inputs: {},
          quantity: 2,
          createdAt: 1000,
        },
      ],
    });
    const p3 = makeFakeProject({
      id: "p-hhhhh",
      code: "PRJ-003",
      name: "Hhhhh",
      updatedAt: 3000,
      parts: [],
    });

    const vm = resolveHomeProjectsViewModel([p3, p1, p2]);
    assert.equal(vm.isRecurringUser, true);
    assert.equal(vm.totalProjectsCount, 3);
    assert.equal(vm.heroProject?.id, "p-chamine");
    assert.equal(vm.showContinueWorkingSection, true);

    const continueIds = vm.continueWorkingProjects.map((item) => item.project.id);
    assert.deepEqual(continueIds, ["p-flange", "p-hhhhh"]);
    assert.equal(
      continueIds.includes(vm.heroProject!.id),
      false,
      "O projeto exibido no Hero nunca deve se repetir na lista Continue trabalhando",
    );
  });

  it("6. Miniaturas Técnicas Fiéis: 'Hhhhh (0 peças)' e 'Chaminé Industrial (3 peças)' nunca exibem a mesma miniatura de cone", () => {
    const hhhhh = makeFakeProject({
      id: "p-hhhhh",
      code: "PRJ-003",
      name: "Hhhhh",
      parts: [],
    });
    const chamine = makeFakeProject({
      id: "p-chamine",
      code: "CHA-001",
      name: "Chaminé Industrial",
      parts: [
        {
          id: "1",
          modelId: "tronco-de-cone",
          name: "Cone",
          inputs: {},
          quantity: 3,
          createdAt: 1000,
        },
      ],
    });
    const flange = makeFakeProject({
      id: "p-flange",
      code: "FLA-001",
      name: "Flange Circular Furado",
      parts: [
        {
          id: "2",
          modelId: "anel-flange",
          name: "Anel",
          inputs: {},
          quantity: 1,
          createdAt: 1000,
        },
      ],
    });

    const kindHhhhh = resolveProjectThumbnailKind(hhhhh);
    const kindChamine = resolveProjectThumbnailKind(chamine);
    const kindFlange = resolveProjectThumbnailKind(flange);

    assert.equal(kindHhhhh, "empty-draft");
    assert.equal(kindChamine, "chimney-cone");
    assert.equal(kindFlange, "flange-ring");
    assert.notEqual(kindHhhhh, kindChamine);
  });

  it("7. Calcula prova real de Nesting CNC com nestParts (12 peças 620x430mm em chapa 3000x1500mm -> 71,1%)", () => {
    const proof = computeRealNestingProof();
    assert.equal(proof.partCount, 12);
    assert.equal(proof.sheetsUsed, 1);
    assert.equal(proof.utilizationPctFormatted, "71,1%");
    assert.match(proof.summaryText, /71,1% de aproveitamento \(1 chapa\)/);
  });

  it("8. Verifica entregáveis do Caldra PRO contra a matriz real de features e catálogo de 48 modelos", () => {
    const deliverables = getVerifiedProDeliverables();
    assert.equal(deliverables.length, 4);
    assert.ok(deliverables.every((d) => d.isProExclusive));
    assert.ok(deliverables.some((d) => d.title.includes("48 Modelos 1:1")));
  });

  it("9. Respeita memória local de 7 dias do botão 'Agora não' no card de conversão PRO", () => {
    const storage = createMemoryStorage();
    const t0 = 1_700_000_000_000;

    assert.equal(isProPromoDismissed(storage, t0), false);
    dismissProPromoFor7Days(storage, t0);
    assert.equal(isProPromoDismissed(storage, t0 + 1000), true);
    assert.equal(
      isProPromoDismissed(storage, t0 + PRO_PROMO_DISMISS_TTL_MS - 1000),
      true,
    );
    assert.equal(
      isProPromoDismissed(storage, t0 + PRO_PROMO_DISMISS_TTL_MS + 1000),
      false,
    );
  });

  it("10. Resolve o Card Contextual da Academia para usuário iniciante e usuário com progresso", () => {
    const freshAcademy = resolveHomeAcademyCardState({
      lessons: {},
      xp: 0,
      streakDays: 0,
    });
    assert.equal(freshAcademy.hasStarted, false);
    assert.equal(freshAcademy.ctaLabel, "Acessar Academia →");
    assert.equal(
      freshAcademy.title,
      "Métodos de Traçado, Planificação e Tabelas NBR",
    );

    const activeAcademy = resolveHomeAcademyCardState({
      lessons: {
        "fund-leitura-desenho": {
          lessonId: "fund-leitura-desenho",
          mastery: "dominado",
          quizBest: 100,
          practiceDone: true,
          updatedAt: 2000,
        },
      },
      xp: 120,
      streakDays: 2,
    });
    assert.equal(activeAcademy.hasStarted, true);
    assert.equal(activeAcademy.completedLessons, 1);
    assert.equal(activeAcademy.ctaLabel, "Continuar Aula →");
    assert.match(activeAcademy.eyebrow, /1 de \d+ lições concluídas/);
  });

  it("11. Constrói os 4 cartões de Atalhos Rápidos com contagem real e badges PRO discretos para plano Free", () => {
    const freeShortcuts = getHomeQuickShortcuts("free");
    assert.equal(freeShortcuts.length, 4);
    assert.equal(freeShortcuts[1]?.subtitle, "48 modelos de caldeiraria");
    assert.equal(freeShortcuts[2]?.requiresProBadge, true);
    assert.equal(freeShortcuts[3]?.requiresProBadge, true);

    const proShortcuts = getHomeQuickShortcuts("pro");
    assert.equal(proShortcuts[2]?.requiresProBadge, false);
    assert.equal(proShortcuts[3]?.requiresProBadge, false);

    const statusInfo = formatCleanProjectStatus("em-desenvolvimento");
    assert.equal(statusInfo.label, "Em projeto");
  });
});
