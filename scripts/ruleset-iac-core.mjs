/** GitHub Ruleset IaC 的纯函数：生成变更计划并比较期望状态。 */

const OWNED_FIELDS = ['name', 'target', 'enforcement', 'conditions', 'rules', 'bypass_actors']
const UNORDERED_ARRAYS = new Set([
  'rules',
  'bypass_actors',
  'allowed_merge_methods',
  'required_status_checks',
  'required_reviewers',
  'include',
  'exclude',
])

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

export function validateDesired(value) {
  if (!isObject(value)) throw new Error('Ruleset definition must be a JSON object.')
  const extra = Object.keys(value).filter((key) => !OWNED_FIELDS.includes(key))
  if (extra.length) throw new Error(`Unsupported desired-state field(s): ${extra.join(', ')}`)
  if (typeof value.name !== 'string' || !value.name.trim()) throw new Error('Ruleset name is required.')
  if (value.target !== 'branch') throw new Error('This synchronizer only manages branch rulesets.')
  if (!['active', 'evaluate', 'disabled'].includes(value.enforcement)) {
    throw new Error('enforcement must be active, evaluate, or disabled.')
  }
  if (!isObject(value.conditions) || !isObject(value.conditions.ref_name)) {
    throw new Error('conditions.ref_name must be defined.')
  }
  for (const key of ['include', 'exclude']) {
    if (!Array.isArray(value.conditions.ref_name[key]) ||
        !value.conditions.ref_name[key].every((name) => typeof name === 'string')) {
      throw new Error(`conditions.ref_name.${key} must be a string array.`)
    }
  }
  if (!value.conditions.ref_name.include.length) {
    throw new Error('At least one branch include pattern is required.')
  }
  if (!Array.isArray(value.rules) || value.rules.length === 0) {
    throw new Error('rules must be a non-empty array.')
  }
  if (!value.rules.every((rule) => isObject(rule) && typeof rule.type === 'string')) {
    throw new Error('Every rule must have a string type.')
  }
  if (!Array.isArray(value.bypass_actors)) {
    throw new Error('bypass_actors must be explicit, even if empty.')
  }
  if (new Set(value.rules.map((rule) => rule.type)).size !== value.rules.length) {
    throw new Error('Duplicate rule types are not supported by this synchronizer.')
  }
  return value
}

function normalize(value, key = '') {
  if (Array.isArray(value)) {
    const values = value.map((item) => normalize(item))
    return UNORDERED_ARRAYS.has(key)
      ? values.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
      : values
  }
  if (isObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((name) => [name, normalize(value[name], name)]),
    )
  }
  return value
}

/** 去掉 GitHub 返回的只读元数据，同时保留所有由本工具管理的策略字段。 */
export function canonicalRuleset(value) {
  if (!isObject(value)) throw new Error('Ruleset must be an object.')
  const owned = Object.fromEntries(
    OWNED_FIELDS.map((key) => [key, value[key] ?? (key === 'bypass_actors' ? [] : undefined)]),
  )
  return normalize(owned)
}

