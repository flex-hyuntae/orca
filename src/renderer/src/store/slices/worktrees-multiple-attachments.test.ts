import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWorkspaceAttachments } from '../../../../shared/workspace-attachments'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { makeFolderWorkspace, makeWorktree } from './worktrees-slice-test-fixtures'
import {
  createTestStore,
  mockApi,
  resetRemoteRuntimeMocks,
  resetWorktreeSliceModuleMemory
} from './worktrees-slice-test-harness'

beforeEach(() => {
  vi.clearAllMocks()
  resetRemoteRuntimeMocks()
  resetWorktreeSliceModuleMemory()
})

describe('workspace attachment collections', () => {
  it('retains earlier reviews when linking another provider and persists the collection', async () => {
    const store = createTestStore()
    const wt = makeWorktree({ id: 'repo1::/work', repoId: 'repo1', linkedPR: 42 })
    store.setState({ worktreesByRepo: { repo1: [wt] } })
    await store.getState().updateWorktreeMeta(wt.id, { linkedGitLabMR: 7 })
    const saved = store.getState().worktreesByRepo.repo1[0]
    expect(saved.linkedPR).toBeNull()
    expect(saved.linkedGitLabMR).toBe(7)
    expect(getWorkspaceAttachments(saved)).toEqual([
      { provider: 'github', type: 'pr', number: 42 },
      { provider: 'gitlab', type: 'mr', number: 7 }
    ])
    expect(mockApi.worktrees.updateMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({ linkedItems: saved.linkedItems })
      })
    )
  })

  it('removes a secondary review without disturbing the active review or task', async () => {
    const store = createTestStore()
    const wt = makeWorktree({
      id: 'repo1::/work',
      repoId: 'repo1',
      linkedPR: 42,
      linkedIssue: 9,
      linkedItems: [
        { provider: 'github', type: 'pr', number: 42 },
        { provider: 'github', type: 'pr', number: 43 },
        { provider: 'github', type: 'issue', number: 9 }
      ]
    })
    store.setState({ worktreesByRepo: { repo1: [wt] } })
    await store.getState().updateWorktreeMeta(wt.id, {
      linkedItems: wt.linkedItems?.filter((item) => item.number !== 43)
    })
    expect(store.getState().worktreesByRepo.repo1[0]).toMatchObject({
      linkedPR: 42,
      linkedIssue: 9
    })
    expect(getWorkspaceAttachments(store.getState().worktreesByRepo.repo1[0])).toHaveLength(2)
  })

  it('routes folder links to the owning folder update instead of dropping them', async () => {
    const store = createTestStore()
    const folder = makeFolderWorkspace()
    const updateFolderWorkspace = vi.fn().mockResolvedValue(true)
    store.setState({ folderWorkspaces: [folder], updateFolderWorkspace })
    const linkedItems = [
      { provider: 'linear', type: 'issue', number: 0, identifier: 'ENG-42' }
    ] as const
    const result = await store.getState().updateWorktreeMeta(folderWorkspaceKey(folder.id), {
      linkedItems: [...linkedItems]
    })
    expect(result).toEqual({ ok: true })
    expect(updateFolderWorkspace).toHaveBeenCalledWith(
      folder.id,
      expect.objectContaining({ linkedItems }),
      { executionHostId: 'local' }
    )
    expect(mockApi.worktrees.updateMeta).not.toHaveBeenCalled()
  })
})
