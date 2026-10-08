import { create } from 'zustand'
import type { AppState } from '@/store/types'
import type { VisibleHostedReviewRefreshTarget } from '@/store/github/visible-hosted-review-refresh-scheduler'
import { reviewRefreshIntervalMs } from '../../../../shared/review-refresh-policy'
import type { WorkspaceReferenceRequest } from './workspace-reference-details'
import {
  loadWorkspaceReferenceDetails,
  useWorkspaceReferenceDetailCache
} from './workspace-reference-detail-cache'

type Registration = { workspaceId: string; requests: readonly WorkspaceReferenceRequest[] }

export const workspaceReferenceRefreshRequests = create<{
  registrations: ReadonlyMap<symbol, Registration>
}>(() => ({ registrations: new Map() }))

export function registerWorkspaceReferenceRefreshRequests(
  workspaceId: string,
  requests: readonly WorkspaceReferenceRequest[]
): () => void {
  if (requests.length === 0) {
    return () => {}
  }
  const id = Symbol()
  workspaceReferenceRefreshRequests.setState((state) => ({
    registrations: new Map(state.registrations).set(id, { workspaceId, requests })
  }))
  return () => {
    workspaceReferenceRefreshRequests.setState((state) => {
      const registrations = new Map(state.registrations)
      registrations.delete(id)
      return { registrations }
    })
  }
}

export function createWorkspaceReferenceRefreshTargets() {
  const controllers = new Map<string, AbortController>()
  return {
    update(
      state: Pick<AppState, 'visibleReviewWorktreeIds' | 'activeWorktreeId'> &
        Partial<Pick<AppState, 'sshConnectionStates'>>,
      options: { visible: boolean; selectedOnly: boolean }
    ): VisibleHostedReviewRefreshTarget[] {
      const visible = new Set(options.visible ? (state.visibleReviewWorktreeIds ?? []) : [])
      const targets = new Map<string, VisibleHostedReviewRefreshTarget>()
      for (const { workspaceId, requests } of workspaceReferenceRefreshRequests
        .getState()
        .registrations.values()) {
        const selected = workspaceId === state.activeWorktreeId
        if (!visible.has(workspaceId) || (options.selectedOnly && !selected)) {
          continue
        }
        for (const request of requests) {
          const connectionId = request.repo?.connectionId
          if (
            connectionId &&
            state.sshConnectionStates?.get(connectionId)?.status !== 'connected'
          ) {
            continue
          }
          const key = `workspace-reference:${request.key}`
          if (targets.get(key)?.selected) {
            continue
          }
          const controller = controllers.get(key) ?? new AbortController()
          controllers.set(key, controller)
          const entry = useWorkspaceReferenceDetailCache.getState().entries[request.key]
          const review = entry?.data?.review
          targets.set(key, {
            key,
            revision: request.key,
            selected,
            fetchedAt: entry?.fetchedAt ?? null,
            intervalMs: reviewRefreshIntervalMs({
              state: review?.state,
              checksStatus: review?.status,
              hasReview: review ? true : null,
              selected
            }),
            refresh: async () => {
              await loadWorkspaceReferenceDetails(
                { ...request, admissionTier: selected ? 'interactive' : 'background' },
                controller.signal
              )
              const latest = useWorkspaceReferenceDetailCache.getState().entries[request.key]
              return !controller.signal.aborted && Boolean(latest && !latest.data?.stale)
            }
          })
        }
      }
      for (const [key, controller] of controllers) {
        if (!targets.has(key)) {
          controller.abort()
          controllers.delete(key)
        }
      }
      return [...targets.values()]
    },
    dispose(): void {
      for (const controller of controllers.values()) {
        controller.abort()
      }
      controllers.clear()
    }
  }
}
