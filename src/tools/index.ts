import { askUserFollowup } from "./ask_user_followup.js";
import { recordProgress } from "./record_progress.js";
import { bashTool } from "./bash.js";
import { internetSearch } from "./internet_search.js";
import { readTool } from "./read.js";
import type { ToolSet } from "ai";

export const toolNames = {
  askUserFollowup: "ask_user_followup",
  recordProgress: "record_progress",
  bash: "bash",
  internetSearch: "internet_search",
  read: "read",
} as const;

export const tools = {
  // Not working as expected. will check again later.
  // deliver_final_answer: deliverFinalAnswer,
  [toolNames.askUserFollowup]: askUserFollowup,
  [toolNames.recordProgress]: recordProgress,
  [toolNames.bash]: bashTool,
  [toolNames.internetSearch]: internetSearch,
  [toolNames.read]: readTool,
} as const satisfies ToolSet;
