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
        // Skip whitespace-only text nodes BETWEEN block elements (e.g. the
        // `\n` markdown-it emits between </p> and <p>). Keep plain spaces
        // between inline elements — those are real whitespace like the space
        // in `**b** *i*` → `<strong>b</strong> <em>i</em>`.
        if (
          /\n/.test(text) &&
          /^\s+$/.test(text) &&
          child.previousSibling?.nodeType === Node.ELEMENT_NODE &&
          child.nextSibling?.nodeType === Node.ELEMENT_NODE
        ) {
          continue;
        }
        // Strip leading \n from text nodes right after <br> — markdown-it
        // emits a \n after <br> for formatting, but we already emit \n for
        // the <br> itself so keeping it would double the line break.
        if (
          text.startsWith("\n") &&
          child.previousSibling?.nodeType === Node.ELEMENT_NODE &&
          (child.previousSibling as HTMLElement).tagName?.toLowerCase() === "br"
        ) {
          text = text.slice(1);
        }
        // If this text node sits right after a TODO-marker span, drop its
        // leading whitespace. The span already contributed a trailing space
        // when its ☐/◣/⌛/▷/☑ text was replaced with the keyword + space.
        if (
          /(?:^|\s)(TODO|DOING|WAITING|LATER|DONE) $/.test(result) &&
          child.previousSibling?.nodeType === Node.ELEMENT_NODE
        ) {
          text = text.replace(/^[ \t]+/, "");
        }
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
          case "h2":
          case "h3":
          case "h4":
          case "h5":
          case "h6": {
            const level = tag[1]!;
            result += `\n${"#".repeat(Number(level))} ${el.textContent}\n`;
            break;
          }
          case "p": {
            // Empty paragraphs (visual spacers) output \n, same as content
            // paragraphs. Two adjacent \n create a blank line in markdown.
            const isEmpty =
              el.childNodes.length === 0 ||
              (el.textContent === "" &&
                Array.from(el.childNodes).every((c) => c.nodeName === "BR"));
            if (isEmpty) {
              result += "\n";
            } else {
              result += `${convert(el, listDepth)}\n`;
            }
            break;
          }
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
            result += `\n\`\`\`${lang}\n${el.textContent}\n\`\`\`\n\n`;
            break;
          }
          case "ul":
          case "ol": {
            result += processList(el, tag, listDepth);
            // Ensure blank line after top-level list — but not if followed
            // by another list (consecutive <ul>/<ol> from TipTap's mixed
            // bullet/task list splitting).
            const nextSibTag = el.nextElementSibling?.tagName?.toLowerCase();
            const nextIsList = nextSibTag === "ul" || nextSibTag === "ol";
            if (listDepth === 0 && !result.endsWith("\n\n") && !nextIsList) {
              result += "\n";
            }
            break;
          }
          case "li":
            result += convert(el, listDepth);
            break;
          case "table":
            result += convertTable(el);
            break;
          case "hr":
            result += "\n---\n\n";
            break;
          case "br":
            result += "\n";
            break;
          case "blockquote": {
            const inner = convert(el, listDepth).trim();
            result +=
              inner
                .split("\n")
                .map((line) => (line ? `> ${line}` : ">"))
                .join("\n") + "\n";
            break;
          }
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
        const liContent = liText(li, listDepth, 2);
        const nested = liNestedBlocks(li, listDepth + 1, 2);
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
      const items = Array.from(el.children);
      // Marker width is wide enough for the highest item number plus ". ".
      const markerWidth = String(items.length).length + 2;
      items.forEach((li, i) => {
        const indent = "  ".repeat(listDepth);
        const liContent = liText(li, listDepth, markerWidth);
        const nested = liNestedBlocks(li, listDepth + 1, markerWidth);
        result += `${indent}${i + 1}. ${liContent.trim()}\n${nested}`;
      });
    }
    return result;
  }

  /**
   * Serialize a single node as if it were a child of a parent. `convert(node)`
   * walks the node's children, so self-closing elements like <img> (and
   * <br>/<hr>) would return "" when passed directly. Wrap in a synthetic
   * span to reuse the existing element-dispatch logic.
   */
  function convertAsChild(child: Node, listDepth: number): string {
    const ownerDoc = child.ownerDocument ?? doc;
    const wrapper = ownerDoc.createElement("span");
    wrapper.appendChild(child.cloneNode(true));
    return convert(wrapper, listDepth);
  }

  /** Flatten TipTap's TaskItem <div> content wrapper so callers see direct children. */
  function unwrapDivs(parent: Element): ChildNode[] {
    const result: ChildNode[] = [];
    for (const child of Array.from(parent.childNodes)) {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        (child as HTMLElement).tagName.toLowerCase() === "div"
      ) {
        for (const grandchild of Array.from(child.childNodes)) {
          result.push(grandchild);
        }
      } else {
        result.push(child);
      }
    }
    return result;
  }

  function liText(li: Element, listDepth: number, markerWidth: number): string {
    // Collect paragraph contents separately to handle multi-paragraph list items.
    // Subsequent paragraphs are emitted with blank line + indent so they stay
    // associated with the list item on re-parse.
    const paragraphs: string[] = [];
    let other = "";

    for (const child of unwrapDivs(li)) {
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
      other += convertAsChild(child as Node, listDepth);
    }
    if (paragraphs.length <= 1) {
      return (paragraphs[0] ?? "") + other;
    }
    // Multiple paragraphs: subsequent ones need an indent matching the marker
    // width (e.g. `1. ` → 3 spaces, `- ` → 2 spaces) plus any nesting depth,
    // or the markdown parser treats them as a separate block.
    const indent = "  ".repeat(listDepth) + " ".repeat(markerWidth);
    return paragraphs.join(`\n\n${indent}`) + other;
  }

  function liNestedBlocks(
    li: Element,
    listDepth: number,
    parentMarkerWidth: number
  ): string {
    let result = "";
    const indent = "  ".repeat(listDepth);
    // If the parent list marker is wider than 2 chars (ordered list), child
    // blocks need extra indent so the markdown parser treats them as part of
    // the parent item rather than breaking out of the list.
    const extraIndent = " ".repeat(Math.max(0, parentMarkerWidth - 2));
    for (const child of unwrapDivs(li)) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = (child as HTMLElement).tagName.toLowerCase();
      if (tag === "ul" || tag === "ol") {
        const nested = convert(child, listDepth);
        result += extraIndent
          ? nested
              .split("\n")
              .map((line) => (line ? `${extraIndent}${line}` : line))
              .join("\n")
          : nested;
      } else if (tag === "pre") {
        // Code blocks inside list items — indent each line so they stay
        // associated with the list item on re-parse.
        const codeBlock = convert(child, listDepth);
        result += codeBlock
          .split("\n")
          .map((line) => (line ? `${indent}${extraIndent}${line}` : line))
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
      const cellTexts = cells.map(cellMarkdown);
      result += `| ${cellTexts.join(" | ")} |\n`;
      if (i === 0) {
        // Always emit `---` regardless of column width — cosmetic alignment
        // is lost anyway once cells contain unequal-width marks.
        result += `| ${cellTexts.map(() => "---").join(" | ")} |\n`;
      }
    }
    return result;
  }

  /** Serialize a <td>/<th>'s content, preserving inline marks and escaping pipes. */
  function cellMarkdown(cell: Element): string {
    // Cell content is typically wrapped in <p> (added by the tableCellParagraphs
    // plugin). Unwrap single/multi paragraphs to inline markdown.
    let out = "";
    for (const child of Array.from(cell.childNodes)) {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        (child as HTMLElement).tagName.toLowerCase() === "p"
      ) {
        out += convert(child, 0).replace(/\n+$/, "");
      } else {
        out += convertAsChild(child as Node, 0);
      }
    }
    return (
      out
        .trim()
        // Escape pipe chars so they don't terminate the cell.
        .replace(/\|/g, "\\|")
        // Collapse stray newlines from unwrapping.
        .replace(/\s*\n\s*/g, " ")
    );
  }

  return convert(doc.body, 0)
    .trim()
    .replace(/\n{3,}/g, "\n\n");
}
