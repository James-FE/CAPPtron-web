import { useId } from 'react'
import { draftKey, validateDraft } from './processPlan'
import type { Parameter } from './processPlan'

import type { Drafts } from './processPlan'
export type { Drafts } from './processPlan'

const sources: Record<Parameter['source'], string> = {
  mock: 'Mock 演示值',
  template: '模板',
  upstream: '上游方案',
  human: '人工提供',
  unknown: '来源待补充',
}

function ParameterField({
  parameter,
  value,
  onChange,
}: {
  parameter: Parameter
  value: string | undefined
  onChange: (value: string) => void
}) {
  const id = useId()
  const error = value !== undefined ? validateDraft(parameter, value) : null
  return (
    <div className="parameter-field">
      <label htmlFor={parameter.editable ? id : undefined}>
        {parameter.name}
        {parameter.required && (
          <span aria-hidden="true" className="warning-text">
            {' '}
            · 必填
          </span>
        )}
      </label>
      <div className="parameter-value">
        {parameter.editable ? (
          <input
            id={id}
            aria-label={parameter.name}
            type="text"
            inputMode={parameter.inputKind === 'number' ? 'decimal' : 'text'}
            value={value ?? String(parameter.value ?? '')}
            maxLength={500}
            onChange={(event) => onChange(event.target.value)}
            aria-describedby={`${id}-help`}
            aria-invalid={!!error}
            aria-required={parameter.required || undefined}
            placeholder="待补充"
          />
        ) : (
          <strong>{parameter.value ?? '—'}</strong>
        )}
        {parameter.unit && <span>{parameter.unit}</span>}
      </div>
      <p
        id={`${id}-help`}
        className={error || parameter.value === null ? 'warning-text' : 'muted-text'}
      >
        {value !== undefined
          ? (error ?? '本地草稿 · 格式有效，未校核')
          : `${sources[parameter.source]} · ${parameter.status === 'missing' ? '待补充' : parameter.status === 'pending' ? '待确认' : '已提供，未校核'}`}
        {parameter.description && (
          <>
            <br />
            {parameter.description}
          </>
        )}
      </p>
    </div>
  )
}

export function ParameterFields({
  parameters,
  operationId,
  section,
  drafts,
  onDraft,
  emptyText,
}: {
  parameters: Parameter[]
  operationId: string
  section: string
  drafts: Drafts
  onDraft: (key: string, value: string) => void
  emptyText: string
}) {
  if (!parameters.length) return <p className="muted-text">{emptyText}</p>
  return (
    <div className="parameter-fields">
      {parameters.map((parameter) => {
        const key = draftKey(operationId, section, parameter.id)
        return (
          <ParameterField
            key={parameter.id}
            parameter={parameter}
            value={drafts[key]}
            onChange={(value) => onDraft(key, value)}
          />
        )
      })}
    </div>
  )
}
