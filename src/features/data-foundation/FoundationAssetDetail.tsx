import { useCallback, type ReactNode } from 'react'
import type { DataFoundationReader } from '../../api/data-foundation/reader'
import type { AssetDetail, AssetReference } from '../../api/data-foundation/types'
import { useFoundationQuery } from './useFoundationQuery'
import { FoundationResult, FoundationSource } from './FoundationShared'
import {
  assetLabels,
  enumLabels,
  integrationLabels,
  knowledgeLabels,
  modelLabels,
  taskLabels,
  timestamp,
} from './presentation'

function Field({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="foundation-detail-field">
      <dt>{label}</dt>
      <dd>{children ?? '未提供'}</dd>
    </div>
  )
}
function values(items: string[], empty = '未提供') {
  return items.length ? items.map((item) => enumLabels[item] ?? item).join('、') : empty
}
function References({
  items,
  onNavigate,
}: {
  items: AssetReference[]
  onNavigate: (ref: AssetReference) => void
}) {
  return items.length ? (
    <ul className="foundation-reference-list">
      {items.map((ref) => (
        <li key={`${ref.kind}/${ref.id}`}>
          <button className="foundation-text-button" onClick={() => onNavigate(ref)}>
            {assetLabels[ref.kind]} · {ref.id} →
          </button>
        </li>
      ))}
    </ul>
  ) : (
    <>无关联记录</>
  )
}
function DetailFields({
  detail,
  onNavigate,
}: {
  detail: AssetDetail
  onNavigate: (ref: AssetReference) => void
}) {
  switch (detail.kind) {
    case 'part':
      return (
        <>
          <Field label="零件类别">{enumLabels[detail.asset.category]}</Field>
          <Field label="材料">{detail.asset.material}</Field>
          <Field label="制造特征">{values(detail.asset.features)}</Field>
          <Field label="说明">{detail.asset.description}</Field>
        </>
      )
    case 'process_plan':
      return (
        <>
          <Field label="业务版本">{detail.asset.version}</Field>
          <Field label="制造类型">{enumLabels[detail.asset.manufacturingType]}</Field>
          <Field label="所属零件">
            <References
              items={[{ kind: 'part', id: detail.asset.partId }]}
              onNavigate={onNavigate}
            />
          </Field>
          <Field label={`工序（${detail.asset.operations.length} 道）`}>
            {detail.asset.operations.length
              ? detail.asset.operations.map((operation) => (
                  <article className="foundation-operation" key={operation.id}>
                    <h4>
                      {operation.sequence} · {operation.name}
                    </h4>
                    <p>ID：{operation.id}</p>
                    <p>加工方式：{enumLabels[operation.method]}</p>
                    <p>机床：{operation.machineId ?? '未提供'}</p>
                    <p>
                      刀具：{operation.toolIds.length ? operation.toolIds.join('、') : '未提供'}
                    </p>
                    <p>
                      知识：
                      {operation.knowledgeIds.length ? operation.knowledgeIds.join('、') : '未提供'}
                    </p>
                    <References
                      items={[
                        ...(operation.machineId
                          ? [{ kind: 'machine' as const, id: operation.machineId }]
                          : []),
                        ...operation.toolIds.map((id) => ({ kind: 'tool' as const, id })),
                        ...operation.knowledgeIds.map((id) => ({ kind: 'knowledge' as const, id })),
                      ]}
                      onNavigate={onNavigate}
                    />
                  </article>
                ))
              : '暂无工序'}
          </Field>
        </>
      )
    case 'machine': {
      const { capabilities } = detail.asset
      return (
        <>
          <Field label="机床类型">
            {detail.asset.machineType === 'drill'
              ? '钻削设备'
              : enumLabels[detail.asset.machineType]}
          </Field>
          <Field label="制造商">{detail.asset.manufacturer}</Field>
          <Field label="轴数">{capabilities.axisCount}</Field>
          <Field label="最高主轴转速">
            {capabilities.maxSpindleSpeed &&
              `${capabilities.maxSpindleSpeed.value} ${capabilities.maxSpindleSpeed.unit}`}
          </Field>
          <Field label="工作包络">
            {capabilities.workEnvelope &&
              `${capabilities.workEnvelope.x} × ${capabilities.workEnvelope.y} × ${capabilities.workEnvelope.z} ${capabilities.workEnvelope.unit}`}
          </Field>
          <Field label="声明支持的加工方式">{values(detail.asset.supportedOperations)}</Field>
        </>
      )
    }
    case 'tool': {
      const { specification } = detail.asset
      return (
        <>
          <Field label="刀具类型">
            {detail.asset.toolType === 'drill'
              ? '钻头'
              : detail.asset.toolType === 'parting'
                ? '切断刀'
                : enumLabels[detail.asset.toolType]}
          </Field>
          <Field label="规格说明">{specification.description}</Field>
          <Field label="直径">
            {specification.diameter &&
              `${specification.diameter.value} ${specification.diameter.unit}`}
          </Field>
          <Field label="刃数">{specification.cuttingEdgeCount}</Field>
          <Field label="支持的加工方式">{values(detail.asset.supportedOperations)}</Field>
          <Field label="兼容机床类型">{values(detail.asset.compatibleMachineTypes)}</Field>
        </>
      )
    }
    case 'knowledge':
      return (
        <>
          <Field label="主题">{enumLabels[detail.asset.topic]}</Field>
          <Field label="主分类">{knowledgeLabels[detail.asset.knowledgeCategory]}</Field>
          <Field label="完整正文">
            <p className="foundation-knowledge-content">{detail.asset.content}</p>
          </Field>
          <Field label="适用加工方式">
            {values(detail.asset.applicability.operations, '未声明限制')}
          </Field>
          <Field label="适用零件类别">
            {values(detail.asset.applicability.partCategories, '未声明限制')}
          </Field>
          <Field label="适用材料">
            {values(detail.asset.applicability.materials, '未声明限制')}
          </Field>
          <Field label="相关资源">
            <References items={detail.asset.relatedAssets} onNavigate={onNavigate} />
          </Field>
        </>
      )
    case 'model':
      return (
        <>
          <Field label="模型类型">{modelLabels[detail.asset.modelType]}</Field>
          <Field label="接入状态">{integrationLabels[detail.asset.integrationStatus]}</Field>
          <Field label="支持任务">
            {detail.asset.supportedTasks.length
              ? detail.asset.supportedTasks.map((task) => taskLabels[task]).join('、')
              : '未提供'}
          </Field>
          <Field label="业务版本">{detail.asset.version}</Field>
        </>
      )
  }
}
export function FoundationAssetDetail({
  reader,
  reference,
  onNavigate,
}: {
  reader: DataFoundationReader
  reference: AssetReference
  onNavigate: (ref: AssetReference) => void
}) {
  const query = useFoundationQuery(
    useCallback(
      () => reader.getAssetDetail(reference.kind, reference.id),
      [reader, reference.kind, reference.id],
    ),
  )
  return (
    <section className="foundation-asset-detail" aria-label="资源详情">
      <FoundationResult query={query} label="资源详情">
        {(response) =>
          response.data ? (
            <>
              <header>
                <span>{assetLabels[response.data.kind]} · 只读详情</span>
                <h3>
                  {response.data.kind === 'knowledge'
                    ? response.data.asset.title
                    : response.data.asset.name}
                </h3>
              </header>
              <FoundationSource meta={response.meta} compact />
              <dl>
                <Field label="资源 ID">{response.data.asset.id}</Field>
                <Field label="登记时间">
                  {timestamp(response.data.asset.createdAt, response.meta.timeZone)}
                </Field>
                <Field label="来源">
                  {response.data.asset.provenance.dataMode} ·{' '}
                  {response.data.asset.provenance.source}
                </Field>
                <DetailFields detail={response.data} onNavigate={onNavigate} />
              </dl>
              {response.meta.dataMode === 'synthetic_demo' && (
                <p className="foundation-panel-note">
                  合成演示记录，未经制造验证；模型登记不代表实际服务接入。
                </p>
              )}
            </>
          ) : (
            <p className="foundation-state">资源不存在或已不可见：{reference.id}</p>
          )
        }
      </FoundationResult>
    </section>
  )
}
