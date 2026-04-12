import { z } from "zod"
import { spawn } from "child_process"
import chalk from "chalk"

export const bashTool = {
  description: `Execute a bash command and return its output. This should be useful to find which files to read when exploring the codebase, find variables, and run CLI tools or bash commands.
    - avoid running commands that may print a lot of output. e.g) ls -R.
    `,
  inputSchema: z.object({
    command: z.string().describe("The bash command to execute"),
    timeout: z
      .number()
      .optional()
      .default(10)
      .describe(
        "Timeout in seconds for the command execution (default: 10). Set to null or 0 for no timeout.",
      ),
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
      const process = spawn("bash", ["-c", command], {
        stdio: ["pipe", "pipe", "pipe"] as any,
      })

      let isResolved = false
      let timeoutId: NodeJS.Timeout | null = null
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

      process.stdout.on("data", (data: Buffer) => {
        output += data.toString()
      })

      process.stderr.on("data", (data: Buffer) => {
        stderrOutput += data.toString()
      })

      process.on("close", (code: number | null) => {
        markResolved()
        if (code === 0) {
          // Print first 2 lines of output for visibility
          const lines = output.trim().split("\n")
          if (lines.length > 0) {
            console.log(
              chalk.green(`[TOOL - bash] Output preview: ${lines[0]}...`),
            )
            if (lines.length > 1) {
              console.log(chalk.green(`[TOOL - bash] ${lines[1]}...`))
              if (lines.length > 2) {
                console.log(
                  chalk.green(
                    `[TOOL - bash] and ${lines.length - 2} more line(s)`,
                  ),
                )
              }
            }
          }
          // Cap output for agent loop
          const cappedOutput =
            output.length > MAX_OUTPUT_LENGTH
              ? output.slice(0, MAX_OUTPUT_LENGTH) +
                `
... [output truncated at ${MAX_OUTPUT_LENGTH} characters]`
              : output
          resolve({
            success: true,
            output: `result: ${cappedOutput}\n\nPrint this output as they are`,
          })
        } else {
          console.error(
            chalk.red(`[TOOL - bash] ⚠️ Command failed with code ${code}`),
          )
          // Print stderr output for visibility
          if (stderrOutput.trim()) {
            const lines = stderrOutput.trim().split("\n")
            console.error(
              chalk.red(`[TOOL - bash] Stderr preview: ${lines[0]}...`),
            )
            if (lines.length > 1) {
              console.error(chalk.red(`[TOOL - bash] ${lines[1]}...`))
              if (lines.length > 2) {
                console.error(
                  chalk.red(
                    `[TOOL - bash] and ${lines.length - 2} more line(s)`,
                  ),
                )
              }
            }
          }
          // Cap stderr output for agent loop
          const cappedStderr =
            stderrOutput.length > MAX_OUTPUT_LENGTH
              ? stderrOutput.slice(0, MAX_OUTPUT_LENGTH) +
                `\n... [stderr truncated at ${MAX_OUTPUT_LENGTH} characters]`
              : stderrOutput
          resolve({
            success: false,
            error: `Command failed with code ${code}`,
            stderr: cappedStderr || undefined,
          })
        }
      })

      process.on("error", (error: Error) => {
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
          if (!isResolved && !process.killed) {
            process.kill("SIGTERM")
            console.error(
              chalk.red(
                `[TOOL - bash] ⚠️ Command timed out after ${timeout} seconds`,
              ),
            )
            resolve({
              success: false,
              error: `Command timed out after ${timeout} seconds`,
              stderr: "Process was terminated due to timeout.",
            })
          }
        }, timeoutMs)
      }
    })
  },
}
