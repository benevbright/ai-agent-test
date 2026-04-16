import { z } from "zod"
import { spawn } from "child_process"
import chalk from "chalk"
import type { ToolDefinition, ToolResult } from "./types.js"

function capOutput(value: string, maxLength: number, label: string) {
  return value.length > maxLength
    ? value.slice(0, maxLength) +
        `\n... [${label} truncated at ${maxLength} characters]`
    : value
}

function logPreview(
  label: string,
  value: string,
  color: (text: string) => string,
) {
  const trimmed = value.trim()
  if (!trimmed) {
    return
  }

  const lines = trimmed.split("\n")
  console.log(color(`[TOOL - compilationCheck] ${label}: ${lines[0]}...`))
  if (lines.length > 1) {
    console.log(color(`[TOOL - compilationCheck] ${lines[1]}...`))
    if (lines.length > 2) {
      console.log(
        color(`[TOOL - compilationCheck] and ${lines.length - 2} more line(s)`),
      )
    }
  }
}

export const compilationCheckTool: ToolDefinition<{
  commands: string | string[]
  timeout?: number
}> = {
  description:
    "Run linting/type checking commands to catch errors before committing.",
  inputSchema: z.object({
    commands: z
      .union([z.string(), z.array(z.string())])
      .describe("Lint/type check command(s), e.g., 'npx tsc --noEmit'."),
    timeout: z
      .number()
      .optional()
      .default(20)
      .describe("Timeout in seconds. 0 = no timeout."),
  }),
  execute: async ({
    commands,
    timeout,
  }: {
    commands: string | string[]
    timeout?: number
  }) => {
    const commandList = Array.isArray(commands) ? commands : [commands]
    const command = commandList.join(" && ")
    console.log(
      chalk.yellow(
        `\n[TOOL - compilationCheck] Running compilation checks (timeout: ${timeout}s): ${command}`,
      ),
    )

    return new Promise<ToolResult>((resolve) => {
      const childProcess = spawn("bash", ["-c", command], {
        stdio: ["pipe", "pipe", "pipe"] as const,
      })

      const MAX_OUTPUT_LENGTH = 5000
      let output = ""
      let stderrOutput = ""
      let isResolved = false
      let didTimeout = false
      let timeoutId: NodeJS.Timeout | null = null

      const markResolved = () => {
        if (!isResolved) {
          isResolved = true
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
        }
      }

      childProcess.stdout.on("data", (data: Buffer) => {
        output += data.toString()
      })

      childProcess.stderr.on("data", (data: Buffer) => {
        stderrOutput += data.toString()
      })

      childProcess.on(
        "close",
        (code: number | null, signal: NodeJS.Signals | null) => {
          markResolved()
          const cappedOutput = capOutput(output, MAX_OUTPUT_LENGTH, "output")
          const cappedStderr = capOutput(
            stderrOutput,
            MAX_OUTPUT_LENGTH,
            "stderr",
          )

          if (didTimeout) {
            if (output.trim()) {
              logPreview("Output preview", output, chalk.yellow)
            }
            if (stderrOutput.trim()) {
              logPreview("Stderr preview", stderrOutput, chalk.red)
            }
            resolve({
              success: false,
              value: [
                `Compilation check timed out after ${timeout} seconds`,
                cappedOutput ? `Output:\n${cappedOutput}` : "",
                `Stderr:\n${cappedStderr || `Process was terminated due to timeout${signal ? ` (${signal})` : ""}.`}`,
              ]
                .filter(Boolean)
                .join("\n\n"),
            })
            return
          }

          if (code === 0) {
            if (output.trim()) {
              logPreview("Output preview", output, chalk.green)
            }
            if (stderrOutput.trim()) {
              logPreview("Stderr preview", stderrOutput, chalk.yellow)
            }

            const sections = [
              output.trim() ? output.trimEnd() : "",
              stderrOutput.trim()
                ? `Warnings or stderr output:\n${stderrOutput.trimEnd()}`
                : "",
            ].filter(Boolean)

            resolve({
              success: true,
              value:
                "Compilation check passed successfully." +
                (sections.length > 0 ? `\n${sections.join("\n\n")}` : ""),
            })
            return
          }

          console.error(
            chalk.red(
              `[TOOL - compilationCheck] ⚠️ Compilation check failed with code ${code}${signal ? ` (signal: ${signal})` : ""}`,
            ),
          )
          if (stderrOutput.trim()) {
            logPreview("Stderr preview", stderrOutput, chalk.red)
          } else if (output.trim()) {
            logPreview("Stdout preview", output, chalk.yellow)
          }

          resolve({
            success: false,
            value: [
              `Compilation check failed with code ${code}`,
              cappedOutput ? `Output:\n${cappedOutput}` : "",
              cappedStderr ? `Stderr:\n${cappedStderr}` : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
          })
        },
      )

      childProcess.on("error", (error: Error) => {
        markResolved()
        console.error(
          chalk.red(
            `[TOOL - compilationCheck] ⚠️ Compilation check failed: ${error.message}`,
          ),
        )
        resolve({
          success: false,
          value: [
            error.message,
            output ? `Output:\n${output}` : "",
            stderrOutput ? `Stderr:\n${stderrOutput}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        })
      })

      if (timeout && timeout > 0) {
        const timeoutMs = timeout * 1000
        timeoutId = setTimeout(() => {
          if (!isResolved && !childProcess.killed) {
            didTimeout = true
            console.error(
              chalk.red(
                `[TOOL - compilationCheck] ⚠️ Compilation check timed out after ${timeout} seconds`,
              ),
            )
            childProcess.kill("SIGTERM")
          }
        }, timeoutMs)
      }
    })
  },
}
