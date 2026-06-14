# Agent Teams — Master Reference Guide

> Source: https://code.claude.com/docs/en/agent-teams
> Requires: Claude Code v2.1.32+, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`

---

## What Are Agent Teams?

Agent teams coordinate multiple Claude Code instances working in parallel. One session is the **team lead**; the rest are **teammates**. Unlike subagents (which only report back to the caller), teammates can message each other directly, share a task list, and self-coordinate.

---

## Enable Agent Teams

Add to `.claude/settings.local.json` (project) or `~/.claude/settings.json` (user):

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

---

## Architecture

| Component   | Role |
|-------------|------|
| Team lead   | Creates the team, spawns teammates, coordinates work, synthesizes results |
| Teammates   | Separate Claude Code instances; each owns assigned tasks |
| Task list   | Shared work items with states: pending → in_progress → completed |
| Mailbox     | Async messaging system between any two agents by name |

**Storage (runtime only — deleted on cleanup):**
- Team config: `~/.claude/teams/{team-name}/config.json`
- Task list: `~/.claude/tasks/{team-name}/`

> Never pre-author or hand-edit the team config — it is overwritten on every state update.

---

## Agent Teams vs. Subagents

| | Subagents | Agent Teams |
|---|---|---|
| Context | Own window; results return to caller | Own window; fully independent |
| Communication | Only back to main agent | Teammates message each other directly |
| Coordination | Main agent controls everything | Shared task list; self-coordination |
| Best for | Focused tasks where only the result matters | Complex work needing discussion and collaboration |
| Token cost | Lower (results summarized back) | Higher (each teammate = separate Claude instance) |

**Rule of thumb:** use subagents for quick, isolated workers. Use agent teams when teammates need to share findings, challenge each other, or own separate long-running workstreams.

---

## When to Use Agent Teams

### Strong use cases
- **Parallel research/review** — multiple teammates investigate different facets simultaneously
- **New independent modules** — each teammate owns a distinct feature or file set with no overlap
- **Competing hypotheses debugging** — teammates test different root-cause theories in parallel and converge
- **Cross-layer changes** — frontend, backend, and tests each owned by a different teammate

### Avoid agent teams when
- Tasks are sequential (each step depends on the previous)
- Multiple teammates would edit the same files
- The task is simple enough for one session or subagents
- Coordination overhead would exceed the benefit

---

## Starting a Team

Tell Claude what you want in natural language — it decides how many teammates to spawn:

```text
I'm designing a CLI tool for tracking TODOs across a codebase. Create an agent
team to explore this: one teammate on UX, one on technical architecture, one
playing devil's advocate.
```

Or specify exactly:

```text
Create a team with 4 teammates to refactor these modules in parallel.
Use Sonnet for each teammate.
```

Teammates don't inherit the lead's `/model` selection by default. Set **Default teammate model** in `/config` or specify it per spawn.

---

## Display Modes

| Mode | How it works | Requirement |
|------|-------------|-------------|
| `in-process` (default fallback) | All teammates in one terminal; Shift+Down cycles between them | Any terminal |
| `tmux` / split panes | Each teammate in its own pane; see all at once | tmux or iTerm2 + `it2` CLI |
| `auto` (default) | Split panes if already in tmux/iTerm2, else in-process | — |

Override globally in `~/.claude/settings.json`:

```json
{ "teammateMode": "in-process" }
```

Or per session:

```bash
claude --teammate-mode in-process
```

**VS Code integrated terminal, Windows Terminal, and Ghostty do not support split-pane mode.**

---

## Controlling the Team

### Interact with teammates
- **In-process**: Shift+Down cycles through teammates → type to message them directly. Enter = view session; Escape = interrupt. Ctrl+T = toggle task list.
- **Split-pane**: click into any teammate's pane.

### Task assignment
- Lead assigns tasks explicitly, or teammates self-claim the next unblocked item.
- Tasks can declare dependencies; blocked tasks unblock automatically when dependencies complete.
- File locking prevents race conditions when multiple teammates try to claim the same task.

### Require plan approval before implementation

```text
Spawn an architect teammate to refactor the auth module.
Require plan approval before they make any changes.
```

Teammate stays in read-only plan mode → submits plan → lead approves or rejects with feedback → teammate implements once approved. Control the lead's criteria via your prompt: `"only approve plans that include test coverage"`.

### Shut down a teammate

```text
Ask the researcher teammate to shut down
```

The teammate can accept (exits gracefully) or reject with an explanation.

### Clean up the team

```text
Clean up the team
```

Always run cleanup from the lead. Clean up active teammates first — cleanup fails if any are still running. Claude often self-cleans when done.

---

## Context Each Teammate Receives

On spawn, each teammate automatically loads:
- CLAUDE.md (from its working directory)
- MCP servers (from project + user settings)
- Skills (from project + user settings)
- The spawn prompt from the lead

**What is NOT inherited:** the lead's conversation history.

Include all task-specific context in the spawn prompt:

```text
Spawn a security reviewer with: "Review src/auth/ for vulnerabilities.
Focus on token handling, session management, and input validation.
The app uses JWT tokens in httpOnly cookies. Rate all issues by severity."
```

---

## Subagent Definitions as Teammate Types

Reuse a subagent definition (project/user/plugin/CLI scope) as a teammate type:

```text
Spawn a teammate using the security-reviewer agent type to audit the auth module.
```

The teammate honors the definition's `tools` allowlist and `model`. The definition body appends to (does not replace) the teammate's system prompt. Team coordination tools (`SendMessage`, task tools) are always available even when `tools` restricts others.

> `skills` and `mcpServers` frontmatter fields in subagent definitions are **not** applied when running as a teammate. They load from project/user settings instead.

---

## Permissions

All teammates start with the lead's permission mode. If lead runs `--dangerously-skip-permissions`, all teammates do too. You can change individual teammate modes after spawning; you cannot set per-teammate modes at spawn time.

Pre-approve common operations before spawning to avoid repeated prompts.

---

## Hooks for Quality Gates

| Hook | Trigger | Exit 2 effect |
|------|---------|--------------|
| `TeammateIdle` | Teammate is about to go idle | Sends feedback; keeps teammate working |
| `TaskCreated` | A task is being created | Prevents creation; sends feedback |
| `TaskCompleted` | A task is being marked complete | Prevents completion; sends feedback |

---

## Token Costs

Each teammate = its own context window = independent token consumption. Costs scale linearly with teammate count. Agent teams are worth the cost for research, review, and new feature work. For routine tasks, a single session wins.

---

## Best Practices

### Team size
- **Start with 3–5 teammates** for most workflows.
- 5–6 tasks per teammate keeps everyone productive without excessive context switching.
- Scale up only when work genuinely benefits from simultaneous parallel effort.
- More teammates = more coordination overhead and diminishing returns.

### Task sizing
- **Too small**: coordination overhead exceeds the benefit.
- **Too large**: teammates work too long without check-ins; wasted effort risk rises.
- **Just right**: self-contained units with a clear deliverable — a function, a test file, a review finding.

### File ownership
- Never have two teammates edit the same file. Break work so each teammate owns a distinct file set.

### Steering
- Check in on progress regularly; redirect approaches that aren't working.
- If the lead starts doing work instead of delegating: `"Wait for your teammates to complete their tasks before proceeding."`
- Don't let a team run unattended too long.

### Start simple
- Begin with research/review tasks (no code changes) to learn team dynamics before attempting parallel implementation.

### Give rich spawn prompts
- Include file paths, relevant context, constraints, output format, and focus area in every spawn instruction.

---

## Prompt Templates

### Parallel code review

```text
Create an agent team to review PR #[number]. Spawn three reviewers:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

