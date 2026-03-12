import type { Entity } from "../types/entities";
import type { TopicRef } from "../types/topics";
import { parseWikilinks, parseTopicRefs } from "./markdown";

/**
 * Weight constants for relevance scoring.
 */
const TOPIC_WEIGHT = 1;
const WIKILINK_WEIGHT = 2;

/**
 * Compute relevance weights for all entities relative to a source entity.
 * Shared topics contribute TOPIC_WEIGHT per shared topic.
 * Direct wikilinks contribute WIKILINK_WEIGHT.
 *
 * @param source - The entity to compute relevance from
 * @param allEntities - All entities to score against
 * @returns Map of entity path → relevance score
 */
export function computeRelevance(
  source: Entity,
  allEntities: Entity[]
): Map<string, number> {
  const weights = new Map<string, number>();

  // Collect source topics (frontmatter + inline)
  const sourceTopics = new Set<TopicRef>(source.topics);
  const inlineTopics = parseTopicRefs(source.content);
  for (const t of inlineTopics) {
    sourceTopics.add(t);
  }

  // Collect source wikilink targets
  const sourceLinks = parseWikilinks(source.content);
  const linkedTargets = new Set<string>();
  for (const link of sourceLinks) {
    linkedTargets.add(`${link.type}:${link.target}`);
  }

  for (const entity of allEntities) {
    if (entity.path === source.path) continue;

    let score = 0;

    // Score shared topics
    const entityTopics = new Set<TopicRef>(entity.topics);
    const entityInlineTopics = parseTopicRefs(entity.content);
    for (const t of entityInlineTopics) {
      entityTopics.add(t);
    }

    for (const t of sourceTopics) {
      if (entityTopics.has(t)) {
        score += TOPIC_WEIGHT;
      }
    }

    // Score direct wikilinks
    const entityKey = buildWikilinkKey(entity);
    if (entityKey && linkedTargets.has(entityKey)) {
      score += WIKILINK_WEIGHT;
    }

    if (score > 0) {
      weights.set(entity.path, score);
    }
  }

  return weights;
}

/**
 * Build a wikilink key (type:target) for an entity.
 */
function buildWikilinkKey(entity: Entity): string | null {
  switch (entity.type) {
    case "task":
      return `task:${entity.slug}`;
    case "doc":
      return `doc:${entity.slug}`;
    case "note":
      return `note:${entity.slug}`;
    default:
      return null;
  }
}
