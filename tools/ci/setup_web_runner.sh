#!/usr/bin/env bash
# Register one web runner for a repo on this PC. Follows the plan in
# rhicksrad/Pharaoh docs/CI_RUNNERS.md, Part 2. Re-runnable.
#
# Run it as yourself (a user with sudo and an admin `gh` login), once per PC:
#
#   curl -fsSL https://raw.githubusercontent.com/rhicksrad/Ryan/main/tools/ci/setup_web_runner.sh | bash -s -- rhicksrad/Ryan
#
# What it does:
#   1. Creates the unprivileged `ghrunner` user (no gh login, no SSH keys, no sudo).
#   2. Installs Chromium's system libraries (needs sudo, and node on this PC).
#   3. Registers a runner on the repo, labelled by what this PC has.
#   4. Installs the job-started hook that refuses fork pull requests.
#   5. Runs it as a low-priority user service inside a capped systemd slice.
#   6. Adds a weekly cleanup timer.
#   7. Turns on "require approval for all outside collaborators" and sets the
#      repo variable CI_RUNNER=local, which sends CI to the PCs.
#
# Options (environment): RUNNER_USER, RUNNER_NAME, RUNNER_VERSION, EXTRA_LABELS,
# NO_PLAYWRIGHT=1, NO_SWITCH=1 (register only, leave CI on GitHub), E2E=1 (also
# move browser tests to the PCs; fast machines only), FORCE=1.
set -euo pipefail

