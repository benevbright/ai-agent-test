import * as fs from "fs";
import path from "path";
import type { ModelMessage } from "ai";
import { homedir } from "os";

// Session file setup
const sessionDir = path.join(homedir(), ".ai", "sessions");
if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}
const date = new Date();
const sessionFile = path.join(
  sessionDir,
  `${date.toISOString().replace(/\.\d{3}Z$/, "")}-messages.json`,
);

export function appendMessageToLog(message: ModelMessage) {
  const formattedMessage = JSON.stringify(message, null, 2)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

  let fd: number | undefined;
  try {
    // Open read/write so we can truncate the closing bracket and append in-place.
    fd = fs.openSync(sessionFile, "a+");
    const { size } = fs.fstatSync(fd);

    if (size === 0) {
      fs.writeSync(fd, `[\n${formattedMessage}\n]\n`);
      return;
    }

    // Expected file ending is "\n]\n" from our writer.
    if (size >= 3) {
      fs.ftruncateSync(fd, size - 3);
      fs.writeSync(fd, `,\n${formattedMessage}\n]\n`);
      return;
    }

    // Fallback for unexpected tiny/corrupt content.
    fs.ftruncateSync(fd, 0);
    fs.writeSync(fd, `[\n${formattedMessage}\n]\n`);
  } catch {
    // Last-resort fallback keeps logging functional.
    fs.writeFileSync(sessionFile, `[\n${formattedMessage}\n]\n`);
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }
}

export function listSessions(
  limit: number = 20,
): Array<{ file: string; timestamp: string; summary?: string }> {
  if (!fs.existsSync(sessionDir)) {
    return [];
  }

  const files = fs
    .readdirSync(sessionDir)
    .filter((file) => file.endsWith("-messages.json"))
    .sort((a, b) => {
      // Sort by filename (which includes ISO timestamp) in reverse chronological order
      return b.localeCompare(a);
    })
    .slice(0, limit);

  const result: Array<{ file: string; timestamp: string; summary?: string }> =
    files.map((file) => {
      const timestamp = file.split("-messages.json")[0] || "";

      // Try to read and parse the session file for a summary
      let summary: string | undefined = undefined;
      try {
        const content = fs.readFileSync(path.join(sessionDir, file), "utf-8");
        const messages = JSON.parse(content);

        // Collect all user messages and join them
        const userMessages: string[] = [];
        messages.forEach((msg: ModelMessage) => {
          if (msg.role === "user" && typeof msg.content === "string") {
            userMessages.push(msg.content);
          }
        });

        if (userMessages.length > 0) {
          // Join all user messages with spaces
          const combined = userMessages.join(" ");
          // Truncate to 40 characters if needed
          summary =
            combined.length > 40 ? combined.substring(0, 40) + "..." : combined;
        }
      } catch (error) {
        // If we can't read the file, just show timestamp
      }

      const session: { file: string; timestamp: string; summary?: string } = {
        file,
        timestamp,
      };

      if (summary !== undefined) {
        session.summary = summary;
      }

      return session;
    });

  return result;
}
