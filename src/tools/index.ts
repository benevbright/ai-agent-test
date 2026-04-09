import { askUserFollowup } from "./ask_user_followup.js"
import { recordProgress } from "./record_progress.js"
import { bashTool } from "./bash.js"
import { internetSearch } from "./internet_search.js"
import { readTool } from "./read.js"
import { writeTool } from "./write.js"
import { editTool } from "./edit.js"
import { compilationCheckTool } from "./compilation_check.js"
import type { ToolSet } from "ai"

export const toolNames = {
  askUserFollowup: "ask_user_followup",
  recordProgress: "record_progress",
  bash: "bash",
  internetSearch: "internet_search",
  read: "read",
  write: "write",
  edit: "edit",
  compilationCheck: "compilation_check",
} as const

export const tools = {
  [toolNames.askUserFollowup]: askUserFollowup,
  [toolNames.recordProgress]: recordProgress,
  [toolNames.bash]: bashTool,
  [toolNames.internetSearch]: internetSearch,
  [toolNames.read]: readTool,
  [toolNames.write]: writeTool,
  [toolNames.edit]: editTool,
  [toolNames.compilationCheck]: compilationCheckTool,
} as const satisfies ToolSet
