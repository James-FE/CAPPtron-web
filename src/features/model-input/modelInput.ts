export type StepExtension = 'STEP' | 'STP'

export type DemoModel = {
  name: string
  extension: StepExtension
  source: string
}

export type ModelSelection =
  | { kind: 'empty' }
  | { kind: 'local'; file: File; extension: StepExtension }
  | { kind: 'demo'; model: DemoModel }

export function getStepExtension(name: string): StepExtension | null {
  if (!/^.+\.(step|stp)$/i.test(name)) return null
  const extension = name.split('.').pop()?.toUpperCase()
  return extension === 'STEP' || extension === 'STP' ? extension : null
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

export function selectionName(selection: ModelSelection): string | null {
  if (selection.kind === 'local') return selection.file.name
  if (selection.kind === 'demo') return selection.model.name
  return null
}
