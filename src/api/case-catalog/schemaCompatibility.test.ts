// @vitest-environment node
import { readFileSync } from 'node:fs'
import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import schema from './schema/case-document.schema.json'
import type { CaseDocument, CaseField } from './types'
import { validateCaseDocument, validateCaseIndex, verifyCaseVersion } from './validation'
import { JsonCaseCatalogReader } from './JsonCaseCatalogReader'

const read = (path: string) => JSON.parse(readFileSync(`public/case-catalog/${path}`, 'utf8'))
const check = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true }).compile(schema)
const scopes = ['工序参数', '工步参数', '任务共用字段', '工序专用字段'] as const
const units = ['mm', 'm/min', 'mm/r', 'r/min', 'mm/min', 'deg', '%'] as const

function fixture(version: CaseDocument['schemaVersion']) {
  const document: CaseDocument = read('golden-b7/v2.json')
  document.schemaVersion = version
  const operation = document.processPlan.operations[0]!
  const field: CaseField = { ...operation.parameters[0]!, unit: 'mm' }
  document.processPlan.operations = [operation]
  operation.steps = [operation.steps[0]!]
  operation.parameters = [{ ...field }]
  operation.steps[0]!.parameters = [{ ...field }]
  operation.onsiteFields = [{ ...field }]
  document.processPlan.taskFields = [{ ...field }]
  const fields = [
    operation.parameters[0]!,
    operation.steps[0]!.parameters[0]!,
    document.processPlan.taskFields[0]!,
    operation.onsiteFields[0]!,
  ]
  return { document, fields }
}

// 直接编译 JSON Schema，不经过摘要校验，确保失败来自版本/单位约束。
describe('Schema 单位能力按文档版本校验', () => {
  it.each(scopes)('1.0 拒绝%s中的 μm；同一文档改为 1.1 后通过', (scope) => {
    const { document, fields } = fixture('1.0')
    expect(check(document)).toBe(true)
    fields[scopes.indexOf(scope)]!.unit = 'μm'
    expect(check(document)).toBe(false)
    expect(check.errors?.some((error) => error.instancePath.endsWith('/unit'))).toBe(true)
    expect(() => validateCaseDocument(document)).toThrow('案例文档校验失败')
    document.schemaVersion = '1.1'
    expect(check(document)).toBe(true)
    expect(validateCaseDocument(document)).toBe(document)
  })

  describe.each(['1.0', '1.1'] as const)('Schema %s', (version) => {
    it.each(units)('四类字段均保留旧单位 %s', (unit) => {
      const { document, fields } = fixture(version)
      for (const field of fields) field.unit = unit
      expect(check(document)).toBe(true)
    })
    it.each(scopes)('拒绝%s中的未知单位', (scope) => {
      const { document, fields } = fixture(version)
      Object.assign(fields[scopes.indexOf(scope)]!, { unit: 'unsupported-unit' })
      expect(check(document)).toBe(false)
    })
    it('无单位字段仍然有效', () => {
      const { document, fields } = fixture(version)
      for (const field of fields) delete field.unit
      expect(check(document)).toBe(true)
    })
  })

  it('拒绝未知 Schema 版本', () => {
    const { document } = fixture('1.1')
    Object.assign(document, { schemaVersion: '1.2' })
    expect(check(document)).toBe(false)
  })

  it('原始 Golden-B7 v2 的 Schema、摘要及 Reader 完整加载通过', async () => {
    const document: CaseDocument = read('golden-b7/v2.json')
    expect(document.schemaVersion).toBe('1.1')
    expect(document.caseVersion.version).toBe('v2')
    expect(document.processPlan.operations[4]!.onsiteFields[0]?.unit).toBe('μm')
    expect(check(document)).toBe(true)
    const summary = validateCaseIndex(read('index.json')).cases[0]!
    await expect(verifyCaseVersion(document, summary, 'v2')).resolves.toEqual(document)
    const reader = new JsonCaseCatalogReader(
      '/',
      async (url) => new Response(JSON.stringify(read(String(url).replace('/case-catalog/', '')))),
    )
    await expect(reader.getCaseVersion('golden-b7', 'v2')).resolves.toEqual(document)
  })
})
