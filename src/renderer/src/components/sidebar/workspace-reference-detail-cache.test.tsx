// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeTaskSourceContext } from '../../../../shared/task-source-context'
import { useWorkspaceReferenceDetails } from './use-workspace-reference-details'
import {
  useWorkspaceReferenceDetailCache,
  loadWorkspaceReferenceDetails
} from './workspace-reference-detail-cache'
import {
  getWorkspaceReferenceRequest,
  type WorkspaceReferenceDetails
} from './workspace-reference-details'
import { getWorkspaceAttachmentKey } from '../../../../shared/workspace-attachments'
import {
  referenceAttachment,
  referenceRepo,
  referenceWorkspace,
  referenceReview
} from './workspace-reference-fixtures.test-support'

const read = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<WorkspaceReferenceDetails | null>>()
)
vi.mock('./workspace-reference-detail-read', () => ({ readWorkspaceReferenceDetails: read }))
beforeEach(() => {
  vi.clearAllMocks()
  useWorkspaceReferenceDetailCache.setState({ entries: {} })
})
afterEach(cleanup)
describe('workspace reference status cache', () => {
  it('loads lazily on hover and shares fresh requests without adding polling timers', async () => {
    const item = referenceAttachment(42)
    const workspace = { ...referenceWorkspace, linkedPR: 42, linkedItems: [item] }
    read.mockResolvedValue({
      title: 'Sibling',
      url: item.url ?? '',
      review: referenceReview(42, { state: 'merged' })
    })
    const first = renderHook(
      ({ open }) => useWorkspaceReferenceDetails(workspace, referenceRepo, null, open),
      { initialProps: { open: false } }
    )
    expect(read).not.toHaveBeenCalled()
    first.rerender({ open: true })
    await waitFor(() =>
      expect(first.result.current[getWorkspaceAttachmentKey(item)]?.review?.state).toBe('merged')
    )
    const second = renderHook(() =>
      useWorkspaceReferenceDetails(workspace, referenceRepo, null, true)
    )
    expect(second.result.current[getWorkspaceAttachmentKey(item)]?.review?.state).toBe('merged')
    expect(read).toHaveBeenCalledTimes(1)
    first.rerender({ open: false })
    first.rerender({ open: true })
    expect(read).toHaveBeenCalledTimes(1)
  })
  it('coalesces in-flight lookups and caps provider request concurrency', async () => {
    const resolvers: (() => void)[] = []
    read.mockImplementation(() => new Promise((resolve) => resolvers.push(() => resolve(null))))
    const first = getWorkspaceReferenceRequest(
      referenceAttachment(42),
      referenceWorkspace,
      referenceRepo
    )
    const duplicate = loadWorkspaceReferenceDetails(first)
    expect(loadWorkspaceReferenceDetails(first)).toBe(duplicate)
    const promises = [
      duplicate,
      ...[43, 44, 45].map((number) =>
        loadWorkspaceReferenceDetails(
          getWorkspaceReferenceRequest(
            referenceAttachment(number),
            referenceWorkspace,
            referenceRepo
          )
        )
      )
    ]
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3))
    resolvers[0]()
    await waitFor(() => expect(read).toHaveBeenCalledTimes(4))
    resolvers.slice(1).forEach((resolve) => resolve())
    await Promise.all(promises)
  })
  it('does not project stale results into a different host or let stateless primary placeholders mask fetched state', async () => {
    const item = referenceAttachment(42)
    const workspace = { ...referenceWorkspace, linkedPR: 42, linkedItems: [item] }
    const oldRequest = getWorkspaceReferenceRequest(item, workspace, referenceRepo)
    const known = {
      title: 'Merged sibling',
      url: item.url ?? '',
      review: referenceReview(42, { state: 'merged' })
    }
    useWorkspaceReferenceDetailCache.setState({
      entries: { [oldRequest.key]: { data: known, fetchedAt: Date.now() } }
    })
    const placeholder = { provider: 'github' as const, number: 42, title: 'Loading', url: item.url }
    const { result, rerender } = renderHook(
      ({ repo }) => useWorkspaceReferenceDetails(workspace, repo, placeholder, false),
      { initialProps: { repo: referenceRepo } }
    )
    expect(result.current[getWorkspaceAttachmentKey(item)]?.review?.state).toBe('merged')
    rerender({ repo: { ...referenceRepo, executionHostId: 'runtime:other' } })
    expect(result.current[getWorkspaceAttachmentKey(item)]).toBeUndefined()
  })
  it('retains last known source-bound status when a refresh fails', async () => {
    const request = getWorkspaceReferenceRequest(
      referenceAttachment(),
      referenceWorkspace,
      referenceRepo
    )
    const known = { title: 'Known', url: referenceReview().url, review: referenceReview() }
    useWorkspaceReferenceDetailCache.setState({
      entries: { [request.key]: { data: known, fetchedAt: Date.now() - 61_000 } }
    })
    read.mockRejectedValue(new Error('SSH disconnected'))
    await act(() => loadWorkspaceReferenceDetails(request))
    expect(useWorkspaceReferenceDetailCache.getState().entries[request.key]?.data).toEqual({
      ...known,
      stale: true
    })
  })
  it('does not bypass source eligibility by copying primary branch status', () => {
    const context = normalizeTaskSourceContext({
      provider: 'github',
      projectId: 'project',
      hostId: 'local',
      accountLabel: 'unbound-account'
    })
    const item = { ...referenceAttachment(), taskSourceContext: context ?? undefined }
    const workspace = { ...referenceWorkspace, linkedItems: [item] }
    const { result } = renderHook(() =>
      useWorkspaceReferenceDetails(workspace, referenceRepo, referenceReview(), false)
    )
    expect(result.current[getWorkspaceAttachmentKey(item)]).toBeUndefined()
  })
  it('drops cached success when the repository remote no longer owns the attachment', () => {
    const context = normalizeTaskSourceContext({
      provider: 'github',
      projectId: 'project',
      repoId: referenceRepo.id,
      hostId: 'local',
      providerIdentity: { provider: 'github', owner: 'acme', repo: 'orca' }
    })
    const item = { ...referenceAttachment(), taskSourceContext: context ?? undefined }
    const workspace = { ...referenceWorkspace, linkedItems: [item] }
    const request = getWorkspaceReferenceRequest(item, workspace, referenceRepo)
    const data = { title: 'Passing', url: referenceReview().url, review: referenceReview() }
    useWorkspaceReferenceDetailCache.setState({
      entries: { [request.key]: { data, fetchedAt: Date.now() } }
    })
    const { result, rerender } = renderHook(
      ({ repo }) => useWorkspaceReferenceDetails(workspace, repo, null, false, false),
      { initialProps: { repo: referenceRepo } }
    )
    expect(result.current[getWorkspaceAttachmentKey(item)]?.review?.status).toBe('success')
    const repo = {
      ...referenceRepo,
      gitRemoteIdentity: {
        canonicalKey: 'github.com/other/project',
        remoteName: 'origin',
        remoteUrl: 'https://github.com/other/project.git'
      }
    }
    const rebound = getWorkspaceReferenceRequest(item, workspace, repo)
    expect(rebound.key).not.toBe(request.key)
    useWorkspaceReferenceDetailCache.setState({
      entries: { [rebound.key]: { data, fetchedAt: Date.now() } }
    })
    rerender({ repo })
    expect(result.current[getWorkspaceAttachmentKey(item)]).toBeUndefined()
    expect(read).not.toHaveBeenCalled()
  })
  it('cancels queued lookup demand when the hover closes without caching an unavailable result', async () => {
    const resolvers: (() => void)[] = []
    read.mockImplementation(() => new Promise((resolve) => resolvers.push(() => resolve(null))))
    const active = [20, 21, 22].map((number) =>
      loadWorkspaceReferenceDetails(
        getWorkspaceReferenceRequest(referenceAttachment(number), referenceWorkspace, referenceRepo)
      )
    )
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3))
    const request = getWorkspaceReferenceRequest(
      referenceAttachment(23),
      referenceWorkspace,
      referenceRepo
    )
    const controller = new AbortController()
    const queued = loadWorkspaceReferenceDetails(request, controller.signal)
    controller.abort()
    await queued
    resolvers.forEach((resolve) => resolve())
    await Promise.all(active)
    expect(read).toHaveBeenCalledTimes(3)
    expect(useWorkspaceReferenceDetailCache.getState().entries[request.key]).toBeUndefined()
  })
})
