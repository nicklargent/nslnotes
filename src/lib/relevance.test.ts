import { describe, it, expect } from "vitest";
import { computeRelevance } from "./relevance";
import type { Entity } from "../types/entities";
import type { TopicRef } from "../types/topics";

function makeEntity(
  overrides: Partial<Entity> & { type: Entity["type"]; path: string }
): Entity {
  const base = {
    slug: overrides.path.split("/").pop()?.replace(".md", "") ?? "",
    topics: [] as TopicRef[],
    frontmatter: {},
    content: "",
    modifiedAt: new Date(),
    ...overrides,
  };

  if (base.type === "note") {
    return {
      ...base,
      type: "note",
      date: "2026-03-10",
      title: null,
      isDaily: true,
    } as Entity;
  }
  if (base.type === "task") {
    return {
      ...base,
      type: "task",
      status: "open",
      created: "2026-03-10",
      due: null,
      title: "Test Task",
    } as Entity;
  }
  return {
    ...base,
    type: "doc",
    title: "Test Doc",
    created: "2026-03-10",
  } as Entity;
}

describe("computeRelevance", () => {
  it("scores higher for more shared topics", () => {
    const source = makeEntity({
      type: "note",
      path: "/notes/source.md",
      topics: ["#project", "#frontend"] as TopicRef[],
    });

    const entityA = makeEntity({
      type: "task",
      path: "/tasks/a.md",
      topics: ["#project", "#frontend"] as TopicRef[],
    });

    const entityB = makeEntity({
      type: "task",
      path: "/tasks/b.md",
      topics: ["#project"] as TopicRef[],
    });

    const weights = computeRelevance(source, [entityA, entityB]);
    expect(weights.get("/tasks/a.md")!).toBeGreaterThan(
      weights.get("/tasks/b.md")!
    );
  });

  it("does not include the source entity itself", () => {
    const source = makeEntity({
      type: "note",
      path: "/notes/source.md",
      topics: ["#project"] as TopicRef[],
    });

    const weights = computeRelevance(source, [source]);
    expect(weights.has("/notes/source.md")).toBe(false);
  });

  it("scores zero for entities with no shared topics or links", () => {
    const source = makeEntity({
      type: "note",
      path: "/notes/source.md",
      topics: ["#project"] as TopicRef[],
    });

    const unrelated = makeEntity({
      type: "task",
      path: "/tasks/unrelated.md",
      topics: ["#other"] as TopicRef[],
    });

    const weights = computeRelevance(source, [unrelated]);
    expect(weights.has("/tasks/unrelated.md")).toBe(false);
  });

  it("scores direct wikilinks higher than shared topics", () => {
    const source = makeEntity({
      type: "note",
      path: "/notes/source.md",
      topics: ["#project"] as TopicRef[],
      content: "See [[task:linked-task]]",
    });

    const linked = makeEntity({
      type: "task",
      path: "/tasks/linked-task.md",
      topics: [] as TopicRef[],
    });

    const topicOnly = makeEntity({
      type: "task",
      path: "/tasks/topic-only.md",
      topics: ["#project"] as TopicRef[],
    });

    const weights = computeRelevance(source, [linked, topicOnly]);
    expect(weights.get("/tasks/linked-task.md")!).toBeGreaterThan(
      weights.get("/tasks/topic-only.md")!
    );
  });

  it("returns empty map for entity with no topics or links", () => {
    const source = makeEntity({
      type: "note",
      path: "/notes/source.md",
    });

    const other = makeEntity({
      type: "task",
      path: "/tasks/other.md",
      topics: ["#something"] as TopicRef[],
    });

    const weights = computeRelevance(source, [other]);
    expect(weights.size).toBe(0);
  });
});
