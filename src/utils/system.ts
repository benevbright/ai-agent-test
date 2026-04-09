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
const logFile = path.join(logDir, `${date.toISOString()}-messages.log`);

export function appendMessageToLog(message: ModelMessage) {
  const formattedMessage = JSON.stringify(message, null, 2)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

  let fd: number | undefined;
  try {
    // Open read/write so we can truncate the closing bracket and append in-place.
    fd = fs.openSync(logFile, "a+");
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
    fs.writeFileSync(logFile, `[\n${formattedMessage}\n]\n`);
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }
}
