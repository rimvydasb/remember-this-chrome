#!/usr/bin/env bash
# Stop and SubagentStop: run `npm run depcruise` and `npm run lint` before the agent finishes.
# - On failure, exit 2 sends the output back to the agent, which keeps working.
# - After MAX_ATTEMPTS failures in one session, it lets the agent stop and tells the user.
# Extend the `checks` list for project-specific scripts (typecheck, tests).
set -uo pipefail

MAX_ATTEMPTS=3
checks=(depcruise lint typecheck)

input=$(cat)
cd "$CLAUDE_PROJECT_DIR" || exit 0
session=$(jq -r '.session_id // "none"' <<<"$input")

state_dir="${TMPDIR:-/tmp}/$(basename "$CLAUDE_PROJECT_DIR")-agent-check"
mkdir -p "$state_dir"
attempts_file="$state_dir/$session.attempts"

fail() {
    attempts=$(($(cat "$attempts_file" 2>/dev/null || echo 0) + 1))
    echo "$attempts" >"$attempts_file"
    if [ "$attempts" -gt "$MAX_ATTEMPTS" ]; then
        rm -f "$attempts_file"
        jq -n --arg n "$MAX_ATTEMPTS" --arg c "$1" '{systemMessage: ($c + " still fails after " + $n + " fix attempts. Run it to see the errors.")}'
        exit 0
    fi
    {
        echo "$1 failed (attempt $attempts of $MAX_ATTEMPTS). Fix the errors below, then finish:"
        printf '%s\n' "$2" | tail -80
    } >&2
    exit 2
}

. "$CLAUDE_PROJECT_DIR/.claude/hooks/node-env.sh"

for script in "${checks[@]}"; do
    jq -e --arg s "$script" '.scripts[$s]' package.json >/dev/null 2>&1 || continue
    out=$(npm run "$script" --silent 2>&1) || fail "npm run $script" "$out"
done

rm -f "$attempts_file"
exit 0
