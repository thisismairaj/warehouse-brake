// Decides whether a shell command can spend warehouse credits. Pure logic, no I/O except an
// optional injected readFile, so it can be tested with plain strings.
//
// Heuristic, not a security boundary: it reads command text, so it only catches well-known
// shapes. False negatives are expected. Anything it does not recognise passes.
const PASS = { level: 'pass', reasons: [] };
// Words that can sit in front of the real tool, e.g. `uv run dbt run` or `python -m dbt run`.
const WRAPPERS = new Set([
    'uv', 'run', 'poetry', 'pipenv', 'npx', 'python', 'python3', 'py', '-m',
    'sudo', 'time', 'command', 'exec', 'env', 'call', '&', 'nice',
]);
export function splitSegments(command) {
    const segments = [];
    let current = '';
    let quote = null;
    for (let i = 0; i < command.length; i++) {
        const c = command[i];
        if (quote) {
            if (c === quote)
                quote = null;
            current += c;
            continue;
        }
        if (c === '"' || c === "'") {
            quote = c;
            current += c;
            continue;
        }
        const two = command.slice(i, i + 2);
        if (two === '&&' || two === '||') {
            segments.push(current);
            current = '';
            i++;
            continue;
        }
        if (c === ';' || c === '|' || c === '\n') {
            segments.push(current);
            current = '';
            continue;
        }
        current += c;
    }
    segments.push(current);
    return segments.map(s => s.trim()).filter(Boolean);
}
export function tokenize(segment) {
    const tokens = [];
    let current = '';
    let quote = null;
    let has = false;
    for (const c of segment) {
        if (quote) {
            if (c === quote)
                quote = null;
            else
                current += c;
            continue;
        }
        if (c === '"' || c === "'") {
            quote = c;
            has = true;
            continue;
        }
        if (/\s/.test(c)) {
            if (has)
                tokens.push(current);
            current = '';
            has = false;
            continue;
        }
        current += c;
        has = true;
    }
    if (has)
        tokens.push(current);
    return tokens;
}
function toolName(token) {
    const base = token.split(/[\\/]/).pop() ?? token;
    return base.toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '');
}
function findTool(tokens) {
    let sawWrapper = false;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t))
            continue;
        if (WRAPPERS.has(t.toLowerCase())) {
            sawWrapper = true;
            continue;
        }
        if (sawWrapper && t.startsWith('-'))
            continue;
        return { name: toolName(t), rest: tokens.slice(i + 1) };
    }
    return undefined;
}
function positional(rest, valueFlags) {
    const out = [];
    for (let i = 0; i < rest.length; i++) {
        const t = rest[i];
        if (t.startsWith('-')) {
            if (!t.includes('=') && valueFlags.has(t))
                i++;
            continue;
        }
        out.push(t);
    }
    return out;
}
const isHelp = (rest) => rest.some(t => t === '--help' || t === '-h');
// ---- Databricks CLI -------------------------------------------------------------------------
const DBX_VALUE_FLAGS = new Set([
    '--profile', '-p', '--output', '-o', '--target', '-t', '--log-level', '--log-file',
    '--log-format', '--progress-format', '--json', '--var',
]);
const DBX_SUBCOMMANDS = {
    warehouses: { start: 'starts a SQL warehouse', create: 'creates a SQL warehouse' },
    clusters: {
        start: 'starts a cluster', restart: 'restarts a cluster',
        create: 'creates a cluster', resize: 'resizes a cluster',
    },
    jobs: { 'run-now': 'triggers a job run', submit: 'submits a one-time run' },
    bundle: { run: 'runs a job, pipeline or app from a bundle' },
    pipelines: { 'start-update': 'starts a pipeline update' },
};
const DBX_API_SPEND = /sql\/statements|jobs\/run-now|jobs\/runs\/submit|clusters\/(start|restart|create|resize)|sql\/warehouses(\/[^/\s]+)?\/(start|create)|pipelines\/[^/\s]+\/updates/;
function databricks(rest) {
    if (isHelp(rest))
        return PASS;
    const p = positional(rest, DBX_VALUE_FLAGS);
    if (p[0] === 'api' && p[1]?.toLowerCase() === 'post' && p[2] && DBX_API_SPEND.test(p[2])) {
        return { level: 'ask', reasons: [`databricks api call to ${p[2]} can start compute`] };
    }
    const what = p[0] && DBX_SUBCOMMANDS[p[0]]?.[p[1] ?? ''];
    return what ? { level: 'ask', reasons: [`databricks ${p[0]} ${p[1]} ${what}`] } : PASS;
}
// ---- Snowflake (snow / snowsql) -------------------------------------------------------------
const SQL_RULES = [
    { re: /\balter\s+warehouse\b[^;]*\bresume\b/i, reason: 'resumes a Snowflake warehouse' },
    { re: /\bcreate\s+(or\s+replace\s+)?warehouse\b/i, reason: 'creates a Snowflake warehouse' },
    { re: /\balter\s+warehouse\b[^;]*\bwarehouse_size\b/i, reason: 'changes a warehouse size' },
    { re: /\bexecute\s+task\b/i, reason: 'runs a Snowflake task' },
    { re: /\balter\s+task\b[^;]*\bresume\b/i, reason: 'resumes a Snowflake task' },
    { re: /\bcopy\s+into\b/i, reason: 'bulk loads or unloads data (COPY INTO)' },
    { re: /\binsert\s+overwrite\b/i, reason: 'rewrites a table (INSERT OVERWRITE)' },
    {
        re: /\bcreate\s+(or\s+replace\s+)?(transient\s+|temporary\s+)?table\b[^;]*\bas\s+select\b/i,
        reason: 'builds a table from a query (CREATE TABLE AS SELECT)',
    },
];
const SNOW_FILE_FLAGS = new Set(['-f', '--filename']);
function snowflake(name, rest, ctx) {
    if (isHelp(rest))
        return PASS;
    if (name === 'snow' && rest.find(t => !t.startsWith('-')) !== 'sql')
        return PASS;
    let sql = rest.join(' ');
    for (let i = 0; i < rest.length; i++) {
        if (SNOW_FILE_FLAGS.has(rest[i]) && rest[i + 1] && ctx.readFile) {
            const text = ctx.readFile(rest[i + 1]);
            if (text)
                sql += '\n' + text;
        }
    }
    const reasons = SQL_RULES.filter(r => r.re.test(sql)).map(r => r.reason);
    return reasons.length ? { level: 'ask', reasons } : PASS;
}
// ---- dbt ------------------------------------------------------------------------------------
const DBT_VALUE_FLAGS = new Set([
    '--profiles-dir', '--project-dir', '--profile', '--target', '-t', '--vars', '--log-path',
    '--target-path', '--log-level',
]);
const DBT_BUILDERS = new Set(['run', 'build', 'seed', 'snapshot']);
const DBT_SCOPE = /^(-s|-m|--select|--models|--model|--selector)(=|$)/;
function dbt(rest) {
    if (isHelp(rest))
        return PASS;
    const sub = positional(rest, DBT_VALUE_FLAGS)[0];
    if (!sub || !DBT_BUILDERS.has(sub))
        return PASS;
    const reasons = [];
    if (!rest.some(t => DBT_SCOPE.test(t))) {
        reasons.push(`dbt ${sub} with no --select runs the whole project on your warehouse`);
    }
    if (rest.includes('--full-refresh')) {
        reasons.push('--full-refresh rebuilds incremental tables from scratch');
    }
    return reasons.length ? { level: 'ask', reasons } : PASS;
}
// ---- entry point ----------------------------------------------------------------------------
export function classify(command, ctx = {}) {
    const reasons = [];
    for (const segment of splitSegments(command)) {
        const tool = findTool(tokenize(segment));
        if (!tool)
            continue;
        let v = PASS;
        if (tool.name === 'databricks')
            v = databricks(tool.rest);
        else if (tool.name === 'snow' || tool.name === 'snowsql')
            v = snowflake(tool.name, tool.rest, ctx);
        else if (tool.name === 'dbt')
            v = dbt(tool.rest);
        reasons.push(...v.reasons);
    }
    return reasons.length ? { level: 'ask', reasons: [...new Set(reasons)] } : PASS;
}
