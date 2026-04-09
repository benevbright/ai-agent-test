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
const sessionFile = path.join(sessionDir, `${date.toISOString().replace(/\.\d{3}Z$/, "")}-messages.json`);

export function appendMessageToLog(message: ModelMessage) {
  // Read existing content
  let messages: ModelMessage[] = [];
  try {
    const existingContent = fs.readFileSync(sessionFile, "utf-8");
    if (existingContent.trim() !== "") {
      messages = JSON.parse(existingContent);
    }
  } catch (error) {
    // File doesn't exist or is invalid, start with empty array
  }

  messages.push(message);

  // Write updated messages array
  fs.writeFileSync(sessionFile, JSON.stringify(messages, null, 2));
}

export function listSessions(limit: number = 20): Array<{ file: string; timestamp: string; summary?: string }> {
  if (!fs.existsSync(sessionDir)) {
    return [];
  }

  const files = fs.readdirSync(sessionDir)
    .filter((file) => file.endsWith("-messages.json"))
    .sort((a, b) => {
      // Sort by filename (which includes ISO timestamp) in reverse chronological order
      return b.localeCompare(a);
    })
    .slice(0, limit);

  const result: Array<{ file: string; timestamp: string; summary?: string }> = files.map((file) => {
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
        summary = combined.length > 40 
          ? combined.substring(0, 40) + "..."
          : combined;
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