REPO=${1:-rhicksrad/Ryan}
RUNNER_USER=${RUNNER_USER:-ghrunner}
RUNNER_VERSION=${RUNNER_VERSION:-2.338.2}
HOST=$(hostname | tr 'A-Z' 'a-z')
[ "$HOST" = presidentscroob ] && HOST=scroob
REPO_NAME=${REPO#*/}
REPO_SLUG=$(printf '%s' "$REPO_NAME" | tr 'A-Z' 'a-z')
RUNNER_NAME=${RUNNER_NAME:-$HOST-$REPO_SLUG}

say() { printf '\n== %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "run as your own user, not root; the script calls sudo where it must"
command -v sudo >/dev/null || die "sudo is not available"
[ "$(uname -s)" = Linux ] || die "Linux only (on Windows, run inside WSL Ubuntu)"
if [ "$HOST" = darkhelmet ] && [ "${FORCE:-}" != 1 ]; then
  die "DarkHelmet is the perf-timing box and takes no web jobs (FORCE=1 overrides)"
fi

# Under WSL, Windows tools sit on PATH (/mnt/c/...). Windows' gh is fine to
# borrow (it carries the login); Windows' node is not (it can't install Linux
# libraries), so only a Linux npx counts.
linux_cmd() { case "$(command -v "$1" 2>/dev/null)" in ''|/mnt/*) return 1 ;; esac; }
if ! linux_cmd npx || ! command -v curl >/dev/null || ! command -v python3 >/dev/null; then
  say "Installing prerequisites (curl, python3, nodejs, npm)"
  sudo apt-get update -qq
  sudo apt-get install -y -qq curl python3 nodejs npm
fi
GH=gh
if ! command -v gh >/dev/null; then
  command -v gh.exe >/dev/null || die "gh is not installed (sudo apt-get install gh, then gh auth login)"
  GH=gh.exe
fi
# gh.exe ends lines with CRLF; strip it so tokens and statuses compare cleanly.
gh() { command "$GH" "$@" | tr -d '\r'; }

say "Checking admin access to $REPO"
TOKEN=$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token) \
  && [ -n "$TOKEN" ] \
  || die "could not get a registration token; gh needs admin on $REPO"

say "User $RUNNER_USER"
if ! id "$RUNNER_USER" >/dev/null 2>&1; then
  sudo adduser --disabled-password --gecos '' "$RUNNER_USER"
fi
sudo loginctl enable-linger "$RUNNER_USER"
RUNNER_UID=$(id -u "$RUNNER_USER")
# Linger starts the user's systemd a moment later; wait for its bus.
for _ in $(seq 1 30); do sudo test -S "/run/user/$RUNNER_UID/bus" && break; sleep 1; done
sudo test -S "/run/user/$RUNNER_UID/bus" || die "systemd user manager for $RUNNER_USER did not start"
RUNNER_HOME=$(getent passwd "$RUNNER_USER" | cut -d: -f6)
if sudo -u "$RUNNER_USER" test -r "$HOME" 2>/dev/null; then
  echo "WARNING: $RUNNER_USER can read $HOME. Close it with: chmod 750 $HOME"
fi

LABELS="web,web-trusted,$HOST"
if [ "${NO_PLAYWRIGHT:-}" != 1 ]; then
  say "Chromium system libraries"
  if linux_cmd npx && sudo env "PATH=$PATH" "$(command -v npx)" --yes playwright@latest install-deps chromium; then
    LABELS="$LABELS,playwright"
  else
    echo "Skipped: no Linux npx here, or Playwright does not support this OS."
    echo "This runner will not take browser jobs (no 'playwright' label)."
  fi
fi
if command -v uv >/dev/null && python3 -c 'import sys; sys.exit(sys.version_info < (3, 11))' 2>/dev/null; then
  LABELS="$LABELS,python"
fi
case ",$LABELS," in *,playwright,*) [ "${E2E:-}" != 1 ] || LABELS="$LABELS,e2e" ;; esac
[ -z "${EXTRA_LABELS:-}" ] || LABELS="$LABELS,$EXTRA_LABELS"

say "Installing runner $RUNNER_NAME ($LABELS)"
sudo -u "$RUNNER_USER" -H env \
  REPO="$REPO" REPO_NAME="$REPO_NAME" RUNNER_NAME="$RUNNER_NAME" LABELS="$LABELS" \
  TOKEN="$TOKEN" RUNNER_VERSION="$RUNNER_VERSION" XDG_RUNTIME_DIR="/run/user/$RUNNER_UID" \
  bash -s <<'AS_RUNNER'
set -euo pipefail
BASE=$HOME/actions-runners
D=$BASE/$REPO_NAME
UNITS=$HOME/.config/systemd/user
mkdir -p "$D" "$BASE/_toolcache" "$BASE/ms-playwright" "$UNITS"

# Job-started hook: the runner-side refusal of untrusted events.
cat > "$BASE/refuse_untrusted.sh" <<'HOOK'
#!/usr/bin/env bash
set -eu
case "${GITHUB_EVENT_NAME:-}" in
  pull_request_target)
    echo "refused: pull_request_target on a self-hosted runner"; exit 1 ;;
  pull_request|pull_request_review|pull_request_review_comment)
    head=$(python3 -c 'import json,os;e=json.load(open(os.environ["GITHUB_EVENT_PATH"]));print(e["pull_request"]["head"]["repo"]["full_name"])')
    [ "$head" = "${GITHUB_REPOSITORY:-}" ] || { echo "refused: pull request from fork $head"; exit 1; } ;;
esac
free_gb=$(df -Pk "$HOME" | awk 'NR==2 {print int($4/1048576)}')
[ "$free_gb" -ge "${RUNNER_MIN_FREE_GB:-10}" ] || { echo "refused: only ${free_gb} GB free"; exit 1; }
HOOK
chmod 755 "$BASE/refuse_untrusted.sh"

# One download shared by every repo's runner on this PC.
TARBALL=$BASE/runner-$RUNNER_VERSION.tgz
if [ ! -s "$TARBALL" ]; then
  curl -fsSL -o "$TARBALL.part" \
    "https://github.com/actions/runner/releases/download/v$RUNNER_VERSION/actions-runner-linux-x64-$RUNNER_VERSION.tar.gz"
  mv "$TARBALL.part" "$TARBALL"
fi
cd "$D"
[ -x ./config.sh ] || tar xzf "$TARBALL"
if [ -f .runner ]; then
  echo "Already registered here; leaving the registration alone."
else
  ./config.sh --unattended --replace --url "https://github.com/$REPO" --token "$TOKEN" \
    --name "$RUNNER_NAME" --labels "$LABELS" --work _work
fi

# The service has no login shell, so everything a job needs goes here.
cat > .env <<ENV
PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
RUNNER_TOOL_CACHE=$BASE/_toolcache
PLAYWRIGHT_BROWSERS_PATH=$BASE/ms-playwright
ACTIONS_RUNNER_HOOK_JOB_STARTED=$BASE/refuse_untrusted.sh
ENV

# One ceiling for all web runners, so five repos firing at once can't starve the PC.
cat > "$UNITS/web-runners.slice" <<'UNIT'
[Slice]
CPUQuota=400%
MemoryMax=8G
UNIT
cat > "$UNITS/runner-$REPO_NAME.service" <<UNIT
[Unit]
Description=GitHub Actions runner $RUNNER_NAME ($REPO)
After=network-online.target

[Service]
WorkingDirectory=$D
ExecStart=$D/run.sh
Restart=always
RestartSec=10
Nice=15
Slice=web-runners.slice

[Install]
WantedBy=default.target
UNIT

# Weekly: drop stale temp files and logs, and trim the shared npm cache.
cat > "$BASE/cleanup.sh" <<'CLEAN'
#!/usr/bin/env bash
set -u
BASE=$HOME/actions-runners
find "$BASE"/*/_work/_temp -mindepth 1 -mtime +14 -delete 2>/dev/null
find "$BASE"/*/_diag -name '*.log' -mtime +14 -delete 2>/dev/null
find "$HOME/.npm/_cacache" -type f -atime +60 -delete 2>/dev/null
command -v pnpm >/dev/null && pnpm store prune >/dev/null 2>&1
exit 0
CLEAN
chmod 755 "$BASE/cleanup.sh"
cat > "$UNITS/web-runners-cleanup.service" <<UNIT
[Unit]
Description=Weekly cleanup for the web runners

[Service]
Type=oneshot
ExecStart=$BASE/cleanup.sh
Nice=19
UNIT
cat > "$UNITS/web-runners-cleanup.timer" <<'UNIT'
[Unit]
Description=Weekly cleanup for the web runners

[Timer]
OnCalendar=Sun 04:30
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now "runner-$REPO_NAME.service" web-runners-cleanup.timer
systemctl --user restart "runner-$REPO_NAME.service"
AS_RUNNER

say "Waiting for $RUNNER_NAME to come online"
online=
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 5
  status=$(gh api "repos/$REPO/actions/runners" \
    --jq ".runners[] | select(.name == \"$RUNNER_NAME\") | .status" 2>/dev/null || true)
  if [ "$status" = online ]; then online=1; break; fi
done
[ -n "$online" ] || die "$RUNNER_NAME did not come online. Check: sudo -u $RUNNER_USER XDG_RUNTIME_DIR=/run/user/$RUNNER_UID journalctl --user -u runner-$REPO_NAME -n 50"
echo "$RUNNER_NAME is online."

say "Repo settings"
if gh api -X PUT "repos/$REPO/actions/permissions/fork-pr-contributor-approval" \
     -f approval_policy=all_external_contributors >/dev/null 2>&1; then
  echo "Fork pull requests now need approval for all outside collaborators."
else
  echo "WARNING: could not set fork approval through the API. Set it by hand:"
  echo "  https://github.com/$REPO/settings/actions  >  Fork pull request workflows"
  echo "  >  Require approval for all outside collaborators"
fi
if [ "${NO_SWITCH:-}" = 1 ]; then
  echo "Left CI_RUNNER alone (NO_SWITCH=1). CI stays on GitHub's machines."
elif gh api -X PATCH "repos/$REPO/actions/variables/CI_RUNNER" -f name=CI_RUNNER -f value=local >/dev/null 2>&1 \
  || gh api -X POST "repos/$REPO/actions/variables" -f name=CI_RUNNER -f value=local >/dev/null 2>&1; then
  echo "CI_RUNNER=local: CI for $REPO now runs on the PCs."
  # Browser tests render the 3D town in software and need a fast PC. The first
  # runner (an Intel laptop under WSL) took 13 minutes and timed out, so this
  # switch is opt-in: E2E=1 on a PC with cores to spare, such as Scroob.
  if [ "${E2E:-}" = 1 ]; then
    case ",$LABELS," in
      *,e2e,*)
        gh api -X PATCH "repos/$REPO/actions/variables/CI_E2E_RUNNER" -f name=CI_E2E_RUNNER -f value=local >/dev/null 2>&1 \
          || gh api -X POST "repos/$REPO/actions/variables" -f name=CI_E2E_RUNNER -f value=local >/dev/null 2>&1 \
          || echo "WARNING: could not set CI_E2E_RUNNER"
        echo "CI_E2E_RUNNER=local: browser jobs run on the PCs too." ;;
      *) echo "E2E=1 ignored: this PC cannot run Chromium." ;;
    esac
  else
    echo "Browser jobs stay on GitHub's machines (pass E2E=1 on a fast PC to move them)."
  fi
else
  echo "WARNING: could not set the CI_RUNNER variable. Set it to 'local' at:"
  echo "  https://github.com/$REPO/settings/variables/actions"
fi

say "Done"
gh api "repos/$REPO/actions/runners" \
  --jq '.runners[] | "\(.name) \(.status) \([.labels[].name] | join(","))"'
