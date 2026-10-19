# warehouse-brake

A Claude Code plugin that **asks before Claude runs a command that can spend Databricks or Snowflake credits, including through dbt.**

It only guards commands Claude runs. It does not guard notebooks, scheduled jobs, or you typing in a terminal. And it reads command text, so it catches well-known shapes, not everything. It is a speed bump, not a security boundary.

![The approval prompt Claude Code shows when warehouse-brake catches an unscoped dbt run](https://raw.githubusercontent.com/thisismairaj/warehouse-brake/main/assets/approval-prompt.png)

This is what you see when Claude tries to run `dbt run` with no `--select`: the command stops until you approve it.

## Why this matters

Cloud data platforms bill by compute time, and the controls are mostly after the fact. A Databricks budget is an email alert that can arrive up to a day late; it does not stop anything. A coding agent can start a warehouse or run a whole dbt project in one line. This asks you first.

## What it asks about

Everything else (reads, `list`, `get`, `dbt compile`, `dbt test`, `--help`) runs without a prompt, because a hook that asks too often gets turned off.

- **Databricks CLI:** `warehouses start|create`, `clusters start|restart|create|resize`, `jobs run-now|submit`, `bundle run`, `pipelines start-update`, and `api post` to the SQL statements, job-run, cluster-start and pipeline-update endpoints.
- **Snowflake (`snow sql`, `snowsql`):** resuming, creating or resizing a warehouse, running or resuming a task, `COPY INTO`, `INSERT OVERWRITE`, and `CREATE TABLE ... AS SELECT`. For `snow sql -f file.sql` it reads the file.
- **dbt:** `run`, `build`, `seed` and `snapshot` with no `--select` / `-s` / `-m` / `--models` / `--selector`, and anything with `--full-refresh`.

The prompt says what the command does. It never shows a cost, because the hook cannot see your warehouse size or price.

## Install

```
/plugin install warehouse-brake --marketplace thisismairaj/warehouse-brake
```

Nothing to configure. Needs Node 20 or newer on your PATH.

## How it works

A `PreToolUse` hook on `Bash|PowerShell` (both, because on Windows without Git Bash only PowerShell exists). If a command looks like it can spend credits, the hook answers `ask`, and Claude Code shows its normal approval prompt. Any error inside the hook fails open: the command runs.

## Tested live (headless `claude -p`, Claude Code on Windows)

- An unscoped `dbt run` is stopped by the hook in default, `dontAsk` and `bypassPermissions` modes.
- It is also stopped when a subagent runs the command, in `bypassPermissions` mode.
- `dbt compile` is not touched by the hook.

Headless mode cannot answer a prompt, so these runs show the hook fires and the command does not run. They do not show the interactive approval dialog.

## Not verified yet

- The interactive approval dialog itself (approving a flagged command and seeing it run).
- The PowerShell tool path, and Git Bash vs PowerShell on a machine without Git.
- macOS and Linux (development was on Windows only).

## Development

```
npm install
npm test        # 54 cases, runs the TypeScript directly
npm run build   # compiles src/ to dist/ (dist/ is committed so installs need no build)
```
