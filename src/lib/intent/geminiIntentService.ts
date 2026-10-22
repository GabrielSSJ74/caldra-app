/**
 * CALDRA — CHAMFER INTENT
 * Seção 11: Integração com a API Gemini (Structured Outputs + Function Calling)
 *
 * Princípio Arquitetural:
 *   O modelo Gemini atua exclusivamente como extrator semântico de intenção e parâmetros
 *   estruturados (via JSON Schema / Function Declarations). O cálculo matemático de coordenadas,
 *   validação topológica e construção de entidades nativas são executados determinísticamente
 *   pelo motor geométrico do CHAMFER.
 */

import { GoogleGenAI, Type, type FunctionDeclaration, type Schema } from "@google/genai";
import type { Entity, LayerId } from "@/lib/lab2d/core";
import type { ChamferIntentPlan, ParametricSessionContext } from "./schema";
import { ChamferIntentInterpreter } from "./intentInterpreter";

export const CHAMFER_INTENT_SYSTEM_INSTRUCTION = `Você é o compilador semântico do CHAMFER Intent dentro do CALDRA — Metal Lab Suite.
Regras inegociáveis:
1. NUNCA desenhe geometria livremente nem retorne código SVG/HTML.
2. Converta o pedido do usuário em português técnico ou informal em parâmetros geométricos estruturados (em milímetros e graus).
3. NUNCA invente silenciosamente parâmetros críticos ausentes (como o arranjo de furos quando o usuário diz apenas "cinco furos centrais divididos igualmente", ou o diâmetro PCD quando não informado). Marque tais parâmetros em unresolved_parameters.
4. Preserve o contexto da peça ativa em comandos subsequentes ("aumente esses furos para 16 mm", "adicione mais dois furos com o mesmo espaçamento", "arredonde somente os dois cantos esquerdos").`;

/**
 * Esquema JSON Estrito para Gemini Structured Outputs (responseSchema)
 */
export const CHAMFER_INTENT_GEMINI_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    intent_category: {
      type: Type.STRING,
      description: "Categoria da operação: create, modify, query, select, delete, undo, export",
    },
    operation_type: {
      type: Type.STRING,
      description:
        "Tipo de comando CAD do catálogo: create_parametric_plate, create_circular_flange, create_slotted_bracket, create_boilermaking_square_to_round, create_boilermaking_truncated_cone, modify_active_feature, transform_mirror, etc.",
    },
    parameters: {
      type: Type.OBJECT,
      properties: {
        width: { type: Type.NUMBER, description: "Largura em mm" },
        height: { type: Type.NUMBER, description: "Altura em mm" },
        corner_radius: { type: Type.NUMBER, description: "Raio de arredondamento dos cantos em mm" },
        corner_chamfer: { type: Type.NUMBER, description: "Distância de chanfro nos cantos em mm" },
        corner_selector: {
          type: Type.STRING,
          description: "Seletor de cantos: all, none, left_two, right_two, top_two, bottom_two, top_left, top_right, bottom_left, bottom_right",
        },
        hole_count: { type: Type.INTEGER, description: "Quantidade de furos" },
        hole_diameter: { type: Type.NUMBER, description: "Diâmetro dos furos em mm" },
        hole_distribution: {
          type: Type.STRING,
          description: "Arranjo dos furos: corner_margins, linear_centerline_x, linear_centerline_y, circular_pcd, grid_4_plus_center, single_center",
        },
        margin: { type: Type.NUMBER, description: "Margem até a borda em mm" },
        pitch: { type: Type.NUMBER, description: "Passo centro a centro entre furos em mm" },
        pcd: { type: Type.NUMBER, description: "Diâmetro do círculo de furação PCD em mm" },
        outer_diameter: { type: Type.NUMBER, description: "Diâmetro externo em mm" },
        inner_diameter: { type: Type.NUMBER, description: "Diâmetro interno em mm" },
      },
    },
    unresolved_parameters: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Lista de parâmetros ambíguos ou ausentes que exigem confirmação do usuário",
    },
    summary: {
      type: Type.STRING,
      description: "Resumo técnico objetivo em português da intenção interpretada",
    },
  },
  required: ["intent_category", "operation_type", "parameters", "summary"],
};

/**
 * Declarações de Funções (Function Calling) do Catálogo Oficial CHAMFER Intent
 */
export const CHAMFER_INTENT_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "compile_parametric_plate",
    description:
      "Compila uma chapa retangular paramétrica com largura, altura, raios/chanfros de canto e padrão de furação.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        width: { type: Type.NUMBER, description: "Largura da chapa em mm" },
        height: { type: Type.NUMBER, description: "Altura da chapa em mm" },
        corner_radius: { type: Type.NUMBER, description: "Raio dos cantos em mm" },
        corner_selector: {
          type: Type.STRING,
          description: "Cantos: all, left_two, right_two, top_two, bottom_two",
        },
        hole_count: { type: Type.INTEGER, description: "Quantidade de furos" },
        hole_diameter: { type: Type.NUMBER, description: "Diâmetro dos furos em mm" },
        hole_distribution: {
          type: Type.STRING,
          description: "corner_margins, linear_centerline_x, linear_centerline_y, circular_pcd",
        },
        margin: { type: Type.NUMBER, description: "Margem das bordas em mm" },
        pcd: { type: Type.NUMBER, description: "Diâmetro PCD em mm se circular_pcd" },
      },
      required: ["width", "height"],
    },
  },
  {
    name: "compile_circular_flange",
    description: "Compila um flange circular industrial com diâmetro externo, interno, PCD e N furos polares.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        outer_diameter: { type: Type.NUMBER, description: "Diâmetro externo em mm" },
        inner_diameter: { type: Type.NUMBER, description: "Diâmetro interno em mm" },
        pcd: { type: Type.NUMBER, description: "Diâmetro PCD em mm" },
        hole_count: { type: Type.INTEGER, description: "Número de furos" },
        hole_diameter: { type: Type.NUMBER, description: "Diâmetro de cada furo em mm" },
      },
      required: ["outer_diameter", "pcd", "hole_count", "hole_diameter"],
    },
  },
];

/**
 * Interpreta o comando utilizando Structured Outputs da API Gemini quando uma chave de API
 * estiver configurada no servidor/ambiente, e compila determinísticamente pelo motor local.
 */
export async function interpretWithGeminiOrDeterministic(
  prompt: string,
  context: {
    existingEntities?: Entity[];
    selectedEntityIds?: string[];
    activeLayer?: LayerId;
    session?: ParametricSessionContext;
    parameterOverrides?: Record<string, unknown>;
    apiKey?: string;
  } = {},
): Promise<ChamferIntentPlan> {
  const apiKey =
    context.apiKey ||
    (typeof process !== "undefined" ? process.env?.GEMINI_API_KEY : undefined);

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: CHAMFER_INTENT_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: CHAMFER_INTENT_GEMINI_RESPONSE_SCHEMA,
          temperature: 0.1,
        },
      });

      if (response.text) {
        const parsed = JSON.parse(response.text) as {
          parameters?: Record<string, unknown>;
        };
        const mergedOverrides = {
          ...(parsed.parameters ?? {}),
          ...(context.parameterOverrides ?? {}),
        };
        return ChamferIntentInterpreter.compilePrompt(prompt, {
          ...context,
          parameterOverrides: mergedOverrides,
        });
      }
    } catch {
      // Fallback determinístico imediato caso offline ou sem rede
    }
  }

  return ChamferIntentInterpreter.compilePrompt(prompt, context);
}
