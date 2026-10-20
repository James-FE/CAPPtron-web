import { describe, expect, it } from 'vitest'
import {
  applyProgramChange,
  canReviewProgram,
  confirmProgram,
  createProgramDocument,
  exportProgramDraft,
  invalidateProgramReview,
  saveProgramDraft,
} from './programDocument'
import { decodeProgram, encodeProgram } from '../../api/program-content/format'

// 全部文本仅用于数据契约测试，不是可执行 NC；生产 UI 从不加载这些内容。
export function testDocument(
  source: 'historical_reference' | 'demo_fixture' = 'historical_reference',
) {
  return createProgramDocument(
    {
      taskKey: 'test-task',
      sourceAssetId: 'test-asset',
      caseId: 'synthetic-test',
      caseVersion: 'test-v1',
      caseContentDigest: 'test',
      planId: 'test-plan',
    },
    {
      text: 'TEST ONLY - NOT NC\noriginal\n',
      source,
      sourceDigest: 'test',
      sizeBytes: 30,
      format: { encoding: 'utf-8', bom: false, newline: 'CRLF' },
    },
  )
}
describe('程序文档修订与审核', () => {
  it('统一修改入口保存、恢复、拒绝旧修订及其他任务/资产', () => {
    const original = testDocument()
    const change = {
      documentId: original.id,
      taskKey: original.taskKey,
      expectedRevision: 1,
      text: 'TEST ONLY\nchanged\n',
      actor: 'human' as const,
      reason: 'test',
    }
    const edited = applyProgramChange(original, change)
    expect(edited.revision).toBe(2)
    expect(edited.draftText).not.toBe(edited.savedDraftText)
    const saved = saveProgramDraft(edited)
    expect(saved.savedDraftText).toBe(edited.draftText)
    expect(saved.savedRevision).toBe(2)
    expect(() => applyProgramChange(saved, change)).toThrow('修订冲突')
    expect(() => applyProgramChange(original, { ...change, taskKey: 'other' })).toThrow()
    expect(() => applyProgramChange(original, { ...change, documentId: 'other' })).toThrow()
    const restored = applyProgramChange(saved, {
      ...change,
      expectedRevision: 2,
      text: original.originalText,
    })
    expect(restored.revision).toBe(3)
    expect(restored.savedDraftText).toBe(edited.draftText)
  })
  it.each(['human', 'agent'] as const)('%s 修改使确认失效，恢复文本不恢复旧确认', (actor) => {
    const original = testDocument()
    const confirmed = confirmProgram(original, 1, 8)
    expect(confirmed.review).toMatchObject({
      revision: 1,
      contextRevision: 8,
      taskKey: original.taskKey,
      documentId: original.id,
    })
    const change = {
      documentId: original.id,
      taskKey: original.taskKey,
      expectedRevision: 1,
      text: 'TEST ONLY edit',
      actor,
      reason: 'test',
    }
    const edited = applyProgramChange(confirmed, change)
    expect(edited.review).toBeUndefined()
    expect(edited.history[0]?.actor).toBe(actor)
    expect(
      applyProgramChange(edited, { ...change, expectedRevision: 2, text: original.originalText })
        .review,
    ).toBeUndefined()
    expect(invalidateProgramReview(confirmed).review).toBeUndefined()
    expect(() => confirmProgram(edited, 1, 8)).toThrow()
    expect(testDocument().review).toBeUndefined()
  })
  it('导出严格绑定当前修订，Fixture 或空内容不能确认或伪装 NC', () => {
    const document = testDocument()
    const exported = exportProgramDraft(document, 1)
    expect(exported.filename).toBe('synthetic-test-draft-r1.nc')
    expect(new TextDecoder().decode(exported.bytes)).toBe(
      document.draftText.replaceAll('\n', '\r\n'),
    )
    expect(() => exportProgramDraft(document, 0)).toThrow()
    for (const invalid of [testDocument('demo_fixture'), { ...document, draftText: '  ' }]) {
      expect(canReviewProgram(invalid)).toBe(false)
      expect(() => exportProgramDraft(invalid, 1)).toThrow()
      expect(() => confirmProgram(invalid, 1, 1)).toThrow()
    }
  })
})
describe('原始编码和换行', () => {
  it.each(['utf-8', 'utf-16le', 'utf-16be'] as const)('%s BOM 与 CRLF 字节往返一致', (encoding) => {
    const bytes = encodeProgram('不可执行测试\nsecond\n', { encoding, bom: true, newline: 'CRLF' })
    const decoded = decodeProgram(bytes)
    expect(decoded.format).toEqual({ encoding, bom: true, newline: 'CRLF' })
    expect(encodeProgram(decoded.text, decoded.format)).toEqual(bytes)
  })
  it.each(['CRLF', 'CR', 'LF', 'none'] as const)('ASCII %s 往返一致', (newline) => {
    const bytes = encodeProgram(newline === 'none' ? 'TEST' : 'TEST\nONLY', {
      encoding: 'ascii',
      bom: false,
      newline,
    })
    const decoded = decodeProgram(bytes)
    expect(decoded.format.newline).toBe(newline)
    expect(encodeProgram(decoded.text, decoded.format)).toEqual(bytes)
  })
  it('拒绝非法编码、控制字符、混合换行导出和 ASCII 字符丢失', () => {
    expect(() => decodeProgram(new Uint8Array([0xff, 0x80]))).toThrow('解码')
    expect(() => decodeProgram(new Uint8Array([0, 1, 2]))).toThrow('控制字符')
    const mixed = decodeProgram(new TextEncoder().encode('TEST\r\nONLY\n'))
    expect(mixed.format.newline).toBe('mixed')
    expect(() => encodeProgram(mixed.text, mixed.format)).toThrow('混合换行')
    expect(() => encodeProgram('中文', { encoding: 'ascii', bom: false, newline: 'LF' })).toThrow(
      'ASCII',
    )
  })
})
