import { describe, it, expect } from "vitest";
import {
  parseTodos,
  parseWikilinks,
  parseTopicRefs,
  hasUncheckedItems,
} from "./markdown";

describe("parseTodos", () => {
  it("parses TODO items", () => {
    const content = "- TODO buy milk\n- DOING write report\n- DONE send email";
    const todos = parseTodos(content);
    expect(todos).toHaveLength(3);
    expect(todos[0]?.state).toBe("TODO");
    expect(todos[0]?.text).toBe("buy milk");
    expect(todos[1]?.state).toBe("DOING");
    expect(todos[1]?.text).toBe("write report");
    expect(todos[2]?.state).toBe("DONE");
    expect(todos[2]?.text).toBe("send email");
  });

  it("parses WAITING and LATER items", () => {
    const content = "- WAITING check back\n- LATER someday";
    const todos = parseTodos(content);
    expect(todos).toHaveLength(2);
    expect(todos[0]?.state).toBe("WAITING");
    expect(todos[0]?.text).toBe("check back");
    expect(todos[1]?.state).toBe("LATER");
    expect(todos[1]?.text).toBe("someday");
  });

  it("tracks line numbers", () => {
    const content = "some text\n- TODO item\nmore text";
    const todos = parseTodos(content);
    expect(todos).toHaveLength(1);
    expect(todos[0]?.lineNumber).toBe(1);
  });

  it("handles indentation", () => {
    const content = "  - TODO nested item";
    const todos = parseTodos(content);
    expect(todos).toHaveLength(1);
    expect(todos[0]?.indent).toBe(2);
  });

  it("ignores TODO items in code blocks", () => {
    const content = "```\n- TODO in code\n```\n- TODO outside code";
    const todos = parseTodos(content);
    expect(todos).toHaveLength(1);
    expect(todos[0]?.text).toBe("outside code");
  });

  it("returns empty array for content without todos", () => {
    const content = "regular text\n- normal list item";
    expect(parseTodos(content)).toHaveLength(0);
  });

  it("parses standalone TODO lines (no bullet prefix)", () => {
    const content = "TODO buy milk\nTODO walk dog";
    const todos = parseTodos(content);
    expect(todos).toHaveLength(2);
    expect(todos[0]?.state).toBe("TODO");
    expect(todos[0]?.text).toBe("buy milk");
    expect(todos[0]?.indent).toBe(0);
    expect(todos[1]?.text).toBe("walk dog");
  });

  it("parses indented standalone TODO lines", () => {
    const todos = parseTodos("  TODO nested standalone");
    expect(todos).toHaveLength(1);
    expect(todos[0]?.indent).toBe(2);
    expect(todos[0]?.text).toBe("nested standalone");
  });

  it("still parses bulleted TODO items the same as before", () => {
    const todos = parseTodos("- TODO buy milk");
    expect(todos).toHaveLength(1);
    expect(todos[0]?.state).toBe("TODO");
    expect(todos[0]?.text).toBe("buy milk");
    expect(todos[0]?.indent).toBe(0);
  });

  it("ignores plain text that doesn't start with a TODO keyword", () => {
    expect(parseTodos("This is a TODO list")).toHaveLength(0);
    expect(parseTodos("TODOing something")).toHaveLength(0);
  });
});

describe("hasUncheckedItems", () => {
  it("returns true for a non-DONE TODO", () => {
    expect(hasUncheckedItems("- TODO buy milk")).toBe(true);
  });

  it("returns true for DOING/WAITING/LATER states", () => {
    expect(hasUncheckedItems("- DOING write report")).toBe(true);
    expect(hasUncheckedItems("- WAITING reply")).toBe(true);
    expect(hasUncheckedItems("- LATER someday")).toBe(true);
  });

  it("returns true for an unchecked `- [ ]` checkbox", () => {
    expect(hasUncheckedItems("- [ ] unchecked")).toBe(true);
  });

  it("returns false when only DONE items exist", () => {
    expect(hasUncheckedItems("- DONE send email")).toBe(false);
  });

  it("returns false for content with no todos or checkboxes", () => {
    expect(hasUncheckedItems("regular text\n- normal list item")).toBe(false);
  });

  it("ignores items inside fenced code blocks", () => {
    const content = "```\n- TODO in code\n- [ ] in code\n```\nplain text";
    expect(hasUncheckedItems(content)).toBe(false);
  });

  it("returns true when an unchecked item appears after DONE items", () => {
    expect(hasUncheckedItems("- DONE old\n- TODO new")).toBe(true);
  });

  it("returns true for a standalone TODO paragraph", () => {
    expect(hasUncheckedItems("TODO standalone")).toBe(true);
  });

  it("returns false for a standalone DONE paragraph", () => {
    expect(hasUncheckedItems("DONE standalone")).toBe(false);
  });
});

