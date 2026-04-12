import * as fs from "fs"
import path from "path"
import type { ModelMessage } from "ai"
import { homedir } from "os"
import { readMultiline } from "@toiroakr/read-multiline"

// Helper function to format path, replacing home directory with ~
export function formatPath(p: string): string {
  const homedirPath = homedir()
  if (p === homedirPath) {
    return "~"
  }
  if (p.startsWith(homedirPath + "/")) {
    return p.replace(homedirPath, "~")
  }
  return p
}

// Session file setup
const sessionDir = path.join(homedir(), ".ai", "sessions")
if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true })
}

// Get session file - checks env var dynamically, creates new file only if needed
let currentSessionFile: string | undefined
export function getSessionFile(): string {
  if (process.env.AI_SESSION_FILE) {
    return path.join(sessionDir, process.env.AI_SESSION_FILE)
  }
  // If no env var, use the same session file for the duration of this run
  if (!currentSessionFile) {
    const date = new Date()
    const isoString = date.toISOString()
    const datePart = isoString.substring(0, 10)
    const timePart = isoString.substring(11, 19).replace(/:/g, "")
    currentSessionFile = path.join(sessionDir, `${datePart}T${timePart}.json`)
  }
  return currentSessionFile
}

export function appendMessageToLog(message: ModelMessage) {
  const formattedMessage = JSON.stringify(message, null, 2)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")

  let fd: number | undefined
  try {
    // Open read/write so we can truncate the closing bracket and append in-place.
    fd = fs.openSync(getSessionFile(), "a+")
    const { size } = fs.fstatSync(fd)

    if (size === 0) {
      fs.writeSync(fd, `[\n${formattedMessage}\n]\n`)
      return
    }

    // Expected file ending is "\n]\n" from our writer.
    if (size >= 3) {
      fs.ftruncateSync(fd, size - 3)
      fs.writeSync(fd, `,\n${formattedMessage}\n]\n`)
      return
    }

    // Fallback for unexpected tiny/corrupt content.
    fs.ftruncateSync(fd, 0)
    fs.writeSync(fd, `[\n${formattedMessage}\n]\n`)
  } catch {
    // Last-resort fallback keeps logging functional.
    fs.writeFileSync(getSessionFile(), `[\n${formattedMessage}\n]\n`)
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd)
    }
  }
}

export function listSessions(
  limit: number = 20,
): Array<{ file: string; timestamp: string; summary?: string }> {
  if (!fs.existsSync(sessionDir)) {
    return []
  }

  const files = fs
    .readdirSync(sessionDir)
    .filter((file) => file.endsWith(".json"))
    .sort((a, b) => {
      // Sort by filename (which includes ISO timestamp) in reverse chronological order
      return b.localeCompare(a)
    })
    .slice(0, limit)

  const result: Array<{ file: string; timestamp: string; summary?: string }> =
    files.map((file) => {
      // Use the full path as timestamp with ~ for home directory (e.g., "~/.ai/sessions/2026-04-11T08:05:000Z-messages.json")
      const fullPath = path.join(sessionDir, file)
      const displayPath = fullPath.replace(homedir(), "~")
      const timestamp = displayPath

      // Try to read and parse the session file for a summary
      let summary: string | undefined = undefined
      try {
        const content = fs.readFileSync(path.join(sessionDir, file), "utf-8")
        const messages = JSON.parse(content)

        // Collect all user messages and join them
        const userMessages: string[] = []
        messages.forEach((msg: ModelMessage) => {
          if (msg.role === "user" && typeof msg.content === "string") {
            userMessages.push(msg.content)
          }
        })

        if (userMessages.length > 0) {
          // Join all user messages with spaces
          const combined = userMessages.join(" ")
          // Remove newlines to ensure single-line summary
          const oneline = combined.replace(/\r?\n/g, " ")
          // Truncate to 40 characters if needed
          summary =
            oneline.length > 40 ? oneline.substring(0, 40) + "..." : oneline
        }
      } catch (error) {
        // If we can't read the file, just show timestamp
        console.log(
          `Error reading session file ${file} for summary: ${(error as Error).message}`,
        )
      }

      const session: { file: string; timestamp: string; summary?: string } = {
        file,
        timestamp,
      }

      if (summary !== undefined) {
        session.summary = summary
      }

      return session
    })

  return result
}

export function loadSession(file: string): ModelMessage[] | null {
  try {
    const fullPath = path.join(sessionDir, file)
    if (!fs.existsSync(fullPath)) {
      return null
    }
    const content = fs.readFileSync(fullPath, "utf-8")
    return JSON.parse(content)
  } catch (error) {
    console.error(`Error loading session ${file}: ${(error as Error).message}`)
    return null
  }
}

export function getSessionFileByIndex(index: number): string | null {
  const sessions = listSessions()
  if (index < 0 || index >= sessions.length) {
    return null
  }
  const session = sessions[index]
  return session ? session.file : null
}

export async function askQuestion(prompt: string): Promise<string> {
  const [value, error] = await readMultiline("", {
    prefix: {
      pending: "", // while editing
      submitted: "✔ ", // after submission
      cancelled: "✘ ", // after Ctrl+C (optional, defaults to pending)
      error: "! ",
    },
    linePrefix: "",
    initialValue: prompt,
    validate: (v) =>
      v.trim() === "" || v === prompt ? "Input cannot be empty" : undefined,
    helpFooter: false,
    theme: {
      submitRender: "preserve",
      prefix: {
        pending: "gray",
        submitted: "green",
        cancelled: "red",
        error: "red",
      },
    },
  })
  if (error?.kind === "cancel") {
    return "exit"
  }
  return value.startsWith(prompt) ? value.substring(prompt.length) : value
}

export async function checkNpmUpdate(): Promise<{
  show: boolean
  currentVersion: string
  latestVersion: string
} | null> {
  try {
    const { execSync } = await import("child_process")

    const output = execSync("npm ls -g --json 2>/dev/null", {
      encoding: "utf-8",
    })
    const data = JSON.parse(output)

    const aiAgentTest = data?.dependencies?.["ai-agent-test"]
    if (!aiAgentTest) {
      return null
    }

    const currentVersion = aiAgentTest.version

    const response = await fetch(
      "https://registry.npmjs.org/ai-agent-test/latest",
    )
    if (!response.ok) {
      return null
    }

    const latestData = (await response.json()) as { version: string }
    const latestVersion = latestData.version
    const currentParts = currentVersion.split(".").map(Number)
    const latestParts = latestVersion.split(".").map(Number)

    let needsUpdate = false
    for (
      let i = 0;
      i < Math.max(currentParts.length, latestParts.length);
      i++
    ) {
      const current = currentParts[i] || 0
      const latest = latestParts[i] || 0
      if (latest > current) {
        needsUpdate = true
        break
      }
    }

    return needsUpdate ? { show: true, currentVersion, latestVersion } : null
  } catch (error) {
    // console.log(`Error checking for npm updates: ${(error as Error).message}`)
    return null
  }
}
