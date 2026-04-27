import type { EntityType, TaskStatus } from "./entities";

export interface BacklinkEntry {
  sourcePath: string;
  sourceType: EntityType;
  sourceTitle: string;
  sourceDate: string | null;
  sourceStatus?: TaskStatus;
  contextLines: string[];
}
