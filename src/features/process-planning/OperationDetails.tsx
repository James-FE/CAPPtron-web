import { ParameterFields } from './ParameterFields'
import type { Drafts } from './ParameterFields'
import type { ProcessOperation } from './processPlan'

export type DetailView = 'steps' | 'resources' | 'onsite'

export function OperationDetails({
  operation,
  view,
  onView,
  drafts,
  onDraft,
}: {
  operation: ProcessOperation
  view: DetailView
  onView: (view: DetailView) => void
  drafts: Drafts
  onDraft: (key: string, value: string) => void
}) {
  const fieldProps = { operationId: operation.id, drafts, onDraft }
  return (
    <section className="operation-detail" aria-label="当前工序详情">
      <header className="operation-header">
        <h3>
          {String(operation.sequence).padStart(2, '0')} {operation.name}
        </h3>
        <p className="muted-text">来源：{operation.source}</p>
        <div className="detail-switch" role="group" aria-label="工序详情视图">
          {(
            [
              ['steps', '工步详情'],
              ['resources', '参数与资源'],
              ['onsite', '现场信息'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="button"
              aria-pressed={view === id}
              onClick={() => onView(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div
        key={`${operation.id}-${view}`}
        className="detail-scroll"
        tabIndex={0}
        role="region"
        aria-label="工序详情正文"
      >
        {view === 'steps' && (
          <>
            <section>
              <h4>装夹与定位</h4>
              <p>{operation.setup ?? '暂无装夹与定位说明'}</p>
            </section>
            <section>
              <h4>加工内容 · {operation.steps.length} 个工步</h4>
              {!operation.steps.length && (
                <p className="muted-text">暂无工步信息，等待上游方案补充。</p>
              )}
              {operation.steps.map((step) => (
                <article key={step.id} className="process-step">
                  <h5>
                    {String(step.sequence).padStart(2, '0')} {step.name}
                  </h5>
                  {step.description && <p>{step.description}</p>}
                  <ParameterFields
                    {...fieldProps}
                    section={`step-${step.id}`}
                    parameters={step.parameters}
                    emptyText="此工步暂无参数信息。"
                  />
                </article>
              ))}
            </section>
            <section>
              <h4>现场信息与说明</h4>
              <p className="warning-text">
                {operation.onsiteMeasurements.length
                  ? `${operation.onsiteMeasurements.length} 项现场信息待人工核对。`
                  : '暂无现场测量项；不代表现场条件已确认。'}
              </p>
              <p className="muted-text">{operation.notes ?? '暂无补充说明'}</p>
            </section>
          </>
        )}
        {view === 'resources' && (
          <>
            <section>
              <h4>推荐参数 · Mock 演示</h4>
              <p className="muted-text">预设数值，未进行真实参数推荐或 CAM 仿真。</p>
              <div
                className="parameter-scroll"
                role="region"
                aria-label="推荐参数列表"
                tabIndex={0}
              >
                <ParameterFields
                  {...fieldProps}
                  section="parameters"
                  parameters={operation.parameters}
                  emptyText="暂无推荐参数；该工序可能不适用切削参数。"
                />
              </div>
            </section>
            <section>
              <h4>生产资源 · Mock 演示</h4>
              {!operation.resources.length && <p className="muted-text">暂无生产资源信息</p>}
              <ul className="resource-list">
                {operation.resources.map((resource) => (
                  <li key={resource.id}>
                    <span className="muted-text">
                      {{ tool: '刀具', machine: '设备', other: '其他资源' }[resource.kind]}
                    </span>
                    <strong>{resource.name}</strong>
                    <p>{resource.description ?? '暂无规格说明'}</p>
                    <span className="warning-text">
                      {resource.status === 'pending' ? '待核实' : 'Demo · 未核实可用性'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="onsite-callout">
              <h4>现场参数与约束</h4>
              <p>{operation.onsiteMeasurements.length} 项信息 · 填写草稿不代表现场确认</p>
              <button className="button" onClick={() => onView('onsite')}>
                查看并补充现场信息
              </button>
            </section>
          </>
        )}
        {view === 'onsite' && (
          <>
            <section>
              <h4>现场参数与约束</h4>
              <p className="warning-text">本地演示草稿，未提交服务器，未完成制造校核。</p>
              <p className="muted-text">按当前工序展示；实测值、图纸要求与工艺约束需分别核对。</p>
            </section>
            <ParameterFields
              {...fieldProps}
              section="onsite"
              parameters={operation.onsiteMeasurements}
              emptyText="暂无现场测量项，等待上游提供；不代表无需确认。"
            />
          </>
        )}
      </div>
    </section>
  )
}
