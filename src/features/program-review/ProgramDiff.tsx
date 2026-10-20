import { useMemo } from 'react'
import { diffLines } from 'diff'

export function ProgramDiff({ original, draft }: { original: string; draft: string }) {
  const parts = useMemo(() => diffLines(original, draft, { timeout: 1000 }), [original, draft])
  return (
    <section className="program-diff" aria-label="原始程序与当前草稿差异" tabIndex={0}>
      <h3>原始程序 ↔ 当前草稿</h3>
      <p className="muted-text">− 删除 · + 新增 · 未标记行保持不变</p>
      {original === draft ? (
        <p>当前草稿与原始程序一致。</p>
      ) : parts ? (
        <pre>
          {parts.map((part, index) => (
            <span
              key={index}
              className={part.added ? 'diff-added' : part.removed ? 'diff-removed' : ''}
            >
              {part.value
                .split('\n')
                .map((line, i, lines) =>
                  i === lines.length - 1 && !line
                    ? ''
                    : `${part.added ? '+ ' : part.removed ? '− ' : '  '}${line}\n`,
                )
                .join('')}
            </span>
          ))}
        </pre>
      ) : (
        <>
          <p>差异计算超时，请逐段对照完整原文与草稿。</p>
          <pre>{original}</pre>
          <pre>{draft}</pre>
        </>
      )}
    </section>
  )
}
