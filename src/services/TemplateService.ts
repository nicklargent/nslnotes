import { FileService } from "./FileService";
import { runtime } from "../lib/runtime";
import { generateSlug, generateUniqueSlug } from "../lib/slug";
import type { Template } from "../types/entities";

/**
 * Subdirectory under the notes root that holds task templates.
 */
export const TEMPLATES_TASKS_SUBDIR = ".templates/tasks";

function templatesTasksDir(rootPath: string): string {
  return `${rootPath}/${TEMPLATES_TASKS_SUBDIR}`;
}

/**
 * Derive a human-readable display name from a slug filename.
 * "meeting-prep" → "Meeting prep"
 * "1on1_alice" → "1on1 alice"
 */
function deriveDisplayName(slug: string): string {
  const spaced = slug.replace(/[-_]+/g, " ").trim();
  if (!spaced) return slug;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function basenameWithoutExt(p: string): string {
  const base = p.split("/").pop() ?? p;
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}

/**
 * TemplateService — file-backed CRUD for task templates.
 *
 * Templates are plain markdown files (no frontmatter) stored at
 * `${rootPath}/.templates/tasks/<slug>.md`. The slug is the template id
 * and the display name is derived from it.
 */
export const TemplateService = {
  /**
   * List all templates in the notes root. Returns an empty array if the
   * directory doesn't exist yet (first-time use).
   */
  list: async (rootPath: string): Promise<Template[]> => {
    const dir = templatesTasksDir(rootPath);

    const bulk = await FileService.readMarkdownDir(dir).catch(() => null);
    let entries: { path: string; content: string }[] = [];
    if (bulk) {
      entries = bulk.map((e) => ({ path: e.path, content: e.content }));
    } else {
      const files = await FileService.listMarkdownFiles(dir).catch(() => []);
      entries = await Promise.all(
        files.map(async (f) => ({
          path: f.path,
          content: await FileService.read(f.path),
        }))
      );
    }

    const templates: Template[] = entries.map((e) => {
      const id = basenameWithoutExt(e.path);
      return {
        id,
        displayName: deriveDisplayName(id),
        path: e.path,
        content: e.content,
      };
    });

    templates.sort((a, b) =>
      a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase())
    );
    return templates;
  },

  /**
   * Create a new template. Returns the created Template.
   * Throws if the display name slugs to empty.
   */
  create: async (
    rootPath: string,
    displayName: string,
    content: string
  ): Promise<Template> => {
    const dir = templatesTasksDir(rootPath);
    await runtime.ensureDirectory(dir);

    const slug = await generateUniqueSlug(displayName, dir);
    if (!slug) {
      throw new Error(
        "Template name must contain at least one letter or digit"
      );
    }
    const path = `${dir}/${slug}.md`;
    await FileService.write(path, content);

    return {
      id: slug,
      displayName: deriveDisplayName(slug),
      path,
      content,
    };
  },

  /**
   * Overwrite a template's content. Returns the updated Template.
   */
  save: async (template: Template, content: string): Promise<Template> => {
    await FileService.write(template.path, content);
    return { ...template, content };
  },

  /**
   * Rename a template. Slugs the new display name and moves the file.
   * If the resulting slug is unchanged, only the display name is refreshed.
   */
  rename: async (
    template: Template,
    newDisplayName: string
  ): Promise<Template> => {
    const dir = template.path.slice(0, template.path.lastIndexOf("/"));
    const targetSlug = generateSlug(newDisplayName);
    if (!targetSlug) {
      throw new Error(
        "Template name must contain at least one letter or digit"
      );
    }
    if (targetSlug === template.id) {
      return { ...template, displayName: deriveDisplayName(template.id) };
    }
    const newSlug = await generateUniqueSlug(newDisplayName, dir);
    const newPath = `${dir}/${newSlug}.md`;
    await FileService.write(newPath, template.content);
    await FileService.delete(template.path);
    return {
      id: newSlug,
      displayName: deriveDisplayName(newSlug),
      path: newPath,
      content: template.content,
    };
  },

  /**
   * Delete a template file.
   */
  remove: async (template: Template): Promise<void> => {
    await FileService.delete(template.path);
  },

  /**
   * Test whether a path is under the templates directory for a notebook.
   */
  isTemplatePath: (path: string, rootPath: string): boolean => {
    return path.startsWith(`${templatesTasksDir(rootPath)}/`);
  },

  /**
   * Resolve the templates-tasks directory for a notebook root.
   */
  tasksDir: (rootPath: string): string => templatesTasksDir(rootPath),
};
