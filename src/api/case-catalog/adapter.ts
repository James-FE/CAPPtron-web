import type { Parameter, ProcessPlan } from '../../features/process-planning/processPlan'
import type { CaseDocument, CaseField } from './types'

function fieldToViewModel(field: CaseField): Parameter {
  const { editPolicy, requirement, source, ...rest } = field
  return {
    ...rest,
    source: source === 'historical_record' ? 'template' : source,
    editable: editPolicy === 'demo_input',
    required: requirement === 'demo_required',
  }
}

export function caseToProcessPlan(document: CaseDocument): ProcessPlan {
  const { taskFields, operations, ...plan } = document.processPlan
  return {
    ...plan,
    id: JSON.stringify([
      'case',
      document.case.id,
      document.caseVersion.version,
      document.contentDigest,
    ]),
    origin: 'mock',
    sourceDescription: `工程参考 ${document.case.id} / ${document.caseVersion.version} · ${plan.sourceDescription}`,
    taskMeasurements: taskFields.map(fieldToViewModel),
    operations: operations.map(({ onsiteFields, steps, parameters, resources, ...operation }) => ({
      ...operation,
      steps: steps.map((step) => ({ ...step, parameters: step.parameters.map(fieldToViewModel) })),
      parameters: parameters.map(fieldToViewModel),
      resources: resources.map((resource) => ({ ...resource })),
      onsiteMeasurements: onsiteFields.map(fieldToViewModel),
    })),
    caseReference: {
      caseId: document.case.id,
      version: document.caseVersion.version,
      planId: plan.id,
      contentDigest: document.contentDigest,
    },
  }
}
