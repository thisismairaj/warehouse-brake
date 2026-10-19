# warehouse-brake

A Claude Code plugin that **asks before Claude runs a command that can spend Databricks, Snowflake or dbt warehouse credits.**

It only guards commands Claude runs. It does not guard notebooks, scheduled jobs, or you typing in a terminal. And it reads command text, so it catches well-known shapes, not everything. It is a speed bump, not a security boundary.

## Why

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

## Not verified yet

- What `ask` does when you run in `bypassPermissions` or `dontAsk` mode.
- Whether the hook fires for commands run by subagents.
- Windows (PowerShell and Git Bash) is the development machine; macOS and Linux are untested.

## Development

```
npm install
npm test        # 54 cases, runs the TypeScript directly
npm run build   # compiles src/ to dist/ (dist/ is committed so installs need no build)
```
