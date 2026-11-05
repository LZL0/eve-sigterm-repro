# eve: self-hosted server doesn't exit on SIGTERM after a turn

A minimal agent: one tool that makes an HTTP POST, a fake OpenAI-compatible model, the local world.
`repro.mjs` starts the fake model server and the built agent, sends one turn, waits for it to finish,
then sends SIGTERM and waits 30 s.

## Run it

```sh
bun install
npx eve build            # under Node: preset node-server
node repro.mjs --runtime node

# Bun preset instead:
bun node_modules/eve/bin/eve.js build
node repro.mjs --runtime bun
```

Options: `--no-tool` makes the model reply without calling the tool; `--idle` skips the turn.

## Results (macOS 13.5 arm64, Node 24.22.1, Bun 1.4.4)

| eve | Runtime | No turn | Turn, no tool | Turn with a tool call |
|---|---|---|---|---|
| 1.0.0-rc.2 | Bun | exits in 15 ms | exits in 23 ms | exits in 20 ms |
| 1.0.0-rc.2 | Node | | | exits in 34 ms |
| 1.0.0-rc.3 | Bun | | | still running after 30 s |
| 1.0.0-rc.3 | Node | | | still running after 30 s |
| 1.0.0-rc.4 | Bun | exits in 1 s | | still running after 30 s |
| 1.0.0-rc.4 | Node | | | still running after 30 s |
| 1.0.0-rc.5 | Bun | | still running after 30 s | still running after 30 s |
| 1.0.0-rc.5 | Node | exits in 1 s | still running after 30 s | still running after 30 s |

When it hangs, the server prints `Stopping server gracefully (5s)...` and `Server closed successfully.`,
then the process stays alive until SIGKILL.
