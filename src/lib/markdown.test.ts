import { describe, it, expect } from "vitest";
import { parseTodos, parseWikilinks, parseTopicRefs } from "./markdown";

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
});
