import type {
  AssetKind,
  AssetReference,
  FoundationOverview,
  FoundationResponse,
  HotAsset,
  ResourceSummary,
} from '../../api/data-foundation/types'
import { assetLabels, integrationLabels, modelLabels, number } from './presentation'

export function FoundationKpis({ response }: { response: FoundationResponse<FoundationOverview> }) {
  const demo = response.meta.dataMode === 'synthetic_demo'
  const items = [
    ['数据资产总量', response.data.totalAssets, '条', 'cyan'],
    [demo ? '演示日新增' : '当日新增', response.data.addedToday, '条', 'blue'],
    ['知识条目', response.data.knowledgeCount, '条', 'cyan'],
    ['业务数据量', response.data.businessDataCount, '条', 'violet'],
    ['模型数量', response.data.modelCount, '个', 'blue'],
  ] as const
  return (
    <dl className="foundation-kpis">
      {items.map(([label, value, unit, tone]) => (
        <div key={label} className={`foundation-kpi foundation-tone-${tone}`}>
          <dt>{label}</dt>
          <dd>
            <strong>{number(value)}</strong>
            <span>{unit}</span>
          </dd>
          {(label === '演示日新增' || label === '当日新增') && (
            <small>
              {response.data.date}
              {demo ? ' · 演示基准日' : ' · 统计日'}
            </small>
          )}
        </div>
      ))}
    </dl>
  )
}
export function FoundationModelPanel({
  response,
  onBrowse,
}: {
  response: FoundationResponse<ResourceSummary>
  onBrowse: (kind: AssetKind) => void
}) {
  const { models } = response.data
  return (
    <>
      <div className="foundation-model-types">
        {models.byType.map((item) => (
          <div key={item.modelType}>
            <span>{modelLabels[item.modelType]}</span>
            <strong>
              {number(item.count)} <small>个</small>
            </strong>
          </div>
        ))}
      </div>
      <div className="foundation-model-status" aria-label="模型接入状态">
        {models.byIntegrationStatus
          .filter((item) => item.count > 0)
          .map((item) => (
            <span key={item.integrationStatus}>
              {item.integrationStatus === 'not_connected' && (
                <img src="/data-foundation/status-amber.svg" alt="" />
              )}
              {integrationLabels[item.integrationStatus]} {number(item.count)} 个
            </span>
          ))}
        {models.total === 0 && <span>暂无模型登记</span>}
      </div>
      <button className="foundation-text-button" onClick={() => onBrowse('model')}>
        查看模型登记与支持任务 →
      </button>
    </>
  )
}
export function FoundationResourcePanel({
  response,
  onBrowse,
}: {
  response: FoundationResponse<ResourceSummary>
  onBrowse: (kind: AssetKind) => void
}) {
  const maximum = Math.max(1, ...response.data.businessResources.map((item) => item.count))
  const demo = response.meta.dataMode === 'synthetic_demo'
  return (
    <>
      <div className="foundation-resource-bars">
        {response.data.businessResources.map((item) => (
          <button
            key={item.kind}
            onClick={() => onBrowse(item.kind)}
            aria-label={`查看${assetLabels[item.kind]}，${item.count} 条`}
          >
            <span>{assetLabels[item.kind]}</span>
            <span className="foundation-bar-track">
              <span style={{ width: `${(item.count / maximum) * 100}%` }} />
            </span>
            <strong>{number(item.count)}</strong>
            <small>{demo ? '演示记录' : '资源记录'} →</small>
          </button>
        ))}
      </div>
      <p className="foundation-panel-note">
        {demo ? '正式业务数据库尚未接入' : '按当前数据源权限展示目录记录'} · 点击查看
      </p>
    </>
  )
}
export function FoundationHotKnowledge({
  response,
  onDetail,
}: {
  response: FoundationResponse<HotAsset[]>
  onDetail: (ref: AssetReference) => void
}) {
  const max = Math.max(1, ...response.data.map((item) => item.referenceCount))
  return (
    <>
      {response.data.length ? (
        <ol className="foundation-hot-list">
          {response.data.map((item) => (
            <li key={item.id}>
              <button onClick={() => onDetail({ kind: 'knowledge', id: item.id })}>
                <span className="foundation-rank">{String(item.rank).padStart(2, '0')}</span>
                <span className="foundation-hot-title">{item.title}</span>
                <span className="foundation-bar-track">
                  <span style={{ width: `${(item.referenceCount / max) * 100}%` }} />
                </span>
                <strong>
                  {number(item.referenceCount)}
                  <small> 次</small>
                </strong>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="foundation-state">该窗口暂无知识引用</p>
      )}
      {response.meta.window && (
        <p className="foundation-panel-note">
          {response.meta.window.startDate} — {response.meta.window.endDate} ·{' '}
          {response.meta.dataMode === 'synthetic_demo' ? '模拟引用' : '知识引用'}
        </p>
      )}
    </>
  )
}
