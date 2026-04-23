# pi-token-stats

A [pi](https://shittycodingagent.ai/) extension that shows token usage for every session in the current project.

## Philosophy

> "For this session to finish or complete a task, how many tokens did I use?"

This extension helps you understand your consumption patterns across sessions — so you can see averages, costs, and identify which tasks are expensive.

## Install

```bash
pi install git:github.com/dheerapat/pi-token-stats
```

Or test without installing:

```bash
pi -e git:github.com/dheerapat/pi-token-stats
```

## Usage

Inside pi, run:

```
/tokens
```

### Example output

```
Token Usage Summary — 4 sessions

Session                      Last Active   Msgs     Input    Output  Cache Rd     Total      Cost
──────────────────────────────────────────────────────────────────────────────────────────────────
Refactor auth module         Apr 22, 2026     12    45,230     8,120    12,000    65,350     $0.42
Fix login bug                Apr 21, 2026      5    12,000     3,000         0    15,000     $0.10
Add OAuth flow               Apr 18, 2026      8    22,100     4,500     5,000    31,600     $0.22
Cleanup deps                 Apr 15, 2026      3     1,200       400         0     1,600     $0.01
──────────────────────────────────────────────────────────────────────────────────────────────────
TOTAL                                               80,530    16,020    17,000   113,550     $0.75
──────────────────────────────────────────────────────────────────────────────────────────────────
AVG / SESSION                                       20,133     4,005     4,250    28,388     $0.19

Press Enter, Esc, or q to close
```

## Features

- **Per-session totals** — input, output, cache read, total tokens, and cost
- **Last active date** — based on the latest entry in the session file (not just file mtime)
- **Average per session** — answers "how much does a typical task cost me?"
- **Sorted by recency** — most recently active sessions first
- **Works in all modes** — interactive TUI, print mode (`-p`), and JSON mode

## License

MIT
