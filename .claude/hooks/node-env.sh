# Sourced by the hooks. Hooks run in a non-interactive shell, so select the project's Node (.nvmrc) through nvm.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    # nvm is not `set -u` safe; restore the caller's options afterwards.
    case $- in *u*) restore_u=1 ;; *) restore_u=0 ;; esac
    set +u
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh" --no-use
    [ -f "$CLAUDE_PROJECT_DIR/.nvmrc" ] && { nvm use --silent >/dev/null 2>&1 || true; }
    [ "$restore_u" = 1 ] && set -u
fi
export PATH="$CLAUDE_PROJECT_DIR/node_modules/.bin:$PATH"
