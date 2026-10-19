import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify } from '../src/classify.ts'

// [command, expected level]. Real command shapes; the Databricks and dbt names were checked
// against the installed CLIs (databricks v1.18.0, dbt --help) on 2026-10-19.
const CASES: [string, 'ask' | 'pass'][] = [
  // Databricks: spends or starts compute
  ['databricks warehouses start abc123', 'ask'],
  ['databricks --profile trial warehouses start abc123', 'ask'],
  ['databricks -p trial -o json clusters start 0101-abc', 'ask'],
  ['databricks clusters restart 0101-abc', 'ask'],
  ['databricks jobs run-now --job-id 42', 'ask'],
  ['databricks bundle run my_job --target dev', 'ask'],
  ['databricks pipelines start-update p-123', 'ask'],
  ['databricks api post /api/2.0/sql/statements --json \'{"statement":"select 1"}\'', 'ask'],
  ['databricks.exe warehouses create --name x', 'ask'],
  // Databricks: reads and help pass
  ['databricks warehouses list', 'pass'],
  ['databricks warehouses get abc123', 'pass'],
  ['databricks warehouses start --help', 'pass'],
  ['databricks bundle deploy', 'pass'],
  ['databricks api get /api/2.0/sql/warehouses', 'pass'],
  ['databricks --version', 'pass'],
  // Snowflake
  ['snow sql -q "ALTER WAREHOUSE wh RESUME"', 'ask'],
  ['snow sql -q "create or replace warehouse wh with warehouse_size=xsmall"', 'ask'],
  ['snow sql -q "COPY INTO t FROM @stage"', 'ask'],
  ['snow sql -q "create table t2 as select * from t1"', 'ask'],
  ['snowsql -q "alter warehouse wh set warehouse_size = large"', 'ask'],
  ['snow sql -q "select count(*) from t"', 'pass'],
  ['snow sql -q "select \'warehouse\' as word"', 'pass'],
  ['snow connection list', 'pass'],
  ['snow sql --help', 'pass'],
  // dbt
  ['dbt run', 'ask'],
  ['dbt build', 'ask'],
  ['dbt seed', 'ask'],
  ['dbt snapshot', 'ask'],
  ['dbt --no-use-colors run', 'ask'],
  ['dbt run --profiles-dir . --target dev', 'ask'],
  ['dbt run --select stg_orders --full-refresh', 'ask'],
  ['uv run dbt build', 'ask'],
  ['.venv/Scripts/dbt.exe run', 'ask'],
  ['python -m dbt run', 'ask'],
  ['dbt run --select stg_orders', 'pass'],
  ['dbt run -s stg_orders+', 'pass'],
  ['dbt build --models tag:daily', 'pass'],
  ['dbt build --selector nightly', 'pass'],
  ['dbt compile', 'pass'],
  ['dbt parse', 'pass'],
  ['dbt test', 'pass'],
  ['dbt run --help', 'pass'],
  ['dbt docs generate', 'pass'],
  // chained commands: any risky segment asks
  ['cd project && dbt run', 'ask'],
  ['echo start; databricks warehouses start abc', 'ask'],
  ['dbt compile && dbt run --select x', 'pass'],
  // not these tools: quoted text and other commands never match
  ['git commit -m "dbt run"', 'pass'],
  ['echo "databricks warehouses start x"', 'pass'],
  ['grep -r "dbt run" .', 'pass'],
  ['ls -la', 'pass'],
  ['', 'pass'],
]

for (const [command, expected] of CASES) {
  test(`${expected.padEnd(4)} ${command || '(empty)'}`, () => {
    assert.equal(classify(command).level, expected)
  })
}

test('reasons are plain English and name the action', () => {
  const v = classify('databricks warehouses start abc123')
  assert.deepEqual(v.reasons, ['databricks warehouses start starts a SQL warehouse'])
})

test('snow sql -f reads the file the command will run', () => {
  const files: Record<string, string> = { 'load.sql': 'COPY INTO t FROM @s;' }
  const ctx = { readFile: (p: string) => files[p] }
  assert.equal(classify('snow sql -f load.sql', ctx).level, 'ask')
  assert.equal(classify('snow sql -f missing.sql', ctx).level, 'pass')
})

test('unknown or malformed input passes (fails open)', () => {
  assert.equal(classify('"unterminated quote dbt run').level, 'pass')
})
