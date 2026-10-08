// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createVisibleHostedReviewRefreshScheduler } from '@/store/github/visible-hosted-review-refresh-scheduler'
import {
  createWorkspaceReferenceRefreshTargets,
  registerWorkspaceReferenceRefreshRequests
} from './workspace-reference-refresh-targets'
import { getWorkspaceReferenceRequest } from './workspace-reference-details'
import { useWorkspaceReferenceDetailCache } from './workspace-reference-detail-cache'
import type { SshConnectionState } from '../../../../shared/ssh-types'
import {
  referenceAttachment,
  referenceRepo,
  referenceWorkspace
} from './workspace-reference-fixtures.test-support'

const read = vi.hoisted(() => vi.fn(async () => null))
vi.mock('./workspace-reference-detail-read', () => ({ readWorkspaceReferenceDetails: read }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  useWorkspaceReferenceDetailCache.setState({ entries: {} })
})
afterEach(() => vi.useRealTimers())

it('pauses disconnected SSH owners and resumes only when that owner reconnects', () => {
  const repo = { ...referenceRepo, connectionId: 'ssh-a' }
  const request = getWorkspaceReferenceRequest(referenceAttachment(), referenceWorkspace, repo)
  const unregister = registerWorkspaceReferenceRefreshRequests(referenceWorkspace.id, [request])
  const references = createWorkspaceReferenceRefreshTargets()
  const state = {
    visibleReviewWorktreeIds: [referenceWorkspace.id],
    activeWorktreeId: null,
    sshConnectionStates: new Map<string, SshConnectionState>()
  }
  const options = { visible: true, selectedOnly: false }
  try {
    expect(references.update(state, options)).toEqual([])
    state.sshConnectionStates.set('other', {
      targetId: 'other',
      status: 'connected',
      error: null,
      reconnectAttempt: 0
    })
    expect(references.update(state, options)).toEqual([])
    state.sshConnectionStates.set('ssh-a', {
      targetId: 'ssh-a',
      status: 'connected',
      error: null,
      reconnectAttempt: 0
    })
    expect(references.update(state, options)).toHaveLength(1)
    state.sshConnectionStates.set('ssh-a', {
      targetId: 'ssh-a',
      status: 'connecting',
      error: null,
      reconnectAttempt: 0
    })
    expect(references.update(state, options)).toEqual([])
  } finally {
    references.dispose()
    unregister()
  }
})

it('shares one scheduler timer across attached reviews and drops it when they leave the viewport', async () => {
  const requests = Array.from({ length: 12 }, (_, index) =>
    getWorkspaceReferenceRequest(referenceAttachment(index + 1), referenceWorkspace, referenceRepo)
  )
  const unregister = registerWorkspaceReferenceRefreshRequests(referenceWorkspace.id, requests)
  const references = createWorkspaceReferenceRefreshTargets()
  const scheduler = createVisibleHostedReviewRefreshScheduler()
  try {
    scheduler.update(
      references.update(
        {
          visibleReviewWorktreeIds: [referenceWorkspace.id],
          activeWorktreeId: null
        },
        { visible: true, selectedOnly: false }
      )
    )
    scheduler.setVisible(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(read).toHaveBeenCalledTimes(12)
    expect(vi.getTimerCount()).toBe(1)
    scheduler.update(
      references.update(
        {
          visibleReviewWorktreeIds: [],
          activeWorktreeId: null
        },
        { visible: true, selectedOnly: false }
      )
    )
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(600_000)
    expect(read).toHaveBeenCalledTimes(12)
  } finally {
    scheduler.dispose()
    references.dispose()
    unregister()
  }
})
