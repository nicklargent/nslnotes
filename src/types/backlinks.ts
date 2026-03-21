import type { EntityType } from "./entities";

export interface BacklinkEntry {
  sourcePath: string;
  sourceType: EntityType;
  sourceTitle: string;
  sourceDate: string | null;
  contextLines: string[];
}
