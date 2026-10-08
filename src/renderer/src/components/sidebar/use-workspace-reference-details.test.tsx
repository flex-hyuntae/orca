import { useAppStore } from '@/store'
import { useVisibleHostedReviewRefresh } from '@/app-shell/use-visible-hosted-review-refresh'
// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getWorkspaceAttachmentKey } from '../../../../shared/workspace-attachments'
import { useWorkspaceReferenceDetails } from './use-workspace-reference-details'
import { useWorkspaceReferenceDetailCache } from './workspace-reference-detail-cache'
import type { WorkspaceReferenceDetails } from './workspace-reference-details'
import {
  referenceAttachment,
  referenceRepo,
  referenceReview,
  referenceWorkspace
} from './workspace-reference-fixtures.test-support'

function useScheduledReferenceDetails(...args: Parameters<typeof useWorkspaceReferenceDetails>) {
  useVisibleHostedReviewRefresh({ enabled: true })
  return useWorkspaceReferenceDetails(...args)
}

vi.mock('@/store', async () => {
  const { create } = await import('zustand')
  return { useAppStore: create(() => ({ visibleReviewWorktreeIds: [], activeWorktreeId: null })) }
})
vi.mock('@/store/github/visible-hosted-review-refresh-targets', () => ({
  getVisibleHostedReviewRefreshTargets: () => [],
  visibleHostedReviewRefreshInputsChanged: () => true
}))

const mocks = vi.hoisted(() => ({
  sleeping: false,
  visible: true,
  web: false,
  read: vi.fn<(...args: unknown[]) => Promise<WorkspaceReferenceDetails | null>>()
}))
vi.mock('./workspace-reference-detail-read', () => ({ readWorkspaceReferenceDetails: mocks.read }))
vi.mock('./use-worktree-sleep-state', () => ({ useIsSleepingWorktree: () => mocks.sleeping }))
vi.mock('@/lib/web-client-location', () => ({ isWebClientLocation: () => mocks.web }))

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({
    visibleReviewWorktreeIds: [referenceWorkspace.id],
    activeWorktreeId: null
  })
  mocks.sleeping = false
  mocks.visible = true
  mocks.web = false
  mocks.read.mockResolvedValue(null)
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (mocks.visible ? 'visible' : 'hidden')
  })
  useWorkspaceReferenceDetailCache.setState({ entries: {} })
})
afterEach(cleanup)

