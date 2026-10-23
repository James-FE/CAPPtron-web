import { describe, expect, it } from 'vitest'
import { parsePlanProduced, parseNcVersion } from './dto'
import { toLiveProcessPlan } from './viewModel'

const sha = 'a'.repeat(64)
const orderedIds = [
  'ring-op-1',
  'ring-op-7',
  'ring-op-2',
  'ring-op-3',
  'ring-op-4',
  'ring-op-5',
  'ring-op-6',
]
function validPlan() {
  return {
    schema_version: 'template-plan-v1',
    provider: 'template',
    event_id: 'event-synthetic',
    task_id: 'task-synthetic',
    result_id: 'result-synthetic',
    revision: 2,
    run_id: 'planning-run-synthetic',
    trace_id: 'trace-synthetic',
    source_request_id: 'request-source',
    trigger_request_id: 'request-trigger',
    feedback_snapshot: { feedback_version: 0, items: [] },
    payload: {
      part: { name: '合成环件' },
      blank: {},
      resources: {},
      operations: orderedIds.map((id, index) => ({
        id,
        sequence: index + 1,
        name: `工序 ${index + 1}`,
        steps: [{ id: `step-${id}`, sequence: 1, content: `步骤 ${id}`, attributes: {} }],
        attributes:
          index === 2
            ? {
                parameters: { rough_step: 0.4, spindle_speed: 900 },
                parameter_metadata: {
                  rough_step: {
                    name: '粗车层深',
                    unit: 'mm',
                    edit_policy: 'replace',
                    allowed_values: [0.5, 0.4],
                    source: {
                      kind: 'synthetic_profile',
                      resource_id: 'profile-synthetic',
                      sha256: sha,
                      pointer: '/rough_step',
                      engineering_status: 'unconfirmed',
                    },
                  },
                },
                source_parameters: [
                  {
                    id: 'historical-speed',
                    name: '历史转速',
                    value: 850,
                    unit: 'r/min',
                    source: 'historical_record',
                    status: 'provided',
                    inputKind: 'number',
                    editPolicy: 'read_only',
                  },
                ],
                resources: [
                  { id: 'reference-tool', name: '参考刀具', kind: 'tool', status: 'pending' },
                ],
              }
            : {},
      })),
      extensions: {
        template: { id: 'golden-b7', version: '2.3.0', digest: sha },
        plan_digest: sha,
        reference_only: false,
        execution_ready: true,
        parameter_rules: [
          {
            path: '/operations/2/attributes/parameters/rough_step',
            operation_id: 'ring-op-2',
            parameter_id: 'rough_step',
            value_type: 'number',
            unit: 'mm',
            allowed_values: [0.5, 0.4],
            edit_policy: 'replace',
          },
        ],
      },
    },
  }
}

describe('Core plan DTO and view model', () => {
  it('keeps the seven server sequences and stable IDs without ID sorting', () => {
    const view = toLiveProcessPlan(parsePlanProduced(validPlan()))
    expect(view.operations.map((operation) => [operation.id, operation.sequence])).toEqual(
      orderedIds.map((id, index) => [id, index + 1]),
    )
    expect(view.operations[2]?.steps[0]).toMatchObject({
      id: 'step-ring-op-2',
      sequence: 1,
      name: '步骤 ring-op-2',
    })
    expect(view.id).toContain('task-synthetic')
  })
  it('uses metadata and matching discrete rules only for editable values', () => {
    const operation = toLiveProcessPlan(parsePlanProduced(validPlan())).operations[2]!
    expect(operation.parameters.find((item) => item.id === 'rough_step')).toMatchObject({
      value: 0.4,
      unit: 'mm',
      editable: true,
      allowedValues: [0.5, 0.4],
    })
    expect(operation.parameters.find((item) => item.id === 'spindle_speed')).toMatchObject({
      value: 900,
      editable: false,
    })
    expect(operation.parameters.find((item) => item.id === 'spindle_speed')?.unit).toBeUndefined()
    expect(operation.parameters.find((item) => item.id === 'historical-speed')).toMatchObject({
      value: 850,
      editable: false,
      source: 'historical_record',
    })
    expect(operation.resources).toEqual([
      {
        id: 'reference-tool',
        name: '参考刀具',
        kind: 'tool',
        status: 'pending',
        source: 'historical_record',
      },
    ])
  })
  it('keeps a rule read only when its operation has no matching metadata', () => {
    const plan = validPlan()
    delete (plan.payload.operations[2]!.attributes as Record<string, unknown>).parameter_metadata
    const parameter = toLiveProcessPlan(parsePlanProduced(plan)).operations[2]!.parameters.find(
      (item) => item.id === 'rough_step',
    )
    expect(parameter).toMatchObject({ value: 0.4, editable: false })
    expect(parameter?.unit).toBeUndefined()
  })
  it('rejects duplicate IDs and non-increasing server sequence', () => {
    const duplicate = validPlan()
    duplicate.payload.operations[1]!.id = duplicate.payload.operations[0]!.id
    expect(() => parsePlanProduced(duplicate)).toThrow(/duplicate|sequence/i)
    const sequence = validPlan()
    sequence.payload.operations[1]!.sequence = 1
    expect(() => parsePlanProduced(sequence)).toThrow(/duplicate|sequence/i)
  })
  it('rejects incomplete envelopes and malformed parameter rules', () => {
    const incomplete = validPlan() as Record<string, unknown>
    delete incomplete.feedback_snapshot
    expect(() => parsePlanProduced(incomplete)).toThrow(/feedback_snapshot/)
    const malformed = validPlan()
    malformed.payload.extensions.parameter_rules[0]!.allowed_values = [0.5, 0.45]
    expect(() => parsePlanProduced(malformed)).toThrow(/allowed_values|metadata/)
  })
  it('validates an exact NC version and retains file identity, encoding and sequence', () => {
    const nc = parseNcVersion({
      ref: { cam_run_id: 'cam-synthetic', version: 2, content_digest: sha },
      plan_ref: {
        task_id: 'task-synthetic',
        result_id: 'result-synthetic',
        revision: 2,
        archive_digest: sha,
      },
      origin: 'human_edit',
      parent: null,
      feedback_id: null,
      review_status: 'pending',
      files: [
        {
          file_id: 'setup/T.NC',
          filename: 'T.NC',
          setup_id: 'setup',
          sequence: 1,
          encoding: 'utf-8-sig',
          sha256: sha,
          size_bytes: 8,
        },
      ],
      reviews: [],
      simulation_version: null,
      comparison_sha256: null,
      root_run_id: 'cam-synthetic',
      is_current_candidate: true,
      allowed_actions: ['review'],
    })
    expect(nc.files[0]).toMatchObject({ file_id: 'setup/T.NC', encoding: 'utf-8-sig', sequence: 1 })
  })
})