### Competing hypotheses debugging

```text
Users report [symptom]. Spawn 5 agent teammates to investigate different
hypotheses. Have them talk to each other to try to disprove each other's
theories, like a scientific debate. Update the findings doc with whatever
consensus emerges.
```

### Parallel feature implementation

```text
Create a team with 3 teammates to implement [feature]:
- Teammate "frontend": own src/components/[X] and src/pages/[X]
- Teammate "backend": own src/api/[X] and src/services/[X]
- Teammate "tests": write integration and unit tests after the others finish
Use Sonnet for each teammate. Require plan approval before any file changes.
```

### Research from multiple angles

```text
Create an agent team to explore [topic] from different angles: one teammate on
[angle A], one on [angle B], one playing devil's advocate. Have them share and
challenge each other's findings, then synthesize a recommendation.
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Teammates not appearing | Press Shift+Down (in-process). Check task complexity — Claude only spawns if warranted. Verify `tmux` in PATH for split-pane mode. |
| Too many permission prompts | Pre-approve operations in permission settings before spawning. |
| Teammate stops on error | Inspect via Shift+Down; give direct instructions or spawn a replacement. |
| Lead shuts down early | Tell it to keep going; instruct it to wait for teammates before proceeding. |
| Orphaned tmux session | `tmux ls` then `tmux kill-session -t <name>` |
| Stuck task blocking dependents | Check if work is actually done; tell lead to nudge the teammate or update task status manually. |

---

## Known Limitations

- **No session resumption for in-process teammates** — `/resume` and `/rewind` do not restore them.
- **Task status can lag** — teammates sometimes fail to mark tasks complete; monitor and nudge manually.
- **Shutdown can be slow** — teammates finish their current request before exiting.
- **One team at a time** — clean up before creating a new team.
- **No nested teams** — only the lead can spawn teammates; teammates cannot spawn their own teams.
- **Lead is fixed** — the session that creates the team is always the lead.
- **Split panes unsupported** in VS Code integrated terminal, Windows Terminal, and Ghostty.

---

## Quick Reference

```text
# Enable (already set in this project's .claude/settings.local.json)
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# Navigate teammates (in-process mode)
Shift+Down       → cycle to next teammate
Enter            → view teammate session
Escape           → interrupt current turn
Ctrl+T           → toggle task list

# Useful lead instructions
"Wait for your teammates before proceeding."
"Ask [name] teammate to shut down."
"Clean up the team."
"Split the work into smaller tasks — aim for 5-6 per teammate."
"Require plan approval before any teammate makes file changes."
```
