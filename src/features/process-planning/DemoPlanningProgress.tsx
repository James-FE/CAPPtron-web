import { useEffect, useState } from 'react'

export const DEMO_PLANNING_DURATION_MS = 4000

export function DemoPlanningProgress({
  startedAt,
  partName,
  onView,
}: {
  startedAt: number
  partName: string
  onView: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const progress = Math.min(
    100,
    Math.max(0, Math.floor(((now - startedAt) / DEMO_PLANNING_DURATION_MS) * 100)),
  )
  useEffect(() => {
    if (progress === 100) return
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [progress])
  return (
    <>
      <div className="planning-progress-columns">
        <section className="planning-references" aria-label="演示参考输入">
          <h3>参考输入已就绪 · Demo</h3>
          <p>工艺模板 / 预设工序顺序与操作约束</p>
          <p>上游方案 / 预设工序建议与工艺约束</p>
          <p>设计文件 / {partName} 示例输入</p>
          <p className="muted-text">以上为演示参考，未解析本地 STEP 文件。</p>
        </section>
        <section className="planning-progress-status" aria-label="演示工艺规划进度">
          <h3>{progress < 100 ? '正在形成工艺方案' : '演示工艺方案已就绪'}</h3>
          <p className="muted-text">工序、工步及资源匹配将随演示结果展示。</p>
          <progress aria-label="Demo 规划进度" value={progress} max={100} />
          <p className="progress-percentage">{progress}%</p>
          <p className="warning-text">Demo · 约 4 秒的演示进度，未调用真实 Agent 或 CAM。</p>
          <p aria-live="polite" className="muted-text">
            {progress === 100
              ? '可以查看工艺规划结果，随后补充缺失信息。'
              : '正在准备预设示例，请稍候。'}
          </p>
        </section>
      </div>
      <footer className="planning-actions">
        <p className="muted-text">预设 Mock 方案 · 未经制造校核</p>
        <button className="button primary-button" disabled={progress < 100} onClick={onView}>
          查看工艺规划结果
        </button>
      </footer>
    </>
  )
}
