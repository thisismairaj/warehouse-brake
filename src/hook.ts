// PreToolUse command hook. Reads the hook payload on stdin and, if the command can spend
// warehouse credits, answers "ask" so Claude Code shows its normal approval prompt.
// Any failure here must fail OPEN: print nothing, exit 0, let the command run.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { classify } from './classify.ts'

function main(): void {
  const payload = JSON.parse(readFileSync(0, 'utf8')) as {
    cwd?: string
    tool_input?: { command?: unknown }
  }
  const command = payload.tool_input?.command
  if (typeof command !== 'string') return

  const cwd = payload.cwd ?? process.cwd()
  const verdict = classify(command, {
    cwd,
    readFile: path => {
      try {
        return readFileSync(resolve(cwd, path), 'utf8')
      } catch {
        return undefined
      }
    },
  })
  if (verdict.level !== 'ask') return

  const reason =
    `warehouse-brake: this command can spend credits (${verdict.reasons.join('; ')}). ` +
    `This hook cannot see your warehouse size or price, so no cost estimate is shown. Approve?`
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: reason,
      },
    }),
  )
}

try {
  main()
} catch {
  // fail open: a bug in this hook must never be the reason a command is blocked
}
