import type { ReactNode } from 'react'
import { FoundationError } from '../../api/data-foundation/reader'
import type { FoundationResponse } from '../../api/data-foundation/types'
import type { FoundationQuery } from './useFoundationQuery'
import { timestamp } from './presentation'

export function FoundationResult<T>({
  query,
  label,
  children,
}: {
  query: FoundationQuery<T>
  label: string
  children: (response: FoundationResponse<T>) => ReactNode
}) {
  if (query.status === 'loading')
    return (
      <p className="foundation-state" role="status">
        正在读取{label}…
      </p>
    )
  if (query.status === 'error') {
    const labels = {
      invalid_query: '查询参数无效',
      read_failed: '读取失败',
      contract_incompatible: '数据契约不兼容',
      invalid_data: '数据格式无效',
      data_integrity: '数据完整性检查失败',
    }
    return (
      <div className="foundation-state">
        <p role="alert">
          {label}：{query.error instanceof FoundationError ? labels[query.error.code] : '读取失败'}
        </p>
        <button className="button" onClick={query.retry}>
          重试{label}
        </button>
      </div>
    )
  }
  return query.response ? children(query.response) : null
}
export function FoundationPanel({
  title,
  subtitle,
  tone = 'cyan',
  action,
  children,
}: {
  title: string
  subtitle?: string
  tone?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={`foundation-panel foundation-tone-${tone}`} aria-label={title}>
      <header className="foundation-panel-heading">
        <h3>{title}</h3>
        <div>
          {subtitle && <span>{subtitle}</span>}
          {action}
        </div>
      </header>
      {children}
    </section>
  )
}
export function FoundationSource({
  meta,
  compact = false,
}: {
  meta: FoundationResponse<unknown>['meta']
  compact?: boolean
}) {
  return (
    <div className={`foundation-source${compact ? ' compact' : ''}`}>
      <strong>{meta.dataMode === 'synthetic_demo' ? '模拟数据' : '真实数据'}</strong>
      <span>
        快照 {timestamp(meta.asOf, meta.timeZone)} · {meta.timeZone}
      </span>
      <span>
        {meta.datasetVersion} · Schema {meta.schemaVersion}
      </span>
    </div>
  )
}
