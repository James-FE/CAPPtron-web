import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// 只输出摘要，不修改案例文件。保持与 v1 契约的规范化规则一致。
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('拒绝非有限数值')
  return JSON.stringify(value)
}

try {
  if (process.argv.length !== 3)
    throw new Error('用法：node scripts/case-catalog-digest.mjs <案例 JSON 路径>')
  const document = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  if (!document || Array.isArray(document) || typeof document !== 'object')
    throw new Error('案例必须是 JSON 对象')
  delete document.contentDigest
  console.log(createHash('sha256').update(canonical(document)).digest('hex'))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
