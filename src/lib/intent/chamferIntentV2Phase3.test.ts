import { describe, it, expect } from "vitest";
import {
  createConversationThread,
  appendUserAndAssistantTurn,
  commitMessageCardToVersion,
  branchConversationFromEditedUserMessage,
  restoreVersionFromThread,
  recordAssistantMessageFeedback,
  buildDynamicParameterFields,
  buildSuggestedNextSteps,
  matchSlashCommands,
  saveConversationThread,
  listProjectConversations,
  renameConversationThread,
  deleteConversationThread,
  exportConversationPayload,
  listSavedFeedbackEntries,
  ChamferIntentInterpreter,
} from "./index";

describe("CHAMFER INTENT 2.0 — Fase 3 (Claude §4: Chat Completo, Cartões, Versões e Ramificação)", () => {
  it("1. Gerencia ciclo completo de conversas por projeto (criar, salvar, buscar, renomear, exportar e excluir)", () => {
    const projectId = `proj-test-${Date.now()}`;
    const thread = createConversationThread(projectId, "Suporte Motor M12");
    saveConversationThread(thread);

    const listed = listProjectConversations(projectId);
    expect(listed.length).toBe(1);
    expect(listed[0]?.title).toBe("Suporte Motor M12");

    const renamed = renameConversationThread(thread.id, "Base Bomba Hidráulica");
    expect(renamed?.title).toBe("Base Bomba Hidráulica");

    const searched = listProjectConversations(projectId, "Bomba");
    expect(searched.length).toBe(1);

    const exportedJson = JSON.parse(exportConversationPayload(renamed!, "json"));
    expect(exportedJson.schema).toBe("chamfer_intent_conversation_v2");
    expect(exportedJson.conversation.title).toBe("Base Bomba Hidráulica");

    const deleted = deleteConversationThread(thread.id);
    expect(deleted).toBe(true);
    expect(listProjectConversations(projectId).length).toBe(0);
  });

  it("2. Registra turnos user/assistant, cria versões restauráveis (V1, V2) e permite restaurar em 1 clique", () => {
    let thread = createConversationThread("proj-v", "Nova Conversa CAD");

    const plan1 = ChamferIntentInterpreter.compilePrompt(
      "Chapa 400 x 250 com 4 furos de 12 mm a 25 mm das bordas",
      {
        existingEntities: [],
        selectedEntityIds: [],
        activeLayer: "corte",
      },
    );

    const turn1 = appendUserAndAssistantTurn(thread, {
      userPrompt: "Chapa 400 x 250 com 4 furos de 12 mm a 25 mm das bordas",
      assistantContent: plan1.response_summary,
      plan: plan1,
      committed: true,
      entitiesAfterCommit: plan1.compiled?.previewEntities ?? [],
      dimensionsAfterCommit: plan1.compiled?.generatedDimensions ?? [],
    });

    thread = turn1.updatedThread;
    expect(thread.messages.length).toBe(2);
    expect(thread.versions.length).toBe(1);
    expect(thread.activeVersionId).toBe("V1");
    expect(turn1.assistantMessage.committedVersionId).toBe("V1");

    // Turno 2 inicialmente pendente, depois aplicado via botão "Aplicar" do Cartão
    const plan2 = ChamferIntentInterpreter.compilePrompt("Aumente a chapa para 600 x 300 mm", {
      existingEntities: plan1.compiled?.previewEntities ?? [],
      selectedEntityIds: [],
      activeLayer: "corte",
    });

    const turn2 = appendUserAndAssistantTurn(thread, {
      userPrompt: "Aumente a chapa para 600 x 300 mm",
      assistantContent: plan2.response_summary,
      plan: plan2,
      committed: false,
    });
    thread = turn2.updatedThread;
    expect(thread.versions.length).toBe(1);

    const committed2 = commitMessageCardToVersion(thread, turn2.assistantMessage.id, {
      entities: plan2.compiled?.previewEntities ?? [],
      dimensions: plan2.compiled?.generatedDimensions ?? [],
      plan: plan2,
    });
    thread = committed2.updatedThread;
    expect(thread.versions.length).toBe(2);
    expect(thread.activeVersionId).toBe("V2");

    // Restaura V1 em 1 clique
    const restored = restoreVersionFromThread(thread, "V1");
    expect(restored.updatedThread.activeVersionId).toBe("V1");
    expect(restored.snapshot?.versionId).toBe("V1");
    expect(restored.snapshot?.entitiesSnapshot.length).toBe(
      plan1.compiled?.previewEntities.length,
    );
  });

  it("3. Cria ramificação (branch) ao editar uma mensagem anterior do usuário e restaura a versão anterior", () => {
    let thread = createConversationThread("proj-branch", "Teste Branch");
    const plan1 = ChamferIntentInterpreter.compilePrompt("Chapa 300 x 200", {
      existingEntities: [],
      selectedEntityIds: [],
      activeLayer: "corte",
    });
    const t1 = appendUserAndAssistantTurn(thread, {
      userPrompt: "Chapa 300 x 200",
      assistantContent: plan1.response_summary,
      plan: plan1,
      committed: true,
      entitiesAfterCommit: plan1.compiled?.previewEntities ?? [],
    });
    thread = t1.updatedThread;

    const plan2 = ChamferIntentInterpreter.compilePrompt("Chapa 500 x 400", {
      existingEntities: [],
      selectedEntityIds: [],
      activeLayer: "corte",
    });
    const t2 = appendUserAndAssistantTurn(thread, {
      userPrompt: "Chapa 500 x 400",
      assistantContent: plan2.response_summary,
      plan: plan2,
      committed: true,
      entitiesAfterCommit: plan2.compiled?.previewEntities ?? [],
    });
    thread = t2.updatedThread;
    expect(thread.versions.map((v) => v.versionId)).toEqual(["V1", "V2"]);

    // Edita a 2ª mensagem do usuário (t2.userMessage.id)
    const branched = branchConversationFromEditedUserMessage(thread, t2.userMessage.id);
    expect(branched.discardedCommitCount).toBe(1);
    expect(branched.updatedThread.messages.length).toBe(2); // Manteve apenas turno 1
    expect(branched.updatedThread.versions.map((v) => v.versionId)).toEqual(["V1"]);
    expect(branched.updatedThread.activeVersionId).toBe("V1");
    expect(branched.updatedThread.branches.length).toBe(1);
  });

  it("4. Gera dinamicamente os campos de parâmetros do Cartão de Peça conforme a operação (chapa, flange, cone, quadrado-para-redondo)", () => {
    const platePlan = ChamferIntentInterpreter.compilePrompt(
      "Chapa 400x250 com 4 furos de 12 mm",
      { existingEntities: [], selectedEntityIds: [], activeLayer: "corte" },
    );
    const plateForm = buildDynamicParameterFields(platePlan);
    expect(plateForm.family).toBe("plate");
    expect(plateForm.fields.map((f) => f.key)).toContain("width");
    expect(plateForm.fields.map((f) => f.key)).toContain("corner_selector");

    const flangePlan = ChamferIntentInterpreter.compilePrompt(
      "Flange externo 400 interno 200 com PCD 320 e 8 furos de 18 mm",
      { existingEntities: [], selectedEntityIds: [], activeLayer: "corte" },
    );
    const flangeForm = buildDynamicParameterFields(flangePlan);
    expect(flangeForm.family).toBe("flange");
    expect(flangeForm.fields.map((f) => f.key)).toEqual([
      "outer_diameter",
      "inner_diameter",
      "pcd",
      "hole_count",
      "hole_diameter",
    ]);

    const conePlan = ChamferIntentInterpreter.compilePrompt(
      "Tronco de cone base 500 topo 250 altura 350",
      { existingEntities: [], selectedEntityIds: [], activeLayer: "corte" },
    );
    const coneForm = buildDynamicParameterFields(conePlan);
    expect(coneForm.family).toBe("boilermaking_cone");
    expect(coneForm.fields.map((f) => f.key)).toContain("base_diameter");
    expect(coneForm.fields.map((f) => f.key)).toContain("top_diameter");

    const sqToRoundPlan = ChamferIntentInterpreter.compilePrompt(
      "Transição quadrado 400 para redondo 250 altura 300",
      { existingEntities: [], selectedEntityIds: [], activeLayer: "corte" },
    );
    const sqForm = buildDynamicParameterFields(sqToRoundPlan);
    expect(sqForm.family).toBe("boilermaking_square_to_round");
    expect(sqForm.fields.map((f) => f.key)).toContain("square_width");
    expect(sqForm.fields.map((f) => f.key)).toContain("round_diameter");
  });

  it("5. Filtra comandos rápidos de barra (/) e gera próximos passos contextuais + feedback 👍/👎", () => {
    const slashAll = matchSlashCommands("/");
    expect(slashAll.length).toBe(6);
    const slashUndo = matchSlashCommands("/desf");
    expect(slashUndo.map((s) => s.command)).toEqual(["/desfazer"]);

    const plan = ChamferIntentInterpreter.compilePrompt("Chapa 400x250 sem furos", {
      existingEntities: [],
      selectedEntityIds: [],
      activeLayer: "corte",
    });
    const nextSteps = buildSuggestedNextSteps(plan);
    expect(nextSteps.length).toBeGreaterThanOrEqual(3);
    expect(nextSteps.some((c) => c.id === "export-dxf")).toBe(true);

    let thread = createConversationThread("proj-fb", "Feedback Test");
    const turn = appendUserAndAssistantTurn(thread, {
      userPrompt: "Chapa 400x250",
      assistantContent: "Chapa criada",
      plan,
    });
    thread = turn.updatedThread;

    const fb = recordAssistantMessageFeedback(
      thread,
      turn.assistantMessage.id,
      "down",
      "Medida incorreta",
    );
    expect(fb.entry?.rating).toBe("down");
    expect(fb.entry?.reason).toBe("Medida incorreta");
    expect(listSavedFeedbackEntries().some((e) => e.messageId === turn.assistantMessage.id)).toBe(
      true,
    );
  });
});
