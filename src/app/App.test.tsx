import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

function openRing() {
  fireEvent.click(screen.getByRole('button', { name: '使用示例 Ring_A.step' }))
}

describe('P0 synthetic demonstration workflow', () => {
  it('starts with an input screen that never claims server upload or CAM integration', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '模型输入' })).toBeInTheDocument()
    expect(screen.getByText(/尚未上传模型文件/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /02\s+工艺决策/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Agent$/ })).not.toBeInTheDocument()
  })

  it('allows local STEP selection without falsely treating it as a server upload', () => {
    render(<App />)
    const input = screen.getByLabelText('选择模型文件') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['STEP CONTENT'], 'sample.step')] } })
    expect(screen.getByText(/已在本地选择：sample.step/)).toBeInTheDocument()
    expect(screen.getByText(/文件未上传到服务器/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /02\s+工艺决策/ })).toBeDisabled()
  })

  it('rejects unsupported file extensions without indicating successful upload', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('选择模型文件'), {
      target: { files: [new File(['not cad'], 'notes.txt')] },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('仅支持 .step 或 .stp')
    expect(screen.getByRole('button', { name: /02\s+工艺决策/ })).toBeDisabled()
  })

  it('opens r06-like planning with dynamic operations and inline details', () => {
    render(<App />)
    openRing()
    expect(screen.getByRole('heading', { name: '工艺决策' })).toBeInTheDocument()
    const list = screen.getByRole('navigation', { name: '工序列表' })
    expect(within(list).getAllByRole('button')).toHaveLength(9)
    expect(screen.getByRole('heading', { name: '08 精车外' })).toBeInTheDocument()
    fireEvent.click(within(list).getByRole('button', { name: '01 粗车' }))
    expect(screen.getByRole('heading', { name: '01 粗车' })).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: '01 粗车' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('supports smaller and empty plans without hard-coded operation counts', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('其他测试场景'), { target: { value: 'demo-short' } })
    expect(
      within(screen.getByRole('navigation', { name: '工序列表' })).getAllByRole('button'),
    ).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '更换文件' }))
    fireEvent.change(screen.getByLabelText('其他测试场景'), { target: { value: 'demo-empty' } })
    expect(screen.getByText(/当前任务尚无工序/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '进入程序审核 · Demo' })).toBeDisabled()
  })

  it('shows only non-executable NC placeholder and local demonstration acknowledgement', () => {
    render(<App />)
    openRing()
    fireEvent.click(screen.getByRole('button', { name: '进入程序审核 · Demo' }))
    expect(screen.getByRole('heading', { name: '程序审核' })).toBeInTheDocument()
    expect(screen.getByText(/非真实加工程序 · 不可执行/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '程序下载' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '展开代码' }))
    expect(screen.getByRole('button', { name: '收起代码' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: '确认可用 · 仅演示' }))
    expect(screen.getByRole('status')).toHaveTextContent(/不是工艺卡批准、NC 验证通过或实机许可/)
  })

  it('keeps Agent on work pages only and makes its messages explicitly local', () => {
    render(<App />)
    openRing()
    fireEvent.click(screen.getByRole('button', { name: '✦ Agent' }))
    expect(screen.getByRole('complementary', { name: 'Agent 演示对话' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('输入演示意见'), { target: { value: '请补充装夹信息' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    expect(screen.getByText(/该内容未提交到后端/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '数据底座' }))
    expect(screen.getByRole('heading', { name: '数据底座' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '✦ Agent' })).not.toBeInTheDocument()
  })
})
