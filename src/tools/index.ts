import { askUserFollowup } from "./ask_user_followup.js";
import { recordProgress } from "./record_progress.js";
import { bashTool } from "./bash.js";
import { internetSearch } from "./internet_search.js";
import type { ToolSet } from "ai";
import { deliverFinalAnswer } from "./deliver_final_answer.js";

export const tools: ToolSet = {
  //   deliver_final_answer: deliverFinalAnswer,
  ask_user_followup: askUserFollowup,
  record_progress: recordProgress,
  bash: bashTool,
  internet_search: internetSearch,
};
