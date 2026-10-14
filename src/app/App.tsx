import { useState } from 'react'

const stages = [
  {
    id: 'input',
    name: '01 / Model Input',
    detail: 'Model selection and structured input will be implemented in P0.',
  },
  {
    id: 'planning',
    name: '02 / Process Planning',
    detail: 'Operations, steps, parameters, and resources will use dynamic task data.',
  },
  {
    id: 'review',
    name: '03 / Program Review',
    detail: 'NC review is distinct from process-card approval and CAM verification.',
  },
] as const

type StageId = (typeof stages)[number]['id']

export default function App() {
  const [selectedStage, setSelectedStage] = useState<StageId>('input')
  const stage = stages.find((entry) => entry.id === selectedStage) ?? stages[0]

  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">CAPPtron / Engineering workspace</p>
          <h1>CNC Agentic Programming</h1>
        </div>
        <span className="status-tag">UI foundation / No CAM integration</span>
      </header>
      <section className="workspace" aria-label="Frontend project foundation">
        <div className="section-header">
          <div>
            <p className="eyebrow">Web application skeleton</p>
            <h2>Frontend infrastructure is ready for implementation</h2>
            <p className="subtle">
              This is an engineering bootstrap screen, not the finished Figma r06 interface.
            </p>
          </div>
          <span className="mock-tag">Scaffold only</span>
        </div>
        <nav className="stage-list" aria-label="Planned workflow stages">
          {stages.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={selectedStage === item.id}
              className={selectedStage === item.id ? 'stage active' : 'stage'}
              onClick={() => setSelectedStage(item.id)}
            >
              {item.name}
            </button>
          ))}
        </nav>
        <article className="detail-panel" aria-live="polite">
          <p className="eyebrow">Selected implementation workstream</p>
          <h3>{stage.name}</h3>
          <p>{stage.detail}</p>
          <p className="notice">
            No STEP parsing, Agent reasoning, CAM generation, NC validation, or approval is
            performed by this starter screen.
          </p>
        </article>
      </section>
      <footer className="footer">Design baseline: Figma r06. Backend: CAPPtron-core.</footer>
    </main>
  )
}
