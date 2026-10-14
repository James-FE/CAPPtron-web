#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { reconcile } from './ruleset-iac-core.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const opts = { mode: 'plan', repo: 'James-FE/CAPPtron-web', file: resolve(root, '.github/rulesets/main.json'), yes: false }
let modeSeen = false
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (['plan', 'check', 'apply'].includes(arg) && !modeSeen) { opts.mode = arg; modeSeen = true }
  else if (arg === '--repo' && process.argv[i + 1]) opts.repo = process.argv[++i]
  else if (arg === '--file' && process.argv[i + 1]) opts.file = resolve(process.argv[++i])
  else if (arg === '--yes') opts.yes = true
  else throw new Error('Unexpected argument: ' + arg)
}
if (!/^[\w.-]+\/[\w.-]+$/.test(opts.repo)) throw new Error('--repo must be OWNER/REPO')
if (opts.yes && opts.mode !== 'apply') throw new Error('--yes requires apply mode')

function gh(method, url, data) {
  const args = ['api', '--method', method, url]
  if (data !== undefined) args.push('--input', '-')
  const r = spawnSync('gh', args, { input: data === undefined ? undefined : JSON.stringify(data), encoding: 'utf8', timeout: 45000, windowsHide: true })
  if (r.error || r.status !== 0) throw new Error('GitHub API failed: ' + (r.error?.message || r.stderr || r.stdout))
  return JSON.parse(r.stdout)
}
const api = {
  async list(repo) {
    const all = []
    for (let page = 1; page <= 20; page++) {
      const batch = gh('GET', 'repos/' + repo + '/rulesets?includes_parents=false&per_page=100&page=' + page)
      if (!Array.isArray(batch)) throw new Error('Invalid Rulesets response')
      all.push(...batch)
      if (batch.length < 100) return all
    }
    throw new Error('Rulesets list exceeded pagination limit')
  },
  async get(repo, id) { return gh('GET', 'repos/' + repo + '/rulesets/' + id) },
  async create(repo, desired) { return gh('POST', 'repos/' + repo + '/rulesets', desired) },
  async update(repo, id, desired) { return gh('PUT', 'repos/' + repo + '/rulesets/' + id, desired) },
}
async function approve(plan) {
  if (opts.yes) return true
  if (!process.stdin.isTTY) throw new Error('Interactive confirmation required; use --yes for intentional unattended apply')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try { return (await rl.question('Type APPLY to ' + plan.action + ' Ruleset on ' + opts.repo + ': ')).trim() === 'APPLY' }
  finally { rl.close() }
}
try {
  const desired = JSON.parse(readFileSync(opts.file, 'utf8'))
  const result = await reconcile({ mode: opts.mode, repo: opts.repo, desired, api, approve })
  process.exitCode = result.code
} catch (error) {
  console.error('Ruleset IaC failed: ' + error.message)
  process.exitCode = 1
}
