import * as fs from "fs";
import path from "path";
import type { ModelMessage } from "ai";
import { homedir } from "os";

// Log file setup
const logDir = path.join(homedir(), ".ai", "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const date = new Date();
const datePart = date.toISOString().split("T")[0];
const timePart = date.toISOString().split("T")[1]?.replace(/[:.]/g, "-") || "00-00-00-000";
const logFile = path.join(
  logDir,
  `agent-${datePart}-${timePart}.log`,
);

export function logToFile(message: string) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFile, logEntry);
}

export function logMessages(messages: ModelMessage[]) {
  logToFile("\n--- Current Messages ---");
  messages.forEach((msg, idx) => {
    logToFile(`Message ${idx}: ${msg.role}`);
    if (Array.isArray(msg.content)) {
      msg.content.forEach((c: any) => {
        if (c.type === "text")
          logToFile(`  [Text] ${c.text.substring(0, 100)}...`);
        else if (c.type === "tool-call")
          logToFile(`  [Tool Call] ${c.toolName}`);
        else if (c.type === "tool-result")
          logToFile(`  [Tool Result] ${c.toolName}`);
      });
    } else {
      logToFile(
        `  Content: ${typeof msg.content === "string" ? msg.content.substring(0, 100) : JSON.stringify(msg.content)}`,
      );
    }
  });
  logToFile("--- End Messages ---\n");
}
