# hermytt

Transport-agnostic terminal multiplexer. One PTY session, any client that speaks text is a terminal.

```
                    ┌─── REST API (/stdin, /stdout SSE)
                    ├─── WebSocket (bidirectional, xterm.js web UI)
PTY (bash/zsh) ────┼─── MQTT (hermytt/{id}/in, hermytt/{id}/out)
                    ├─── Raw TCP (netcat-compatible)
                    └─── Telegram (planned)
```

The hermit lives alone. But he talks to everyone.

## Quick start

```bash
# generate a config
hermytt-server example-config > hermytt.toml

# generate an auth token
hermytt-server gen-token >> hermytt.toml  # paste it into [auth] token =

# start
hermytt-server start -c hermytt.toml
```

Open `http://localhost:7777?token=YOUR_TOKEN` for the web terminal.

## Transports

| Transport | Port | Auth | Buffering |
|-----------|------|------|-----------|
| REST | 7777 | `X-Hermytt-Key` header or `?token=` | 100ms (SSE) |
| WebSocket | 7778 | `?token=` query param | None (real-time) |
| MQTT | broker | Broker auth | 500ms |
| TCP | 7779 | First-line token | None (real-time) |

### REST

```bash
# send a command
curl -X POST http://host:7777/stdin \
  -H 'Content-Type: application/json' \
  -H 'X-Hermytt-Key: TOKEN' \
  -d '{"input": "ls -la"}'

# stream output (SSE)
curl -N http://host:7777/stdout?token=TOKEN

# per-session
curl -X POST http://host:7777/session/ID/stdin ...
curl -N http://host:7777/session/ID/stdout?token=TOKEN

# create session
curl -X POST http://host:7777/session?token=TOKEN

# list sessions
curl http://host:7777/sessions?token=TOKEN
```

### WebSocket

```
ws://host:7778/ws?token=TOKEN          # default session
ws://host:7778/ws/SESSION_ID?token=TOKEN  # specific session
```

### MQTT

```bash
# send command
mosquitto_pub -t hermytt/default/in -m "uptime"
mosquitto_pub -t hermytt/SESSION_ID/in -m "df -h"

# receive output
mosquitto_sub -t hermytt/SESSION_ID/out
```

### TCP

```bash
nc host 7779
# type token, press enter, then you're in
```

### Web UI

Built-in xterm.js terminal at `http://host:7777?token=TOKEN`.

- **+** or **Ctrl+Shift+T** — new session tab
- **Ctrl+Shift+W** — close tab
- **Ctrl+Shift+[** / **]** — switch tabs
- Full terminal: colors, tab completion, scrollback, resize

## Config

```toml
[server]
bind = "127.0.0.1"
shell = "/bin/zsh"
scrollback = 1000

[auth]
token = "your-secret-token"

[transport.rest]
port = 7777

[transport.websocket]
port = 7778

[transport.mqtt]
broker = "10.11.0.7"
port = 1883
username = "mqtt"
password = "secret"

[transport.tcp]
port = 7779
```

All transports are optional — only include the ones you want.

## CLI

```
hermytt-server start [-c config.toml] [-s /bin/zsh] [-b 0.0.0.0]
hermytt-server gen-token
hermytt-server example-config
```

## Architecture

```
hermytt-core/         PTY management, session lifecycle, output buffering
hermytt-transport/    Transport trait + REST, WebSocket, MQTT, TCP
hermytt-server/       Config, CLI, transport wiring
hermytt-cli/          Client CLI (planned)
```

## Building

```bash
cargo build --release
# binary at target/release/hermytt-server (~1.9MB)
```

Requires Rust 2024 edition.

## License

MIT
