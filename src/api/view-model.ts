/** Browser view models. These are NOT the CAPPtron-core API contracts. */
export interface ProcessStep {
  id: string
  description: string
}

export interface ProcessValue {
  id: string
  label: string
  value: string
  source: string
}

export interface ProcessOperation {
  id: string
  sequence: number
  name: string
  source: string
  setup?: string
  steps: ProcessStep[]
  resources: ProcessValue[]
  parameters: ProcessValue[]
  measurements: string[]
}

export interface DemoTask {
  id: string
  fileName: string
  title: string
  source: 'DEMO'
  operations: ProcessOperation[]
  initialOperationId?: string
  ncPreviewName: string
}

export type LocalFileSelection = { fileName: string; fileSize: number }

export function findOperation(task: DemoTask, id: string | null) {
  return task.operations.find((operation) => operation.id === id) ?? task.operations[0] ?? null
}
