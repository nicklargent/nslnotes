import { createStore } from "solid-js/store";
import type { Note, Task, Doc } from "../types/entities";
import type { TopicRef, Topic, TopicDecoration } from "../types/topics";
import type { ImageFile } from "../types/images";
import type { BacklinkEntry } from "../types/backlinks";
import type { IndexState } from "../types/stores";

const [indexStore, setIndexStore] = createStore<IndexState>({
  notes: new Map<string, Note>(),
  tasks: new Map<string, Task>(),
  docs: new Map<string, Doc>(),
  topics: new Map<TopicRef, Topic>(),
  topicsYaml: new Map<TopicRef, TopicDecoration>(),
  lastIndexed: null,
  imageFiles: new Map<string, ImageFile>(),
  entityToImages: new Map<string, string[]>(),
  imageToEntities: new Map<string, string[]>(),
  backlinkIndex: new Map<string, BacklinkEntry[]>(),
});

export { indexStore, setIndexStore };
