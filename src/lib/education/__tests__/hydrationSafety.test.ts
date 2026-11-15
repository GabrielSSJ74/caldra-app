import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_LESSON_STATE,
  lessonStateFrom,
  type AcademyState,
} from "../progress";

describe("SSR hydration-safe academy state selector", () => {
  it("returns DEFAULT_LESSON_STATE when AcademyState is empty (SSR / initial hydration)", () => {
    const emptyState: AcademyState = { version: 1, lessons: {} };
    const result = lessonStateFrom(emptyState, "o-que-e-caldeiraria");
    assert.deepEqual(result, DEFAULT_LESSON_STATE);
    assert.equal(result.mastery, "nao-iniciado");
    assert.equal(result.attempts, 0);
    assert.equal(result.correct, 0);
  });

  it("returns persisted lesson progress after client AcademyState hydrates", () => {
    const hydratedState: AcademyState = {
      version: 1,
      lessons: {
        "o-que-e-caldeiraria": {
          mastery: "dominado",
          attempts: 2,
          correct: 2,
          lastAt: 1700000000000,
          favorite: true,
        },
      },
    };
    const result = lessonStateFrom(hydratedState, "o-que-e-caldeiraria");
    assert.equal(result.mastery, "dominado");
    assert.equal(result.attempts, 2);
    assert.equal(result.correct, 2);
    assert.equal(result.favorite, true);
  });

  it("falls back to DEFAULT_LESSON_STATE for unseen lesson IDs", () => {
    const hydratedState: AcademyState = {
      version: 1,
      lessons: {
        "outra-aula": {
          mastery: "em-estudo",
          attempts: 1,
          correct: 0,
          lastAt: 1700000000000,
        },
      },
    };
    assert.deepEqual(
      lessonStateFrom(hydratedState, "o-que-e-caldeiraria"),
      DEFAULT_LESSON_STATE,
    );
  });
});
