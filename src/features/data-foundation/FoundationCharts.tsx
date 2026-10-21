import { useEffect, useRef, useState } from 'react'
import type { GrowthTrend, KnowledgeDistribution } from '../../api/data-foundation/types'
import { knowledgeLabels, number } from './presentation'

export function FoundationGrowthChart({ data }: { data: GrowthTrend }) {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [tip, setTip] = useState('悬停或按 Tab 聚焦数据点查看数值')
  useEffect(() => {
    const element = container.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, entry.contentRect.width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const max = Math.max(
    1,
    ...data.points.flatMap((point) => [point.knowledgeAdded, point.businessDataAdded]),
  )
  const ceiling = Math.ceil(max / 3) * 3
  const x = (index: number) => 40 + (index * (width - 64)) / Math.max(1, data.points.length - 1)
  const y = (value: number) => 166 - (value / ceiling) * 144
  const series = [
    {
      key: 'knowledgeAdded',
      label: '新增知识',
      color: 'var(--accent-primary)',
      asset: 'knowledge-line.svg',
    },
    {
      key: 'businessDataAdded',
      label: '新增业务数据',
      color: 'var(--foundation-violet)',
      asset: 'business-line.svg',
    },
  ] as const
  return (
    <div ref={container} className="foundation-growth">
      <div className="foundation-chart-legend">
        {series.map((item) => (
          <span key={item.key}>
            <img src={`/data-foundation/${item.asset}`} alt="" />
            {item.label}
          </span>
        ))}
      </div>
      {data.points.length === 0 ? (
        <p className="foundation-state">暂无趋势数据</p>
      ) : (
        <svg
          viewBox={`0 0 ${width} 200`}
          aria-label="每日新增趋势数据"
          className="foundation-growth-svg"
        >
          {[0, 1, 2, 3].map((tick) => (
            <g key={tick}>
              <line
                x1={40}
                x2={width - 24}
                y1={y((tick * ceiling) / 3)}
                y2={y((tick * ceiling) / 3)}
                className="foundation-gridline"
              />
              <text x={0} y={y((tick * ceiling) / 3) + 4}>
                {(tick * ceiling) / 3}
              </text>
            </g>
          ))}
          {series.map((item) => (
            <g key={item.key}>
              <polyline
                fill="none"
                stroke={item.color}
                strokeWidth={2.5}
                strokeDasharray={item.key === 'businessDataAdded' ? '6 5' : undefined}
                points={data.points
                  .map((point, index) => `${x(index)},${y(point[item.key])}`)
                  .join(' ')}
              />
              {data.points.map((point, index) => {
                const label = `${point.date} ${item.label} ${point[item.key]} 条`
                return (
                  <g
                    key={point.date}
                    tabIndex={0}
                    role="img"
                    aria-label={label}
                    onFocus={() => setTip(label)}
                    onMouseEnter={() => setTip(label)}
                    className="foundation-point"
                  >
                    <circle cx={x(index)} cy={y(point[item.key])} r={9} fill="transparent" />
                    <circle cx={x(index)} cy={y(point[item.key])} r={4} fill={item.color} />
                    <title>{label}</title>
                  </g>
                )
              })}
            </g>
          ))}
          {data.points.map((point, index) => (
            <text key={point.date} x={x(index)} y={194} textAnchor="middle">
              {point.date.slice(5).replace('-', '.')}
            </text>
          ))}
        </svg>
      )}
      <div className="foundation-chart-caption">
        <span>
          {data.startDate} — {data.endDate}
        </span>
        <span aria-live="polite">{tip}</span>
      </div>
    </div>
  )
}

export function FoundationKnowledgeChart({ data }: { data: KnowledgeDistribution }) {
  const colors = {
    industry: 'var(--accent-primary)',
    institute: 'var(--foundation-violet)',
    experience: 'var(--foundation-blue)',
  }
  let offset = 0
  return (
    <div className="foundation-knowledge-chart">
      <svg
        viewBox="0 0 220 220"
        className="foundation-donut"
        role="img"
        aria-label={`知识总量 ${data.total} 条`}
      >
        <circle
          cx={110}
          cy={110}
          r={98}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={22}
        />
        {data.categories.map((item) => {
          const start = offset
          offset += item.percentage
          return (
            <circle
              key={item.category}
              cx={110}
              cy={110}
              r={98}
              pathLength={100}
              fill="none"
              stroke={colors[item.category]}
              strokeWidth={22}
              strokeDasharray={`${item.percentage} ${100 - item.percentage}`}
              strokeDashoffset={-start}
              transform="rotate(-90 110 110)"
            />
          )
        })}
        <text x={110} y={104} textAnchor="middle" className="foundation-donut-total">
          {number(data.total)}
        </text>
        <text x={110} y={143} textAnchor="middle" className="foundation-donut-label">
          {data.total ? '知识条目' : '暂无知识'}
        </text>
      </svg>
      <ul className="foundation-knowledge-legend">
        {data.categories.map((item) => (
          <li key={item.category}>
            <span>
              <i style={{ background: colors[item.category] }} />
              {knowledgeLabels[item.category]}
            </span>
            <strong>{number(item.count)}</strong>
            <span>{item.percentage}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
