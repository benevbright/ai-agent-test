import * as fs from "fs"
import path from "path"
import type { ModelMessage } from "ai"
import { homedir } from "os"

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
    currentSessionFile = path.join(
      sessionDir,
      `${date.toISOString().replace(/\.\d{3}Z$/, "")}-messages.json`,
    )
  }
  return currentSessionFile
}

// For backward compatibility - default session file
const defaultSessionFile = path.join(
  sessionDir,
  `${new Date().toISOString().replace(/\.\d{3}Z$/, "")}-messages.json`,
)

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
    .filter((file) => file.endsWith("-messages.json"))
    .sort((a, b) => {
      // Sort by filename (which includes ISO timestamp) in reverse chronological order
      return b.localeCompare(a)
    })
    .slice(0, limit)

  const result: Array<{ file: string; timestamp: string; summary?: string }> =
    files.map((file) => {
      // Parse ISO timestamp from filename and format as "YYYY-MM-DD HH:mm"
      const isoTimestamp = file.split("-messages.json")[0] || ""
      let formattedTimestamp = isoTimestamp
      try {
        const date = new Date(isoTimestamp)
        if (!isNaN(date.getTime())) {
          const year = date.getFullYear()
          const month = String(date.getMonth() + 1).padStart(2, "0")
          const day = String(date.getDate()).padStart(2, "0")
          const hours = String(date.getHours()).padStart(2, "0")
          const minutes = String(date.getMinutes()).padStart(2, "0")
          formattedTimestamp = `${year}-${month}-${day} ${hours}:${minutes}`
        }
      } catch {
        // If parsing fails, keep original timestamp
      }
      const timestamp = formattedTimestamp

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
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      process.stdout.write(prompt)
      let buffered = ""

      const onData = (chunk: Buffer | string) => {
        buffered += chunk.toString()
        const newlineIndex = buffered.indexOf("\n")
        if (newlineIndex === -1) {
          return
        }

        process.stdin.off("data", onData)
        resolve(buffered.slice(0, newlineIndex).replace(/\r$/, ""))
      }

      process.stdin.on("data", onData)
      return
    }

    const stdin = process.stdin
    const stdout = process.stdout
    const BRACKETED_PASTE_ON = "\u001b[?2004h"
    const BRACKETED_PASTE_OFF = "\u001b[?2004l"
    const ENHANCED_KEYS_ON = "\u001b[>24u"
    const ENHANCED_KEYS_OFF = "\u001b[<u"
    const PASTE_START = "\u001b[200~"
    const PASTE_END = "\u001b[201~"

    let answer = ""
    let pasteBuffer = ""
    let isPasting = false
    let pendingEscape = ""

    const normalizeForStorage = (text: string) =>
      text.replace(/\r\n?|\n/g, "\n")
    const normalizeForDisplay = (text: string) =>
      text.replace(/\r\n?|\n/g, "\r\n")

    const decodeTextCodepoints = (encoded: string) => {
      if (!encoded) {
        return ""
      }

      return encoded
        .split(":")
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => String.fromCodePoint(value))
        .join("")
    }

    const parseCsiUSequence = (sequence: string) => {
      if (!sequence.startsWith("\u001b[")) {
        return null
      }

      const terminatorIndex = sequence.indexOf("u")
      if (terminatorIndex === -1) {
        return null
      }

      const body = sequence.slice(2, terminatorIndex)
      if (!/^[0-9:;]+$/.test(body)) {
        return null
      }

      const [keySection = "", modifierSection = "", textSection = ""] =
        body.split(";")
      const keyCodeSection = keySection.split(":")[0] || ""

      if (!/^\d+$/.test(keyCodeSection)) {
        return null
      }

      if (modifierSection && !/^\d+(?::\d+)?$/.test(modifierSection)) {
        return null
      }

      return {
        keyCode: Number.parseInt(keyCodeSection, 10),
        modifiers: modifierSection
          ? Number.parseInt(modifierSection.split(":")[0] || "1", 10)
          : 1,
        textPayload: decodeTextCodepoints(textSection),
        rawLength: terminatorIndex + 1,
      }
    }

    const redrawPrompt = () => {
      stdout.write("\r\u001b[J")
      stdout.write(prompt)
      stdout.write(normalizeForDisplay(answer))
    }

    const removeLastCharacter = () => {
      if (answer.length === 0) {
        return
      }

      answer = Array.from(answer).slice(0, -1).join("")
      redrawPrompt()
    }

    const exitWithSigint = () => {
      cleanup()
      stdout.write("^C\r\n")
      process.exit(130)
    }

    const handleCsiUSequence = (sequence: string) => {
      const parsed = parseCsiUSequence(sequence)
      if (!parsed) {
        return false
      }

      const { keyCode, modifiers, textPayload } = parsed
      const shiftPressed = ((modifiers - 1) & 1) !== 0
      const ctrlPressed = ((modifiers - 1) & 4) !== 0

      if (ctrlPressed && (keyCode === 99 || keyCode === 67)) {
        exitWithSigint()
      }

      if (textPayload) {
        appendText(textPayload)
        return true
      }

      if (keyCode === 13) {
        if (shiftPressed) {
          appendText("\n")
          return true
        }

        commit()
        return true
      }

      if (keyCode === 127 || keyCode === 8) {
        removeLastCharacter()
        return true
      }

      return true
    }

    const cleanup = () => {
      stdout.write(ENHANCED_KEYS_OFF)
      stdout.write(BRACKETED_PASTE_OFF)
      stdin.off("data", onData)
      stdin.setRawMode(false)
      stdin.pause()
    }

    const commit = () => {
      cleanup()
      stdout.write("\r\n")
      resolve(answer)
    }

    const appendText = (text: string) => {
      if (!text) {
        return
      }

      answer += normalizeForStorage(text)
      stdout.write(normalizeForDisplay(text))
    }

    const handleControlSequence = (chunk: string, startIndex: number) => {
      const sequence = chunk.slice(startIndex)

      const parsedCsiUSequence = parseCsiUSequence(sequence)
      if (parsedCsiUSequence) {
        handleCsiUSequence(sequence.slice(0, parsedCsiUSequence.rawLength))
        return parsedCsiUSequence.rawLength
      }

      if (
        sequence.startsWith("\u001b[A") ||
        sequence.startsWith("\u001b[B") ||
        sequence.startsWith("\u001b[C") ||
        sequence.startsWith("\u001b[D")
      ) {
        return 3
      }

      return 1
    }

    const onData = (chunk: Buffer) => {
      let text = pendingEscape + chunk.toString("utf-8")
      pendingEscape = ""

      while (text.length > 0) {
        if (isPasting) {
          const pasteEndIndex = text.indexOf(PASTE_END)
          if (pasteEndIndex === -1) {
            pasteBuffer += text
            return
          }

          pasteBuffer += text.slice(0, pasteEndIndex)
          appendText(pasteBuffer)
          pasteBuffer = ""
          isPasting = false
          text = text.slice(pasteEndIndex + PASTE_END.length)
          continue
        }

        if (text.startsWith(PASTE_START)) {
          isPasting = true
          text = text.slice(PASTE_START.length)
          continue
        }

        const nextPasteIndex = text.indexOf(PASTE_START)
        const segment =
          nextPasteIndex === -1 ? text : text.slice(0, nextPasteIndex)

        for (let index = 0; index < segment.length; ) {
          const char = segment[index]
          if (char === undefined) {
            index += 1
            continue
          }

          if (char === "\r" || char === "\n") {
            commit()
            return
          }

          if (char === "\u0003") {
            exitWithSigint()
          }

          if (char === "\u007f" || char === "\b") {
            removeLastCharacter()
            index += 1
            continue
          }

          if (char === "\u001b") {
            const controlSequence = segment.slice(index)
            if (
              controlSequence.startsWith("\u001b[") &&
              /^[0-9:;]*$/.test(controlSequence.slice(2))
            ) {
              pendingEscape = controlSequence
              index = segment.length
              continue
            }

            index += handleControlSequence(segment, index)
            continue
          }

          appendText(char)
          index += 1
        }

        text = nextPasteIndex === -1 ? "" : text.slice(nextPasteIndex)
      }
    }

    stdout.write(prompt)
    stdout.write(ENHANCED_KEYS_ON)
    stdout.write(BRACKETED_PASTE_ON)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on("data", onData)
  })
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
    return null
  }
}
