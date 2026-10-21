import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { ProgramReviewPage } from './ProgramReviewPage'
import { useWorkflowSession } from '../../features/process-planning/useWorkflowSession'
import type { WorkflowSession } from '../../features/process-planning/useWorkflowSession'
import { installCatalogFetchMock } from '../../test/caseCatalog'
import type { ProgramContentReader } from '../../api/program-content/reader'
import { applyProgramChange } from '../../features/program-review/programDocument'
import { caseCatalogReader } from '../../api/case-catalog'

// 此处只验证审核表单状态；编辑器真实交互由 Chromium 覆盖。
vi.mock('../../features/program-review/ProgramEditor', () => ({
  ProgramEditor: ({
    document,
    onChange,
  }: {
    document: { draftText: string; revision: number }
    onChange: (text: string, revision: number) => void
  }) => (
    <textarea
      aria-label="测试程序编辑器"
      value={document.draftText}
      onChange={(event) => onChange(event.target.value, document.revision)}
    />
  ),
}))
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// 不读取真实资产：模拟 Reader 已验证来源，以覆盖允许确认分支；不进入 UI 截图或发布构建。
const trustedReader: ProgramContentReader = {
  read: async () => ({
    text: 'TEST ONLY - NOT NC\noriginal',
    source: 'historical_reference',
    sourceDigest: 'test',
    sizeBytes: 28,
    format: { encoding: 'ascii', bom: false, newline: 'LF' },
  }),
}
let workflow: WorkflowSession
function Harness({ active = true }: { active?: boolean }) {
  workflow = useWorkflowSession(false, { caseId: 'golden-b7', version: 'v2' })
  return (
    <ProgramReviewPage
      active={active}
      workflow={workflow}
      onBack={() => {}}
      reader={trustedReader}
    />
  )
}
async function open() {
  installCatalogFetchMock()
  render(<Harness />)
  await screen.findByLabelText('测试程序编辑器')
}
function confirm() {
  fireEvent.click(screen.getByRole('button', { name: '确认可用' }))
  expect(screen.getByText(/此操作仅记录当前程序修订/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '记录本次演示确认' }))
}
it('隐藏工作台关闭顶层确认框，保留草稿且返回时不恢复过期确认', async () => {
  installCatalogFetchMock()
  const { rerender } = render(<Harness />)
  await screen.findByLabelText('测试程序编辑器')
  fireEvent.change(screen.getByLabelText('测试程序编辑器'), {
    target: { value: 'TEST ONLY hidden draft' },
  })
  fireEvent.click(screen.getByRole('button', { name: '确认可用' }))
  expect(document.querySelector('dialog[open]')).not.toBeNull()
  const documentId = workflow.session?.program?.id
  rerender(<Harness active={false} />)
  expect(document.querySelector('dialog[open]')).toBeNull()
  rerender(<Harness />)
  expect(document.querySelector('dialog[open]')).toBeNull()
  expect(screen.getByLabelText('测试程序编辑器')).toHaveValue('TEST ONLY hidden draft')
  expect(workflow.session?.program?.id).toBe(documentId)
  expect(workflow.session?.program?.review).toBeUndefined()
})
it('确认当前修订，编辑/恢复/现场修改均使其失效，不自动继承历史证据', async () => {
  await open()
  expect(workflow.session?.program?.review).toBeUndefined()
  confirm()
  expect(workflow.session?.program?.review).toMatchObject({ revision: 1, contextRevision: 0 })
  fireEvent.change(screen.getByLabelText('测试程序编辑器'), {
    target: { value: 'TEST ONLY changed' },
  })
  expect(screen.getByText(/需要重新审核/)).toBeVisible()
  expect(workflow.session?.program?.review).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: '恢复原文' }))
  expect(workflow.session?.program?.revision).toBe(3)
  expect(workflow.session?.program?.review).toBeUndefined()
  confirm()
  act(() => workflow.updateDraft('test-field', 'changed onsite'))
  expect(workflow.session?.program?.review).toBeUndefined()
  expect(workflow.session?.contextRevision).toBe(1)
})
it('确认对话框期间有新修订时拒绝旧确认', async () => {
  await open()
  fireEvent.click(screen.getByRole('button', { name: '确认可用' }))
  act(() =>
    workflow.updateSession((current) => ({
      ...current,
      program: applyProgramChange(current.program!, {
        documentId: current.program!.id,
        taskKey: current.taskKey,
        expectedRevision: 1,
        text: 'TEST ONLY newer',
        actor: 'agent',
        reason: '测试未来统一接口',
      }),
    })),
  )
  fireEvent.click(screen.getByRole('button', { name: '记录本次演示确认' }))
  expect(screen.getByRole('alert')).toHaveTextContent('已变化')
  expect(workflow.session?.program?.review).toBeUndefined()
})
it('任务切换隔离正文和确认，返回同一会话保持草稿', async () => {
  await open()
  fireEvent.change(screen.getByLabelText('测试程序编辑器'), { target: { value: 'TEST ONLY keep' } })
  const documentId = workflow.session?.program?.id
  act(() => workflow.setDemoChoice('simple'))
  act(() => workflow.loadDemo())
  expect(screen.queryByLabelText('测试程序编辑器')).not.toBeInTheDocument()
  expect(workflow.session?.program).toBeUndefined()
  act(() => workflow.loadDemo({ caseId: 'golden-b7', version: 'v2' }))
  await waitFor(() => expect(workflow.session?.program?.id).toBe(documentId))
  expect(screen.getByLabelText('测试程序编辑器')).toHaveValue('TEST ONLY keep')
})
it('新案例版本与新资产不继承原文档或演示确认', async () => {
  await open()
  confirm()
  const oldId = workflow.session!.program!.id
  const next = structuredClone(workflow.session!.caseDocument!)
  next.caseVersion.version = 'test-next'
  next.contentDigest = 'test-next-digest'
  next.programAssets[0] = {
    ...next.programAssets[0]!,
    id: 'test-next-asset',
    caseVersion: 'test-next',
  }
  vi.spyOn(caseCatalogReader, 'getCaseVersion').mockResolvedValueOnce(next)
  act(() => workflow.loadDemo({ caseId: 'golden-b7', version: 'test-next' }))
  await waitFor(() => expect(workflow.session?.program?.caseVersion).toBe('test-next'))
  expect(workflow.session!.program!.id).not.toBe(oldId)
  expect(workflow.session!.program!.sourceAssetId).toBe('test-next-asset')
  expect(workflow.session!.program!.review).toBeUndefined()
})
it('下载须显式确认当前修订，创建草稿文件但不产生审核记录', async () => {
  await open()
  vi.useFakeTimers()
  const create = vi.fn(() => 'blob:test-only')
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    expect(this.download).toBe('golden-b7-draft-r2.nc')
  })
  fireEvent.change(screen.getByLabelText('测试程序编辑器'), {
    target: { value: 'TEST ONLY edited export' },
  })
  fireEvent.click(screen.getByRole('button', { name: '下载程序草稿' }))
  expect(create).not.toHaveBeenCalled()
  expect(screen.getByText(/将导出此刻的草稿修订/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '导出此修订' }))
  expect(create).toHaveBeenCalledOnce()
  expect(click).toHaveBeenCalledOnce()
  act(() => vi.runAllTimers())
  vi.useRealTimers()
  expect(workflow.session!.program!.review).toBeUndefined()
})
