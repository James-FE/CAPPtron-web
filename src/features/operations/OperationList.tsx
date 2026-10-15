import type { ProcessOperation } from '../../api/view-model'

type Props = {
  operations: ProcessOperation[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function OperationList({ operations, selectedId, onSelect }: Props) {
  if (!operations.length) {
    return <div className="empty-state">当前任务尚无工序。请检查工艺规划数据来源。</div>
  }

  return (
    <nav className="operation-list custom-scroll" aria-label="工序列表">
      {operations.map((operation) => (
        <button
          key={operation.id}
          type="button"
          className={selectedId === operation.id ? 'operation-item selected' : 'operation-item'}
          aria-pressed={selectedId === operation.id}
          onClick={() => onSelect(operation.id)}
        >
          <span className="operation-sequence">{String(operation.sequence).padStart(2, '0')}</span>
          <span className="operation-name">{operation.name}</span>
        </button>
      ))}
    </nav>
  )
}