describe("parseWikilinks", () => {
  it("parses task wikilinks", () => {
    const content = "See [[task:my-task]] for details";
    const links = parseWikilinks(content);
    expect(links).toHaveLength(1);
    expect(links[0]?.type).toBe("task");
    expect(links[0]?.target).toBe("my-task");
    expect(links[0]?.raw).toBe("[[task:my-task]]");
  });

  it("parses doc wikilinks", () => {
    const content = "[[doc:my-doc]]";
    const links = parseWikilinks(content);
    expect(links).toHaveLength(1);
    expect(links[0]?.type).toBe("doc");
    expect(links[0]?.target).toBe("my-doc");
  });

  it("parses note wikilinks", () => {
    const content = "[[note:2026-03-10]]";
    const links = parseWikilinks(content);
    expect(links).toHaveLength(1);
    expect(links[0]?.type).toBe("note");
    expect(links[0]?.target).toBe("2026-03-10");
  });

  it("parses multiple wikilinks", () => {
    const content = "See [[task:a]] and [[doc:b]] and [[note:c]]";
    const links = parseWikilinks(content);
    expect(links).toHaveLength(3);
  });

  it("ignores wikilinks in code blocks", () => {
    const content = "```\n[[task:in-code]]\n```\n[[task:outside]]";
    const links = parseWikilinks(content);
    expect(links).toHaveLength(1);
    expect(links[0]?.target).toBe("outside");
  });

  it("returns empty for content without wikilinks", () => {
    expect(parseWikilinks("no links here")).toHaveLength(0);
  });
});

describe("parseTopicRefs", () => {
  it("parses hashtag topics", () => {
    const content = "Working on #project today";
    const refs = parseTopicRefs(content);
    expect(refs).toContain("#project");
  });

  it("parses person refs", () => {
    const content = "Meeting with @alice";
    const refs = parseTopicRefs(content);
    expect(refs).toContain("@alice");
  });

  it("parses multiple refs", () => {
    const content = "#topic1 and #topic2 with @person1";
    const refs = parseTopicRefs(content);
    expect(refs.length).toBeGreaterThanOrEqual(3);
  });

  it("handles hyphenated topics", () => {
    const content = "#my-project";
    const refs = parseTopicRefs(content);
    expect(refs).toContain("#my-project");
  });

  it("deduplicates refs", () => {
    const content = "#topic #topic #topic";
    const refs = parseTopicRefs(content);
    expect(refs.filter((r) => r === "#topic")).toHaveLength(1);
  });

  it("lowercases refs", () => {
    const content = "#MyTopic";
    const refs = parseTopicRefs(content);
    expect(refs).toContain("#mytopic");
  });

  it("ignores refs in code blocks", () => {
    const content = "```\n#in-code\n```\n#outside-code";
    const refs = parseTopicRefs(content);
    expect(refs).not.toContain("#in-code");
    expect(refs).toContain("#outside-code");
  });

  it("returns empty for content without refs", () => {
    expect(parseTopicRefs("no refs here")).toHaveLength(0);
  });

  it("ignores single-char refs like #4 or @1", () => {
    const content = "item #4 and @1 should not match";
    const refs = parseTopicRefs(content);
    expect(refs).toHaveLength(0);
  });

  it("matches two-char refs like #ab and @me", () => {
    const content = "#ab and @me are valid";
    const refs = parseTopicRefs(content);
    expect(refs).toContain("#ab");
    expect(refs).toContain("@me");
  });
});
