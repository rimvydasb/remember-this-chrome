#!/usr/bin/env bash
# PostToolUse (Edit, Write, MultiEdit): format the file the agent changed, then report its lint errors.
# Markdown is reformatted after every edit with proseWrap "never" (.prettierrc), so paragraphs stay on one line.
# The agent does not need to wrap or unwrap Markdown by hand.
# Exit 2 sends stderr back to the agent, which then fixes the file.
set -uo pipefail

file=$(jq -r '.tool_input.file_path // empty')
cd "$CLAUDE_PROJECT_DIR" || exit 0
case "$file" in
    "$CLAUDE_PROJECT_DIR"/*) rel=${file#"$CLAUDE_PROJECT_DIR"/} ;;
    *) exit 0 ;; # outside the repository
esac
[ -f "$rel" ] || exit 0

. "$CLAUDE_PROJECT_DIR/.claude/hooks/node-env.sh"

case "$rel" in
    *.ts | *.tsx | *.js | *.cjs | *.mjs | *.md) prettier --write --log-level error "$rel" >&2 ;;
    *) exit 0 ;;
esac

case "$rel" in
    *.ts | *.tsx | *.js | *.cjs | *.mjs)
        if ! out=$(oxlint --quiet "$rel" 2>&1); then
            printf 'Lint errors in %s. Fix them:\n%s\n' "$rel" "$(printf '%s' "$out" | head -40)" >&2
            exit 2
        fi
        ;;
esac
exit 0
