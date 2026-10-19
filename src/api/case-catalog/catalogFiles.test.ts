// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateCaseIndex, verifyCaseVersion } from './validation'
import { caseToProcessPlan } from './adapter'

const root = 'public/case-catalog'
export const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

describe('公开案例目录发布校验', () => {
  it('每个索引版本均可校验，且不存在未索引的案例 JSON', async () => {
    const index = validateCaseIndex(readJson(join(root, 'index.json')))
    const indexed = ['index.json']
    for (const summary of index.cases) {
      for (const reference of summary.versions) {
        const document = await verifyCaseVersion(
          readJson(join(root, reference.path)),
          summary,
          reference.version,
        )
        expect(caseToProcessPlan(document).caseReference?.contentDigest).toBe(
          reference.contentDigest,
        )
        indexed.push(reference.path)
      }
    }
    const files = readdirSync(root, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replaceAll('\\', '/'))
    expect(files.sort()).toEqual(indexed.sort())
  })
})