function changes(expected, actual, path = '') {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return []
  if (path === 'rules' && Array.isArray(expected) && Array.isArray(actual)) {
    const byType = (array) => new Map(array.map((rule) => [rule.type, rule]))
    const desiredRules = byType(expected)
    const actualRules = byType(actual)
    return [...new Set([...desiredRules.keys(), ...actualRules.keys()])]
      .sort()
      .flatMap((type) => changes(desiredRules.get(type), actualRules.get(type), `rules[${type}]`))
  }
  if (isObject(expected) && isObject(actual)) {
    return [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
      .sort()
      .flatMap((key) => changes(expected[key], actual[key], path ? `${path}.${key}` : key))
  }
  return [{path: path || '(root)', expected, actual}]
}

export function buildPlan(desired, actual) {
  validateDesired(desired)
  if (actual === null) return {action: 'create', changes: []}
  const diffs = changes(canonicalRuleset(desired), canonicalRuleset(actual))
  return {action: diffs.length ? 'update' : 'noop', changes: diffs}
}

export function selectLocalRuleset(rulesets, desiredName) {
  if (!Array.isArray(rulesets)) throw new Error('GitHub Rulesets list must be an array.')
  const matches = rulesets.filter((item) =>
    item.name?.toLowerCase() === desiredName.toLowerCase() &&
    item.source_type === 'Repository',
  )
  if (matches.length > 1) throw new Error(`Multiple repository Rulesets named ${desiredName}; refusing to guess.`)
  if (matches.length && !Number.isInteger(matches[0].id)) {
    throw new Error('Existing Ruleset has no numeric ID.')
  }
  return matches[0] ?? null
}

function formatValue(value) {
  if (value === undefined) return '(missing)'
  const text = JSON.stringify(value)
  return text.length > 180 ? `${text.slice(0, 177)}...` : text
}

export function printPlan({repo, desired, existingId, plan, log}) {
  log(`Ruleset IaC | ${repo} | ${desired.name}`)
  if (plan.action === 'create') {
    log('PLAN: CREATE a new repository Ruleset (no write performed).')
  } else if (plan.action === 'noop') {
    log(`PLAN: NO CHANGES. Ruleset #${existingId} matches the committed JSON.`)
  } else {
    log(`PLAN: UPDATE Ruleset #${existingId} (${plan.changes.length} changed field(s)):`)
    for (const item of plan.changes) {
      log(`  ${item.path}: ${formatValue(item.actual)} -> ${formatValue(item.expected)}`)
    }
  }
}

/** 远程写入必须进入 apply 模式并获得确认；确认后再次核查，以避免并发修改。 */
export async function reconcile({mode, repo, desired, api, approve = async () => false, log = console.log}) {
  validateDesired(desired)
  if (!['plan', 'check', 'apply'].includes(mode)) throw new Error(`Unknown mode: ${mode}`)
  const find = async () => selectLocalRuleset(await api.list(repo), desired.name)
  const match = await find()
  const actual = match ? await api.get(repo, match.id) : null
  if (actual && (actual.name.toLowerCase() !== desired.name.toLowerCase() || actual.target !== desired.target)) {
    throw new Error('Existing Ruleset identity or target mismatch; refusing to modify it.')
  }
  const plan = buildPlan(desired, actual)
  printPlan({repo, desired, existingId: match?.id, plan, log})
  if (mode === 'plan') return {code: 0, plan}
  if (mode === 'check') {
    if (plan.action !== 'noop') log('DRIFT detected. Exit code 2.')
    else log('CHECK PASS: no drift.')
    return {code: plan.action === 'noop' ? 0 : 2, plan}
  }
  if (plan.action === 'noop') return {code: 0, plan}
  if (!(await approve(plan))) {
    log('Cancelled; GitHub Ruleset was not changed.')
    return {code: 1, plan}
  }
  const latestMatch = await find()
  const latest = latestMatch ? await api.get(repo, latestMatch.id) : null
  if (latestMatch?.id !== match?.id ||
      JSON.stringify(canonicalRuleset(latest ?? {})) !== JSON.stringify(canonicalRuleset(actual ?? {}))) {
    throw new Error('Ruleset changed while applying. Re-run plan; no write performed.')
  }
  const response = plan.action === 'create'
    ? await api.create(repo, desired)
    : await api.update(repo, match.id, desired)
  if (!Number.isInteger(response?.id)) {
    throw new Error('GitHub write returned no Ruleset ID; inspect remote state before retrying.')
  }
  const verified = await api.get(repo, response.id)
  if (buildPlan(desired, verified).action !== 'noop') {
    throw new Error('GitHub accepted the write but read-back differs from the desired Ruleset.')
  }
  log(`APPLY OK: ${plan.action.toUpperCase()} Ruleset #${response.id}, read-back verified.`)
  return {code: 0, plan}
}
