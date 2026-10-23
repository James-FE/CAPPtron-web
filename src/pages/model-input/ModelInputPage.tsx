import { InputPreparationPanel } from '../../features/model-input/InputPreparationPanel'
import { ModelFilePicker } from '../../features/model-input/ModelFilePicker'
import type { ModelSelection } from '../../features/model-input/modelInput'

type ModelInputPageProps = {
  selection: ModelSelection
  error: string
  onChoose: () => void
  onFiles: (files: readonly File[]) => void
  onDemo: () => void
}

export function ModelInputPage(props: ModelInputPageProps) {
  return (
    <section className="model-input-page" aria-labelledby="model-input-title">
      <h2 id="model-input-title">模型输入</h2>
      <p className="page-subtitle">上传工序模型 / 设计文件</p>
      <div className="model-input-columns">
        <ModelFilePicker {...props} />
        <InputPreparationPanel selection={props.selection} />
      </div>
    </section>
  )
}
