import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ParameterFields } from './ParameterFields'
import type { Parameter } from './processPlan'

describe('参数来源显示', () => {
  it.each([
    ['historical_record', '历史记录'],
    ['template', '模板'],
    ['upstream', '上游方案'],
    ['human', '人工提供'],
    ['mock', 'Mock 演示值'],
    ['unknown', '来源待补充'],
  ] as const)('%s 显示为 %s', (source, label) => {
    const parameter: Parameter = {
      id: 'speed',
      name: '恒线速 G96',
      value: 295,
      unit: 'm/min',
      source,
      status: 'provided',
      editable: false,
      inputKind: 'number',
    }
    render(
      <ParameterFields
        parameters={[parameter]}
        operationId="operation"
        section="parameters"
        drafts={{}}
        onDraft={() => {}}
        emptyText="暂无参数"
      />,
    )
    expect(screen.getByText(`${label} · 已提供，未校核`)).toBeVisible()
    expect(screen.getByText('295')).toBeVisible()
    expect(screen.getByText('m/min')).toBeVisible()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
