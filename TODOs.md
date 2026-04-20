## Roadmap

1. [x] find user's machine's ~/.ai/SYSTEM.md file and concat to ai-agent's system prompt.
2. [x] add doc retrival tool. To get latest lib info so the agent can solve tasks more effectively. Not just library, it can be doc for technologies like postgres. so approach should be broader not just like npm library. and check internet_search tool if you can extract logic and have shared code. also improve SYSTEM.md once it's done.
3. [ ] improve loop with testing tools so the agent can complete tasks in better shape. basically we need "verify" step on the loop. (improve system prompt or better ideas)
4. [ ] Compaction-like feature, but not exactly compaction that is in other coding agents. Summarize current conversation and save to a file, then restart a new session with the summary.
5. [x] one-off CLI command to run a task without starting the agent loop. For example, `ai-agent run "write a function to reverse a string in python"`. This may evolve into a sub-agent feature.

## Backlog ideas

1. [ ] what testing tool? and what about puppeteer?

## Bugs

1. [x] user can backspace to delete even "Prompt: ".
2. [ ] when user input gets to next line, the cursor can't come back to the first line with backspace. Backspace seems actually deleting but it's not visible to user.
3. [x] edit tool (or read tool) doesn't work well when there is backslash in the content that they need to handle. for example the codebase had a line like `systemPrompt += "\n\n---\n\nCLI System Prompt\n\" + cliSystemPrompt` and couldn't resolve it because there was a backslash before closing quote.
4. [x] on prompt mode, if the prompt stoped by `ask_user_followup` tool, fill arbitrary message so loop can continue.
5. [ ] "Preserve reasoning" is not working because reasoning blocks are dropped from processing messages for next turn by "node_modules/@ai-sdk/openai/src/chat/convert-to-openai-chat-messages.ts". It seems it's because we're using Chat API, not response API. Also need to consider using "@ai-sdk/open-responses" lib. Not easy but curious how much it changes the results. (could be not much)