describe('automatic checks for all attached reviews', () => {
  it('waits for the mounted card to enter the shared visible set', async () => {
    useAppStore.setState({ visibleReviewWorktreeIds: [] })
    const workspace = { ...referenceWorkspace, linkedItems: [referenceAttachment()] }
    renderHook(() => useScheduledReferenceDetails(workspace, referenceRepo, null, false))
    await act(async () => {
      await Promise.resolve()
    })
    expect(mocks.read).not.toHaveBeenCalled()
    act(() => useAppStore.setState({ visibleReviewWorktreeIds: [workspace.id] }))
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce())
  })

  it('limits paired web refreshes to the selected visible workspace', async () => {
    mocks.web = true
    const workspace = { ...referenceWorkspace, linkedItems: [referenceAttachment()] }
    renderHook(() => useScheduledReferenceDetails(workspace, referenceRepo, null, false))
    await act(async () => {
      await Promise.resolve()
    })
    expect(mocks.read).not.toHaveBeenCalled()
    act(() => useAppStore.setState({ activeWorktreeId: workspace.id }))
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce())
    expect(mocks.read).toHaveBeenCalledWith(
      expect.objectContaining({ admissionTier: 'interactive' })
    )
  })

  it('waits for workspace readiness even when eligible cards are already mounted', async () => {
    const workspace = { ...referenceWorkspace, linkedItems: [referenceAttachment()] }
    const hook = renderHook(
      ({ enabled }) => {
        useVisibleHostedReviewRefresh({ enabled })
        return useWorkspaceReferenceDetails(workspace, referenceRepo, null, false)
      },
      { initialProps: { enabled: false } }
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(mocks.read).not.toHaveBeenCalled()
    hook.rerender({ enabled: true })
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce())
  })

  it('loads every eligible review without hover and leaves tasks demand-driven', async () => {
    const items = [
      referenceAttachment(1),
      referenceAttachment(2),
      { ...referenceAttachment(3), type: 'issue' as const }
    ]
    const workspace = { ...referenceWorkspace, linkedPR: null, linkedItems: items }
    const hook = renderHook(
      ({ open }) => useScheduledReferenceDetails(workspace, referenceRepo, null, open),
      { initialProps: { open: false } }
    )
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2))
    expect(mocks.read.mock.calls.map(([request]) => request)).toEqual([
      expect.objectContaining({ item: items[0], admissionTier: 'background' }),
      expect.objectContaining({ item: items[1], admissionTier: 'background' })
    ])
    hook.rerender({ open: true })
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(3))
  })

  it.each(['sleeping', 'archived', 'bare', 'hidden'])(
    'does not fan out automatically for a %s workspace',
    async (condition) => {
      mocks.sleeping = condition === 'sleeping'
      mocks.visible = condition !== 'hidden'
      const workspace = {
        ...referenceWorkspace,
        linkedPR: null,
        linkedItems: [referenceAttachment(1), referenceAttachment(2)],
        isArchived: condition === 'archived',
        isBare: condition === 'bare'
      }
      renderHook(() => useScheduledReferenceDetails(workspace, referenceRepo, null, false))
      await act(async () => {
        await Promise.resolve()
      })
      expect(mocks.read).not.toHaveBeenCalled()
    }
  )

  it('keeps provider and host-mismatched references unknown without querying them', async () => {
    const compatible = referenceAttachment(1)
    const foreign = { ...referenceAttachment(2), url: 'https://github.com/other/project/pull/2' }
    const gitlab = {
      provider: 'gitlab' as const,
      type: 'mr' as const,
      number: 3,
      url: 'https://gitlab.com/acme/orca/-/merge_requests/3'
    }
    const workspace = {
      ...referenceWorkspace,
      linkedPR: null,
      linkedItems: [compatible, foreign, gitlab]
    }
    renderHook(() => useScheduledReferenceDetails(workspace, referenceRepo, null, false))
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1))
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ item: compatible }))
  })

  it.each(['hide', 'unmount'])(
    'cancels queued automatic reads on %s while retaining bounded native work',
    async (action) => {
      const resolvers: (() => void)[] = []
      mocks.read.mockImplementation(
        () => new Promise((resolve) => resolvers.push(() => resolve(null)))
      )
      const items = [20, 21, 22, 23, 24].map((number) => referenceAttachment(number))
      const workspace = { ...referenceWorkspace, linkedPR: null, linkedItems: items }
      const hook = renderHook(() =>
        useScheduledReferenceDetails(workspace, referenceRepo, null, false)
      )
      await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(3))
      if (action === 'hide') {
        act(() => {
          mocks.visible = false
          document.dispatchEvent(new Event('visibilitychange'))
        })
      } else {
        hook.unmount()
      }
      await act(async () => {
        resolvers.forEach((resolve) => resolve())
        await Promise.resolve()
      })
      await waitFor(() =>
        expect(Object.keys(useWorkspaceReferenceDetailCache.getState().entries)).toHaveLength(3)
      )
      expect(mocks.read).toHaveBeenCalledTimes(3)
      expect(
        useWorkspaceReferenceDetailCache.getState().entries[getWorkspaceAttachmentKey(items[3])]
      ).toBeUndefined()
    }
  )

  it('does not revive an old primary success after an exact reference refresh returns unavailable', async () => {
    const item = referenceAttachment(1)
    const workspace = { ...referenceWorkspace, linkedPR: 1, linkedItems: [item] }
    const hook = renderHook(() =>
      useScheduledReferenceDetails(workspace, referenceRepo, referenceReview(1), false)
    )
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(hook.result.current[getWorkspaceAttachmentKey(item)]).toBeUndefined()
    )
  })
})
