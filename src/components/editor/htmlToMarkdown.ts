import { ImageService } from "../../services/ImageService";

const sharedParser = new DOMParser();

/**
 * Convert TipTap HTML back to markdown.
 */
export function markdownFromHtml(
  html: string,
  entityPath?: string,
  rootPath?: string
): string {
  const doc = sharedParser.parseFromString(html, "text/html");

  function convert(node: Node, listDepth: number): string {
    // Handle case where node itself is a list element (called from liNestedLists)
    if (node.nodeType === Node.ELEMENT_NODE) {
      const selfTag = (node as HTMLElement).tagName.toLowerCase();
      if (selfTag === "ul" || selfTag === "ol") {
        return processList(node as HTMLElement, selfTag, listDepth);
      }
    }

    let result = "";

    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        let text = child.textContent ?? "";
        text = text
          .replace(/^\u2610\s*/, "TODO ")
          .replace(/^\u25a3\s*/, "DOING ")
          .replace(/^\u22A1\s*/, "WAITING ")
          .replace(/^\u229F\s*/, "LATER ")
          .replace(/^\u2611\s*/, "DONE ");
        result += text;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();

        switch (tag) {
          case "h1":
            result += `# ${el.textContent}\n`;
            break;
          case "h2":
            result += `## ${el.textContent}\n`;
            break;
          case "h3":
            result += `### ${el.textContent}\n`;
            break;
          case "p":
            result += `${convert(el, listDepth)}\n\n`;
            break;
          case "strong": {
            const inner = convert(el, listDepth);
            if (inner.startsWith("**") && inner.endsWith("**")) {
              result += inner;
            } else {
              result += `**${inner}**`;
            }
            break;
          }
          case "em": {
            const inner = convert(el, listDepth);
            if (
              inner.startsWith("*") &&
              inner.endsWith("*") &&
              !inner.startsWith("**")
            ) {
              result += inner;
            } else {
              result += `*${inner}*`;
            }
            break;
          }
          case "u":
            result += `<u>${convert(el, listDepth)}</u>`;
            break;
          case "s":
          case "del":
            // DONE markers imply strikethrough — don't double-wrap with ~~
            if (result.endsWith("DONE ")) {
              result += convert(el, listDepth);
            } else {
              result += `~~${convert(el, listDepth)}~~`;
            }
            break;
          case "a": {
            const href =
              el.getAttribute("href") || el.getAttribute("data-href") || "";
            const text = convert(el, listDepth);
            result += `[${text}](${href})`;
            break;
          }
          case "img": {
            const src = el.getAttribute("src") ?? "";
            const alt = el.getAttribute("alt") ?? "";
            const width = el.getAttribute("width");
            const relativeSrc =
              entityPath && rootPath
                ? ImageService.unresolveImageSrc(src, entityPath, rootPath)
                : src;
            const widthSuffix = width ? `{width=${width}}` : "";
            result += `![${alt}](${relativeSrc})${widthSuffix}\n`;
            break;
          }
          case "code":
            if (el.parentElement?.tagName.toLowerCase() === "pre") {
              result += el.textContent;
            } else {
              result += `\`${el.textContent}\``;
            }
            break;
          case "pre": {
            const codeEl = el.querySelector("code");
            const langClass = codeEl?.className.match(/language-(\w+)/);
            const lang = langClass ? langClass[1] : "";
            result += `\`\`\`${lang}\n${el.textContent}\n\`\`\`\n`;
            break;
          }
          case "ul":
          case "ol":
            result += processList(el, tag, listDepth);
            break;
          case "li":
            result += convert(el, listDepth);
            break;
          case "table":
            result += convertTable(el);
            break;
          case "hr":
            result += "---\n";
            break;
          case "br":
            result += "\n";
            break;
          case "label":
          case "input":
            // Skip checkbox elements from TaskItem rendering
            break;
          default:
            result += convert(el, listDepth);
        }
      }
    }

    return result;
  }

  function processList(
    el: HTMLElement,
    tag: string,
    listDepth: number
  ): string {
    let result = "";
    const isTaskList = el.getAttribute("data-type") === "taskList";
    if (tag === "ul") {
      for (const li of Array.from(el.children)) {
        const indent = "  ".repeat(listDepth);
        const liContent = liText(li, listDepth);
        const nested = liNestedBlocks(li, listDepth + 1);
        if (
          isTaskList ||
          (li as HTMLElement).getAttribute("data-type") === "taskItem"
        ) {
          const checked =
            (li as HTMLElement).getAttribute("data-checked") === "true";
          result += `${indent}- [${checked ? "x" : " "}] ${liContent.trim()}\n${nested}`;
        } else {
          result += `${indent}- ${liContent.trim()}\n${nested}`;
        }
      }
    } else {
      Array.from(el.children).forEach((li, i) => {
        const indent = "  ".repeat(listDepth);
        const liContent = liText(li, listDepth);
        const nested = liNestedBlocks(li, listDepth + 1);
        result += `${indent}${i + 1}. ${liContent.trim()}\n${nested}`;
      });
    }
    return result;
  }

  function liText(li: Element, listDepth: number): string {
    // Collect paragraph contents separately to handle multi-paragraph list items.
    // When a <li> contains multiple <p> tags (e.g. user pressed Enter inside the item),
    // subsequent paragraphs are emitted with blank line + indent so they stay
    // associated with the list item on re-parse.
    const paragraphs: string[] = [];
    let other = "";
    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as HTMLElement).tagName.toLowerCase();
        if (tag === "ul" || tag === "ol") continue;
        if (tag === "label") continue;
        if (tag === "pre") continue;
        if (tag === "p") {
          const inner = convert(child, listDepth).replace(/\n+$/, "");
          paragraphs.push(inner);
          continue;
        }
      }
      other += convert(child as Node, listDepth);
    }
    if (paragraphs.length <= 1) {
      return (paragraphs[0] ?? "") + other;
    }
    // Multiple paragraphs: join with blank line + indent
    const indent = "  ".repeat(listDepth + 1);
    return paragraphs.join(`\n${indent}\n${indent}`) + other;
  }

  function liNestedBlocks(li: Element, listDepth: number): string {
    let result = "";
    const indent = "  ".repeat(listDepth);
    for (const child of Array.from(li.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "ul" || tag === "ol") {
        result += convert(child, listDepth);
      } else if (tag === "pre") {
        // Code blocks inside list items — indent each line so they stay
        // associated with the list item on re-parse.
        const codeBlock = convert(child, listDepth);
        result += codeBlock
          .split("\n")
          .map((line) => (line ? `${indent}${line}` : line))
          .join("\n");
      }
    }
    return result;
  }

  function convertTable(table: HTMLElement): string {
    let result = "";
    const rows = Array.from(table.querySelectorAll("tr"));
    for (let i = 0; i < rows.length; i++) {
      const cells = Array.from(rows[i]!.querySelectorAll("th, td"));
      const cellTexts = cells.map((c) => (c.textContent ?? "").trim());
      result += `| ${cellTexts.join(" | ")} |\n`;
      if (i === 0) {
        result += `| ${cellTexts.map((c) => "-".repeat(Math.max(c.length, 3))).join(" | ")} |\n`;
      }
    }
    return result;
  }

  return convert(doc.body, 0)
    .trim()
    .replace(/\n{3,}/g, "\n\n");
}
