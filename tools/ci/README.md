# CI on Ryan's PCs

The full inventory and reasoning live in
[Pharaoh's `docs/CI_RUNNERS.md`](https://github.com/rhicksrad/Pharaoh/blob/main/docs/CI_RUNNERS.md).
This is the short version for this repo.

## How jobs are routed

| Job | Workflow | Runs on | When |
| --- | --- | --- | --- |
| `gate`: install, typecheck, unit tests, build, size budget | `ci.yml` | PC (`web-trusted`) | every pull request push |
| `e2e`: Playwright on desktop and phone | `ci.yml` | PC (`web-trusted`, `playwright`) | every pull request push |
| `build` | `pages.yml` | PC (`web-trusted`) | push to `main` |
| `deploy` | `pages.yml` | GitHub | push to `main` |
| `update-stats` | `update-stats.yml` | GitHub | Mondays 09:00 UTC |

The two jobs that hold write tokens (`deploy`, `update-stats`) never run on a PC.

**The switch** is the repo variable `CI_RUNNER`. `local` sends trusted events to
the PCs. Delete it and everything runs on GitHub's machines, which are free for
this public repo. Do that when the PCs are off: a job whose labels match no
online runner queues for up to a day without failing.

```bash
gh api -X DELETE repos/rhicksrad/Ryan/actions/variables/CI_RUNNER                       # back to GitHub
gh api -X POST repos/rhicksrad/Ryan/actions/variables -f name=CI_RUNNER -f value=local  # back to the PCs
```

## Safety on a public repo

A fork can rewrite `runs-on`, so the workflow file alone protects nothing.
Three layers do:

1. Repo setting: fork pull requests need approval for all outside collaborators.
2. `refuse_untrusted.sh`, installed as each runner's job-started hook, fails any
   job from a fork pull request or `pull_request_target`, and any job when the
   disk has under 10 GB free.
3. The runners run as `ghrunner`, a user with no `gh` login, no SSH keys, no
   sudo, and no access to Ryan's home folder.

Inside the workflows: `contents: read` by default, write permissions only on the
job that needs them, first-party actions only, no secrets on pull requests.

## Adding a PC

Agents may not install services. A person runs this once per PC (Scroob and
MajorAsshole; not DarkHelmet, which is kept quiet for perf timing):

```bash
curl -fsSL https://raw.githubusercontent.com/rhicksrad/Ryan/main/tools/ci/setup_web_runner.sh | bash -s -- rhicksrad/Ryan
```

It needs sudo and a `gh` login with admin on the repo. It creates `ghrunner`,
installs Chromium's system libraries, registers a runner named `<pc>-ryan`,
installs the hook, starts a low-priority service inside a capped systemd slice
(4 cores, 8 GB for all web runners together), adds a weekly cleanup timer, turns
on the fork approval setting, and sets `CI_RUNNER=local`. It is re-runnable and
takes any repo as its argument, so the same command registers NASA, art, NBA, or
NCAAM.

A PC only gets the `playwright` label if the system libraries install, so
browser jobs never land on a machine that cannot run them.

Check on things:

```bash
gh api repos/rhicksrad/Ryan/actions/runners --jq '.runners[] | "\(.name) \(.status) \([.labels[].name]|join(","))"'
sudo -u ghrunner XDG_RUNTIME_DIR=/run/user/$(id -u ghrunner) systemctl --user status runner-Ryan
```

## Caching and cleanup

- `npm ci` reuses `ghrunner`'s `~/.npm`; GitHub's cache is used only on GitHub's machines.
- Node lives in a shared tool cache, Chromium in a shared browser folder.
- Every job ends with `git clean -ffdx` on a PC, and checkout cleans again at the start.
- Browser tests pick a free port, since several repos share a PC.
- Sundays 04:30: temp files and logs older than 14 days go, and the npm cache is trimmed.
