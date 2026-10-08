import { describe, expect, it } from 'vitest'
import { makeWorktree } from '../../worktrees-slice-test-fixtures'
import { rebaseWorkspaceAttachmentUpdate } from './workspace-attachment-update-rebase'

describe('attachment edits during a review target lookup', () => {
  it('preserves concurrent additions while applying requested removals', () => {
    const snapshot = makeWorktree({
      id: 'repo::/work',
      repoId: 'repo',
      linkedPR: 1,
      linkedItems: [
        { provider: 'github', type: 'pr', number: 1 },
        { provider: 'github', type: 'issue', number: 2 }
      ]
    })
    const current = {
      ...snapshot,
      linkedItems: [
        ...(snapshot.linkedItems ?? []),
        { provider: 'linear', type: 'issue', number: 0, identifier: 'ENG-9' } as const
      ]
    }
    const updates = rebaseWorkspaceAttachmentUpdate(snapshot, current, {
      linkedItems: [
        { provider: 'github', type: 'pr', number: 1 },
        { provider: 'github', type: 'pr', number: 3 }
      ],
      linkedPR: 3
    })
    expect(updates.linkedItems).toEqual([
      { provider: 'github', type: 'pr', number: 1 },
      { provider: 'linear', type: 'issue', number: 0, identifier: 'ENG-9' },
      { provider: 'github', type: 'pr', number: 3 }
    ])
    expect(updates.linkedPR).toBe(3)
  })
})
