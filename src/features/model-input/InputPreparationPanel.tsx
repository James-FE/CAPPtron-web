import type { ModelSelection } from './modelInput'

export function InputPreparationPanel({ selection }: { selection: ModelSelection }) {
  const modelStatus =
    selection.kind === 'local'
      ? '本地已选择，尚未上传或解析'
      : selection.kind === 'demo'
        ? '使用演示输入'
        : '待选择'
  return (
    <section className="input-preparation" aria-labelledby="preparation-title">
      <h3 id="preparation-title">输入准备</h3>
      <dl className="preparation-items">
        <div>
          <dt>模型 / 图纸</dt>
          <dd aria-live="polite">{modelStatus}</dd>
        </div>
        <div>
          <dt>制造要求</dt>
          <dd>待提供</dd>
        </div>
        <div>
          <dt>工艺模板与上游方案参考</dt>
          <dd>待接入</dd>
        </div>
      </dl>
      <p className="preparation-note">
        示例仅展示输入元数据；
        <br />
        模型上传与解析接口待接入。
      </p>
    </section>
  )
}
