import { useCallback, useState } from 'react'
import type { DataFoundationReader } from '../../api/data-foundation/reader'
import type { AssetKind, AssetReference } from '../../api/data-foundation/types'
import { useFoundationQuery } from '../../features/data-foundation/useFoundationQuery'
import {
  FoundationPanel,
  FoundationResult,
  FoundationSource,
} from '../../features/data-foundation/FoundationShared'
import {
  FoundationGrowthChart,
  FoundationKnowledgeChart,
} from '../../features/data-foundation/FoundationCharts'
import {
  FoundationHotKnowledge,
  FoundationKpis,
  FoundationModelPanel,
  FoundationResourcePanel,
} from '../../features/data-foundation/FoundationPanels'
import { FoundationAssetBrowser } from '../../features/data-foundation/FoundationAssetBrowser'
import '../../styles/data-foundation.css'

export function DataFoundationPage({ reader }: { reader: DataFoundationReader }) {
  const overview = useFoundationQuery(useCallback(() => reader.getOverview(), [reader]))
  const trend = useFoundationQuery(useCallback(() => reader.getGrowthTrend({ days: 7 }), [reader]))
  const knowledge = useFoundationQuery(
    useCallback(() => reader.getKnowledgeDistribution(), [reader]),
  )
  const summary = useFoundationQuery(useCallback(() => reader.getResourceSummary(), [reader]))
  const hot = useFoundationQuery(
    useCallback(() => reader.getHotAssets({ days: 7, limit: 5 }), [reader]),
  )
  const [browse, setBrowse] = useState<{ kind: AssetKind; selected?: AssetReference } | null>(null)
  const source =
    overview.response?.meta ??
    trend.response?.meta ??
    knowledge.response?.meta ??
    summary.response?.meta ??
    hot.response?.meta
  const onBrowse = (kind: AssetKind) => setBrowse({ kind })
  return (
    <section className="foundation-page" aria-labelledby="foundation-title">
      <header className="foundation-heading">
        <h2 id="foundation-title">数据底座</h2>
        <div>
          {source ? (
            <FoundationSource meta={source} />
          ) : (
            <p className="foundation-pending-source">数据来源与快照信息尚未读取</p>
          )}
        </div>
      </header>
      <section aria-label="数据概览" className="foundation-overview">
        <FoundationResult query={overview} label="数据概览">
          {(response) => <FoundationKpis response={response} />}
        </FoundationResult>
      </section>
      <div className="foundation-chart-grid">
        <FoundationPanel title="每日新增趋势" subtitle="近 7 天 / 条">
          <FoundationResult query={trend} label="新增趋势">
            {(response) => <FoundationGrowthChart data={response.data} />}
          </FoundationResult>
        </FoundationPanel>
        <FoundationPanel
          title="知识构成"
          subtitle="互斥主分类"
          tone="violet"
          action={
            <button className="foundation-text-button" onClick={() => onBrowse('knowledge')}>
              查看知识 →
            </button>
          }
        >
          <FoundationResult query={knowledge} label="知识构成">
            {(response) => (
              <>
                <FoundationKnowledgeChart data={response.data} />
                {response.meta.dataMode === 'synthetic_demo' && (
                  <p className="foundation-panel-note">
                    “所内知识”为模拟分类，不代表真实单位来源。
                  </p>
                )}
              </>
            )}
          </FoundationResult>
        </FoundationPanel>
      </div>
      <div className="foundation-bottom-grid">
        <FoundationPanel title="模型库" subtitle="能力登记" tone="blue">
          <FoundationResult query={summary} label="模型汇总">
            {(response) => <FoundationModelPanel response={response} onBrowse={onBrowse} />}
          </FoundationResult>
        </FoundationPanel>
        <FoundationPanel title="工业资源数据库概览" subtitle="只读资源目录" tone="violet">
          <FoundationResult query={summary} label="业务资源汇总">
            {(response) => <FoundationResourcePanel response={response} onBrowse={onBrowse} />}
          </FoundationResult>
        </FoundationPanel>
        <FoundationPanel
          title="热点知识"
          subtitle={`近 7 天 · ${hot.response?.meta.dataMode === 'live' ? '引用' : '模拟引用'}`}
          tone="plain"
        >
          <FoundationResult query={hot} label="热点知识">
            {(response) => (
              <FoundationHotKnowledge
                response={response}
                onDetail={(selected) => setBrowse({ kind: selected.kind, selected })}
              />
            )}
          </FoundationResult>
        </FoundationPanel>
      </div>
      {browse && (
        <FoundationAssetBrowser
          reader={reader}
          initialKind={browse.kind}
          initialSelected={browse.selected}
          onClose={() => setBrowse(null)}
        />
      )}
    </section>
  )
}
