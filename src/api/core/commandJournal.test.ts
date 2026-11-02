import { describe, expect, it } from 'vitest'
import { CommandJournal, migrateJournalScopes } from './commandJournal'

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
    get length() {
      return data.size
    },
    key: (index: number) => [...data.keys()][index] ?? null,
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

  it('migrates a complete legacy task atomically into an empty scope', () => {
    const disk = storage()
    const legacy = new CommandJournal(disk, 'http://core|abc123')
    legacy.update({
      asset_id: 'asset-1',
      parse_command_id: 'parse-1',
      task_id: 'task-legacy',
      run_id: 'run-legacy',
      cam_run_id: 'cam-legacy',
      drafts: { 'op-1.parameters.x': '0.4' },
    })
    const next = new CommandJournal(disk, 'http://core')
    migrateJournalScopes(disk, next)
    const migrated = next.read()
    // 完整任务身份连同位置一起迁移，不拼接其他任务。
    expect(migrated).toMatchObject({
      asset_id: 'asset-1',
      task_id: 'task-legacy',
      run_id: 'run-legacy',
      cam_run_id: 'cam-legacy',
    })
    // 旧索引原样保留，供旧版本回滚读取。
    expect(legacy.read().task_id).toBe('task-legacy')
  })

  it('migrates a pending command with its original body and identity', () => {
    const disk = storage()
    const legacy = new CommandJournal(disk, '|sha-old')
    legacy.update({
      asset_id: 'asset-1',
      parse_command_id: 'parse-1',
      task_id: 'task-legacy',
    })
    legacy.begin({
      domain: 'task',
      command_id: 'cmd-v1-original',
      request: {
        command_id: 'cmd-v1-original',
        schema_version: 'template-request-v1',
        payload: { template: { id: 'golden-b7', version: '2.1.0', digest: 'x' } },
      },
      expected_version: null,
      task_id: 'task-legacy',
      asset_id: 'asset-1',
    })
    const next = new CommandJournal(disk, '')
    migrateJournalScopes(disk, next)
    const pending = next.read().pending
    expect(pending?.command_id).toBe('cmd-v1-original')
    expect(pending?.request).toMatchObject({ schema_version: 'template-request-v1' })
  })

  it('never merges a different task into the current location', () => {
    const disk = storage()
    const active = new CommandJournal(disk, 'http://core')
    active.update({ task_id: 'task-new', asset_id: 'asset-2' })
    const legacy = new CommandJournal(disk, 'http://core|old')
    legacy.update({
      task_id: 'task-stale',
      run_id: 'run-stale',
      cam_run_id: 'cam-stale',
      drafts: { x: '1' },
    })
    migrateJournalScopes(disk, active)
    const state = active.read()
    expect(state.task_id).toBe('task-new')
    expect(state.run_id).toBeUndefined()
    expect(state.cam_run_id).toBeUndefined()
    expect(state.drafts).toBeUndefined()
  })

  it('resolved legacy commands do not resurrect as pending', () => {
    const disk = storage()
    const legacy = new CommandJournal(disk, '|sha')
    legacy.update({
      asset_id: 'asset-1',
      parse_command_id: 'parse-1',
      task_id: 'task-legacy',
    })
    legacy.begin({
      domain: 'replan',
      command_id: 'replan-old',
      request: {
        command_id: 'replan-old',
        base_revision: 1,
        expected_feedback_version: 0,
      },
      expected_version: 1,
      task_id: 'task-legacy',
    })
    const next = new CommandJournal(disk, '')
    migrateJournalScopes(disk, next)
    expect(next.read().pending?.command_id).toBe('replan-old')
    // 恢复完成后清除 pending，再次加载不得搬回旧 pending。
    next.clearPending('replan-old')
    migrateJournalScopes(disk, next)
    expect(next.read().pending).toBeUndefined()
    migrateJournalScopes(disk, next)
    expect(next.read().pending).toBeUndefined()
  })

  it('skips corrupt legacy indexes without blocking or marking', () => {
    const disk = storage()
    disk.setItem('capptron.core.workflow.v1.' + encodeURIComponent('http://core|bad'), '{broken')
    const next = new CommandJournal(disk, 'http://core')
    migrateJournalScopes(disk, next)
    expect(next.read()).toEqual({})
  })
})
