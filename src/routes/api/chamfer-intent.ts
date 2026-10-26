import { createFileRoute } from "@tanstack/react-router";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import {
  CHAMFER_INTENT_V2_SYSTEM_INSTRUCTION,
  buildTurnContextEnvelope,
} from "@/lib/intent/chamferIntent.systemInstruction";
import {
  CHAMFER_DSL_V2_FUNCTION_DECLARATIONS,
  type DslV2ToolCall,
  type DslV2ToolName,
} from "@/lib/intent/dslV2Schemas";
import { createEmptyPartModel, type PartModel } from "@/lib/intent/partModel";

const RequestBodySchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  partModel: z.any().optional(),
  selectedEntityIds: z.array(z.string()).optional(),
  recentMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system_note"]),
        text: z.string(),
        turn: z.number().optional(),
      }),
    )
    .optional(),
  manualEditNotes: z.array(z.string()).optional(),
  dryRunErrors: z.array(z.string()).optional(),
  stream: z.boolean().optional(),
});

export const Route = createFileRoute("/api/chamfer-intent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["GEMINI_API_KEY"];
        if (!apiKey) {
          return new Response(
            JSON.stringify({
              ok: false,
              offlineFallback: true,
              error: "GEMINI_API_KEY não configurada no servidor; usando compilador determinístico local.",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const parsed = RequestBodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ ok: false, error: "Payload inválido para /api/chamfer-intent." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const {
          prompt,
          partModel,
          selectedEntityIds = [],
          recentMessages = [],
          manualEditNotes = [],
          dryRunErrors = [],
          stream = false,
        } = parsed.data;

        const safePartModel: PartModel =
          partModel && typeof partModel === "object" && Array.isArray(partModel.entities)
            ? (partModel as PartModel)
            : createEmptyPartModel();

        const baseEnvelope = buildTurnContextEnvelope({
          userPrompt: prompt,
          partModel: safePartModel,
          selectedEntityIds,
          recentMessages,
          manualEditNotes,
        });

        const fullPrompt =
          dryRunErrors.length > 0
            ? `${baseEnvelope}\n\nERROS_DE_COMPILACAO_DRY_RUN:\n${dryRunErrors.join(
                "\n",
              )}\nCorrija as chamadas de função com a menor mudança possível respeitando as restrições geométricas.`
            : baseEnvelope;

        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });

        try {
          if (stream) {
            const responseStream = await ai.models.generateContentStream({
              model: "gemini-3.8-flash",
              contents: fullPrompt,
              config: {
                systemInstruction: CHAMFER_INTENT_V2_SYSTEM_INSTRUCTION,
                temperature: 0.1,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                tools: [{ functionDeclarations: CHAMFER_DSL_V2_FUNCTION_DECLARATIONS }],
              },
            });

            const encoder = new TextEncoder();
            const readable = new ReadableStream({
              async start(controller) {
                try {
                  let accumulatedText = "";
                  const collectedCalls: DslV2ToolCall[] = [];

                  for await (const chunk of responseStream) {
                    const chunkText = chunk.text ?? "";
                    if (chunkText) {
                      accumulatedText += chunkText;
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify({ type: "text_chunk", text: chunkText })}\n\n`,
                        ),
                      );
                    }
                    if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                      for (const fc of chunk.functionCalls) {
                        if (fc.name) {
                          const callObj: DslV2ToolCall = {
                            name: fc.name as DslV2ToolName,
                            args: (fc.args as Record<string, unknown>) ?? {},
                          };
                          collectedCalls.push(callObj);
                          controller.enqueue(
                            encoder.encode(
                              `data: ${JSON.stringify({ type: "tool_call", call: callObj })}\n\n`,
                            ),
                          );
                        }
                      }
                    }
                  }

                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "done",
                        understandingText: accumulatedText.trim(),
                        toolCalls: collectedCalls,
                      })}\n\n`,
                    ),
                  );
                  controller.close();
                } catch (err) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "error",
                        error: err instanceof Error ? err.message : "Erro no stream Gemini",
                      })}\n\n`,
                    ),
                  );
                  controller.close();
                }
              },
            });

            return new Response(readable, {
              headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
              },
            });
          }

          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: fullPrompt,
            config: {
              systemInstruction: CHAMFER_INTENT_V2_SYSTEM_INSTRUCTION,
              temperature: 0.1,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              tools: [{ functionDeclarations: CHAMFER_DSL_V2_FUNCTION_DECLARATIONS }],
            },
          });

          const understandingText = (response.text ?? "").trim();
          const toolCalls: DslV2ToolCall[] = (response.functionCalls ?? [])
            .filter((fc): fc is NonNullable<typeof fc> & { name: string } => Boolean(fc.name))
            .map((fc) => ({
              name: fc.name as DslV2ToolName,
              args: (fc.args as Record<string, unknown>) ?? {},
            }));

          return new Response(
            JSON.stringify({
              ok: true,
              understandingText,
              toolCalls,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              offlineFallback: true,
              error: error instanceof Error ? error.message : "Falha na chamada Gemini",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },
    },
  },
});
