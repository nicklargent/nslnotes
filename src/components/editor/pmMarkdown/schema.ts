import { getSchema } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { schemaExtensions } from "../schemaExtensions";

/**
 * The shared PM Schema, derived from the same TipTap extensions the live
 * editor uses. Built once at module load.
 */
export const schema: Schema = getSchema(schemaExtensions);
