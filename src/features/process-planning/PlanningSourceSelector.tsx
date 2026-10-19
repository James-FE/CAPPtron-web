import { useEffect, useState } from 'react'
import { demoPlanOptions } from '../../api/mock/processPlans'
import { caseCatalogReader, caseChoiceKey } from '../../api/case-catalog'
import type { CaseSummary } from '../../api/case-catalog/types'

export function PlanningSourceSelector({
  active,
  choice,
  onChoice,
  onLoad,
}: {
  active: boolean
  choice: string
  onChoice: (value: string) => void
  onLoad: (reference?: { caseId: string; version: string }) => void
}) {
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!active) return
    let cancelled = false
    caseCatalogReader
      .listCases()
      .then((items) => {
        if (!cancelled) {
          setCases(items)
          setError('')
          setLoading(false)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '索引加载失败')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [active, revision])
  const versions = cases.flatMap((item) =>
    item.versions.map((entry) => ({
      key: caseChoiceKey(item.caseId, entry.version),
      label: `${item.name} · ${entry.version}`,
      caseId: item.caseId,
      version: entry.version,
    })),
  )
  const reference = versions.find((item) => item.key === choice)
  const synthetic = demoPlanOptions.some((item) => item.id === choice)
  return (
    <div className="catalog-controls">
      <div className="demo-loader">
        <label htmlFor="demo-plan">演示方案</label>
        <select id="demo-plan" value={choice} onChange={(event) => onChoice(event.target.value)}>
          {!reference && !synthetic && <option value={choice}>参考案例 · 等待索引</option>}
          <optgroup label="工程参考案例 · Demo 使用">
            {versions.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="合成 Demo · UI 测试数据">
            {demoPlanOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </optgroup>
        </select>
        <button
          className="button"
          disabled={!synthetic && !reference}
          onClick={() => onLoad(reference)}
        >
          加载 Demo 方案
        </button>
        <button
          className="button"
          disabled={loading}
          onClick={() => {
            setLoading(true)
            setRevision((value) => value + 1)
          }}
        >
          {error ? '重试案例索引' : '刷新案例列表'}
        </button>
      </div>
      {loading && (
        <p className="muted-text" role="status">
          正在读取案例索引…
        </p>
      )}
      {error && (
        <p className="catalog-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
