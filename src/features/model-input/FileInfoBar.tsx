import { formatFileSize, selectionName } from './modelInput'
import type { ModelSelection } from './modelInput'

type FileInfoBarProps = {
  selection: ModelSelection
  onReplace: () => void
  onUnavailable: (message: string) => void
  sourceStatus?: string
  onInterpret?: () => void
}

export function FileInfoBar({
  selection,
  onReplace,
  onUnavailable,
  sourceStatus,
  onInterpret,
}: FileInfoBarProps) {
  const name = selectionName(selection)
  return (
    <section className="file-info-bar" aria-label="当前模型文件">
      <div className="file-summary" aria-live="polite" aria-atomic="true">
        {name ? (
          <>
            <span className="file-name" title={name}>
              {name}
            </span>
            <span className="file-source">
              {sourceStatus ??
                (selection.kind === 'local'
                  ? `${selection.extension} · ${formatFileSize(selection.file.size)} · 本地选择`
                  : selection.kind === 'demo'
                    ? selection.model.source
                    : '')}
            </span>
          </>
        ) : (
          <span>{sourceStatus ?? '尚未选择模型文件 / 示例仅演示输入状态'}</span>
        )}
      </div>
      <div className="file-actions">
        <button className="button replace-file-button" type="button" onClick={onReplace}>
          更换文件
        </button>
        <button
          className="button interpretation-button"
          type="button"
          data-unavailable={onInterpret ? undefined : 'true'}
          title={onInterpret ? '查看当前 Core 解析报告' : '设计文件解读尚未接入，暂不可用'}
          onClick={() =>
            onInterpret
              ? onInterpret()
              : onUnavailable('设计文件解读尚未接入，暂不可用；当前文件未上传或解析。')
          }
        >
          查看解读结果
        </button>
      </div>
    </section>
  )
}
