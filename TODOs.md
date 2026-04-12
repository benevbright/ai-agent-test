## Roadmap

- 1. [ ] concat ~/.ai/SYSTEM.md and project's .ai/SYSTEM.md to ai-agent's system prompt.
- 2. [x] add doc retrival tool. To get latest lib info so the agent can solve tasks more effectively. Not just library, it can be doc for technologies like postgres. so approach should be broader not just like npm library. and check internet_search tool if you can extract logic and have shared code. also improve SYSTEM.md once it's done.
- 3. [ ] improve loop with testing tools so the agent can complete tasks in better shape.

## Backlog ideas

- 1. [ ] what testing tool? and what about puppeteer?

## Bugs

- 1. [ ] user can backspace to delete even "Prompt: ".
- 2. [ ] when user input gets to next line, the cursor can't come back to the first line with backspace. Backspace seems actually deleting but it's not visible to user.
