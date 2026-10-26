import { describe, expect, it } from 'vitest'
import { CommandJournal } from './commandJournal'

function storage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
  }
}

describe('CommandJournal', () => {
  it('persists the original request, command, expected version and location across reload', () => {
    const disk = storage()
    const first = new CommandJournal(disk)
    first.update({ task_id: 'task-1', revision: 2 })
    first.begin({
      domain: 'replan',
      command_id: 'replan-1',
      request: { command_id: 'replan-1', base_revision: 2, expected_feedback_version: 0 },
      expected_version: 2,
      task_id: 'task-1',
    })
    expect(new CommandJournal(disk).read().pending).toEqual(first.read().pending)
  })

  it('fails closed on corrupt or full storage', () => {
    const bad = storage()
    bad.setItem('capptron.core.workflow.v1', '{bad')
    expect(() => new CommandJournal(bad).read()).toThrow()
    const full = {
      ...storage(),
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(() =>
      new CommandJournal(full).begin({
        domain: 'cam',
        command_id: 'cam-1',
        request: {
          command_id: 'cam-1',
          plan_ref: { task_id: 'task-1' },
          expected_current_revision: 1,
        },
        expected_version: 1,
        task_id: 'task-1',
      }),
    ).toThrow()
  })

  it('rejects invalid persisted domains and command identity', () => {
    const disk = storage()
    disk.setItem(
      CommandJournal.key,
      JSON.stringify({
        pending: {
          domain: 'unknown',
          command_id: 'x',
          request: { command_id: 'y' },
          expected_version: 1,
        },
      }),
    )
    expect(() => new CommandJournal(disk).read()).toThrow(/command journal/i)
    for (const pending of [null, false, 12]) {
      disk.setItem(CommandJournal.key, JSON.stringify({ pending }))
      expect(() => new CommandJournal(disk).read()).toThrow(/command journal/i)
    }
    disk.setItem(
      CommandJournal.key,
      JSON.stringify({ nc_ref: { cam_run_id: 'run', version: 0, content_digest: 'bad' } }),
    )
    expect(() => new CommandJournal(disk).read()).toThrow(/identity/i)
    disk.setItem(
      CommandJournal.key,
      JSON.stringify({
        pending: {
          domain: 'cam',
          command_id: 'x',
          request: { command_id: 'y' },
          expected_version: 1,
        },
      }),
    )
    expect(() => new CommandJournal(disk).read()).toThrow(/command journal/i)
  })

  it('uses independent storage keys for different Core bases', () => {
    const disk = storage()
    new CommandJournal(disk, 'http://core-a').update({ task_id: 'task-a' })
    expect(new CommandJournal(disk, 'http://core-b').read()).toEqual({})
  })
})
