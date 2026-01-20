# Snapshot file
# Unset all aliases to avoid conflicts with functions
unalias -a 2>/dev/null || true
# Functions
conda () {
	\local cmd="${1-__missing__}"
	case "$cmd" in
		(activate | deactivate) __conda_activate "$@" ;;
		(install | update | upgrade | remove | uninstall) __conda_exe "$@" || \return
			__conda_activate reactivate ;;
		(*) __conda_exe "$@" ;;
	esac
}
# Shell Options
setopt nohashdirs
setopt login
# Aliases
alias -- coder='PATH='\''/Users/rhinesharar/local-models/mlx/qwen-code/.venv/bin:/Library/Frameworks/Python.framework/Versions/3.12/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/opt/pmk/env/global/bin:/Users/rhinesharar/.antigravity/antigravity/bin:/opt/miniconda3/bin:/opt/miniconda3/condabin:/Users/rhinesharar/.local/bin:/Library/Frameworks/Python.framework/Versions/3.12/bin:/Users/rhinesharar/.cargo/bin:/Users/rhinesharar/.lmstudio/bin:/Users/rhinesharar/.lmstudio/bin'\'' '\''/Users/rhinesharar/local-models/mlx/qwen-code/.venv/bin/python3'\'' '\''/Users/rhinesharar/local-models/mlx/qwen-code/launcher.py'\'' Qwen3-Coder-30B-A3B-Instruct-4bit'
alias -- coder80='PATH='\''/Users/rhinesharar/local-models/mlx/qwen-code/.venv/bin:/Library/Frameworks/Python.framework/Versions/3.12/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/opt/pmk/env/global/bin:/Users/rhinesharar/.antigravity/antigravity/bin:/opt/miniconda3/bin:/opt/miniconda3/condabin:/Users/rhinesharar/.local/bin:/Library/Frameworks/Python.framework/Versions/3.12/bin:/Users/rhinesharar/.cargo/bin:/Users/rhinesharar/.lmstudio/bin:/Users/rhinesharar/.lmstudio/bin'\'' '\''/Users/rhinesharar/local-models/mlx/qwen-code/.venv/bin/python3'\'' '\''/Users/rhinesharar/local-models/mlx/qwen-code/launcher.py'\'' Qwen3-Coder-80B-A3B-Instruct-8bit'
alias -- run-help=man
alias -- which-command=whence
alias -- writer='PATH='\''/Users/rhinesharar/local-models/mlx/qwen-code/.venv/bin:/Library/Frameworks/Python.framework/Versions/3.12/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/opt/pmk/env/global/bin:/Users/rhinesharar/.antigravity/antigravity/bin:/opt/miniconda3/bin:/opt/miniconda3/condabin:/Users/rhinesharar/.local/bin:/Library/Frameworks/Python.framework/Versions/3.12/bin:/Users/rhinesharar/.cargo/bin:/Users/rhinesharar/.lmstudio/bin:/Users/rhinesharar/.lmstudio/bin'\'' '\''/Users/rhinesharar/local-models/mlx/qwen-code/.venv/bin/python3'\'' '\''/Users/rhinesharar/local-models/mlx/qwen-code/launcher.py'\'' Qwen3-Next-80B-A3B-Instruct-8bit'
# Check for rg availability
if ! command -v rg >/dev/null 2>&1; then
  alias rg='/Users/rhinesharar/.local/share/claude/versions/1.0.115 --ripgrep'
fi
export PATH=/Users/rhinesharar/.antigravity/antigravity/bin\:/opt/miniconda3/bin\:/opt/miniconda3/condabin\:/Users/rhinesharar/.local/bin\:/Library/Frameworks/Python.framework/Versions/3.12/bin\:/opt/homebrew/bin\:/opt/homebrew/sbin\:/usr/local/bin\:/System/Cryptexes/App/usr/bin\:/usr/bin\:/bin\:/usr/sbin\:/sbin\:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin\:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin\:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin\:/opt/pmk/env/global/bin\:/Users/rhinesharar/.cargo/bin\:/Users/rhinesharar/.lmstudio/bin
