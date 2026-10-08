import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WORKTREE_LINKED_ITEMS_DELTA_RUNTIME_CAPABILITY,
  WORKTREE_LINKED_ITEMS_RUNTIME_CAPABILITY
} from '../../../../shared/protocol-version'
import { createWorktreesApi } from './web-worktrees-api'

const mocks = vi.hoisted(() => ({ status: vi.fn(), call: vi.fn(), assertEnvironment: vi.fn() }))
vi.mock('./web-runtime-calls', () => ({
  getRemoteRuntimeStatus: mocks.status,
  callRuntimeResultWithOwner: mocks.call,
  callRuntimeResult: vi.fn(),
  withRuntimeWorktreeOwner: (row: unknown) => row
}))
vi.mock('./web-runtime-session', () => ({
  invalidateRuntimeWorktreeCaches: vi.fn(),
  requireActiveEnvironment: () => ({ id: 'env' }),
  assertActiveEnvironment: mocks.assertEnvironment
}))
vi.mock('./web-runtime-worktree-catalog', () => ({
  WEB_RUNTIME_WORKTREE_LIST_LIMIT: 500,
  callRuntimeDetectedWorktrees: vi.fn(),
  listAllRuntimeWorktrees: vi.fn()
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.call.mockResolvedValue({ result: { worktree: { id: 'wt' } }, hostId: 'runtime:env' })
})

describe('paired web attachment mutation compatibility', () => {
  it('refuses an atomic update when the paired host only supports collection replacement', async () => {
    mocks.status.mockResolvedValue({ capabilities: [WORKTREE_LINKED_ITEMS_RUNTIME_CAPABILITY] })
    const updates = { linkedItems: [], linkedItemsBase: [] }
    await expect(createWorktreesApi().updateMeta({ worktreeId: 'wt', updates })).rejects.toThrow(
      'Update the remote runtime'
    )
    expect(mocks.call).not.toHaveBeenCalled()
  })
  it('forwards the snapshot to a capable paired host', async () => {
    mocks.status.mockResolvedValue({
      capabilities: [
        WORKTREE_LINKED_ITEMS_RUNTIME_CAPABILITY,
        WORKTREE_LINKED_ITEMS_DELTA_RUNTIME_CAPABILITY
      ]
    })
    const updates = { linkedItems: [], linkedItemsBase: [], linkedItemsSelectionChanged: false }
    await createWorktreesApi().updateMeta({ worktreeId: 'wt', updates })
    expect(mocks.assertEnvironment).toHaveBeenCalledWith('env')
    expect(mocks.call).toHaveBeenCalledWith('worktree.set', { worktree: 'id:wt', ...updates })
  })
  it('gates creation and forwards its collection', async () => {
    const args = { repoId: 'repo', name: 'Work', baseBranch: 'main', linkedItems: [] }
    mocks.status.mockResolvedValue({ capabilities: [] })
    await expect(createWorktreesApi().create(args)).rejects.toThrow('Update the remote runtime')
    expect(mocks.call).not.toHaveBeenCalled()
    mocks.status.mockResolvedValue({ capabilities: [WORKTREE_LINKED_ITEMS_RUNTIME_CAPABILITY] })
    await createWorktreesApi().create(args)
    expect(mocks.call).toHaveBeenCalledWith(
      'worktree.create',
      expect.objectContaining({ linkedItems: [] })
    )
  })
})
