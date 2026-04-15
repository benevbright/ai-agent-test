import { z } from "zod"
import { spawn } from "child_process"
import chalk from "chalk"

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
  console.log(color(`[TOOL - bash] ${label}: ${lines[0]}...`))
  if (lines.length > 1) {
    console.log(color(`[TOOL - bash] ${lines[1]}...`))
    if (lines.length > 2) {
      console.log(color(`[TOOL - bash] and ${lines.length - 2} more line(s)`))
    }
  }
}

export const bashTool = {
  description: `Execute a bash command and return its output. This should be useful to find which files to read when exploring the codebase, find variables, and run CLI tools or bash commands.`,
  inputSchema: z.object({
    command: z.string().describe("The bash command to execute"),
    timeout: z
      .number()
      .optional()
      .default(10)
      .describe("Timeout in seconds. 0 = no timeout."),
  }),
  execute: async ({
    command,
    timeout,
  }: {
    command: string
    timeout?: number
  }) => {
    console.log(
      chalk.yellow(
        `\n[TOOL - bash] Executing command (timeout: ${timeout}s): ${command}`,
      ),
    )
    return new Promise((resolve) => {
      const childProcess = spawn("bash", ["-c", command], {
        stdio: ["pipe", "pipe", "pipe"] as any,
      })

      let isResolved = false
      let timeoutId: NodeJS.Timeout | null = null
      let didTimeout = false
      const markResolved = () => {
        if (!isResolved) {
          isResolved = true
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
        }
      }

      let output = ""
      let stderrOutput = ""

      // Cap output to prevent token bloat (5000 chars = generous limit)
      const MAX_OUTPUT_LENGTH = 5000

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
              error: `Command timed out after ${timeout} seconds`,
              output: cappedOutput || undefined,
              stderr:
                cappedStderr ||
                `Process was terminated due to timeout${signal ? ` (${signal})` : ""}.`,
            })
            return
          }

          if (code === 0) {
            logPreview("Output preview", output, chalk.green)
            resolve({
              success: true,
              output: `result: ${cappedOutput}`,
            })
          } else {
            console.error(
              chalk.red(
                `[TOOL - bash] ⚠️ Command failed with code ${code}${signal ? ` (signal: ${signal})` : ""}`,
              ),
            )
            if (stderrOutput.trim()) {
              logPreview("Stderr preview", stderrOutput, chalk.red)
            } else if (output.trim()) {
              logPreview("Stdout preview", output, chalk.yellow)
            }
            resolve({
              success: false,
              error: `Command failed with code ${code}`,
              output: cappedOutput || undefined,
              stderr: cappedStderr || undefined,
            })
          }
        },
      )

      childProcess.on("error", (error: Error) => {
        markResolved()
        console.error(
          chalk.red(`[TOOL - bash] ⚠️ Command failed: ${error.message}`),
        )
        resolve({
          success: false,
          error: error.message,
          stderr: undefined,
        })
      })

      // Set timeout
      if (timeout && timeout > 0) {
        const timeoutMs = timeout * 1000
        timeoutId = setTimeout(() => {
          if (!isResolved && !childProcess.killed) {
            didTimeout = true
            console.error(
              chalk.red(
                `[TOOL - bash] ⚠️ Command timed out after ${timeout} seconds`,
              ),
            )
            childProcess.kill("SIGTERM")
          }
        }, timeoutMs)
      }
    })
  },
}
