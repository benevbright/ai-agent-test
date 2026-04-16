import type { ToolSet } from "ai"
import type { ZodTypeAny } from "zod"

export type ToolResult = {
  success: boolean
  value: string
}

export type ToolDefinition<TInput = unknown> = {
  description: string
  inputSchema: ZodTypeAny
  execute: (input: TInput) => Promise<ToolResult>
}

export type ToolRegistry = ToolSet & Record<string, ToolDefinition<any>>
