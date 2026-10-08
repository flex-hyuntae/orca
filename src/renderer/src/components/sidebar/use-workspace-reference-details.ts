import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { installWindowVisibilityInterval, isWindowVisible } from '@/lib/window-visibility-interval'
import { isMacAppDataPath } from '@/lib/passive-macos-app-data-access'
import { useIsSleepingWorktree } from './use-worktree-sleep-state'
import { HOSTED_REVIEW_CARD_REFRESH_INTERVAL_MS } from './worktree-card-model'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import {
  getWorkspaceAttachments,
  getWorkspaceAttachmentKey
} from '../../../../shared/workspace-attachments'
import type { WorktreeCardPrDisplay } from './worktree-card-pr-display'
import { canReadWorkspaceReferenceReview } from './workspace-reference-review-source'
import {
  getWorkspaceReferenceRequest,
  getWorkspaceReferenceRuntimeVersion,
  matchWorkspaceReferenceReview,
  type WorkspaceReferenceDetailsMap
} from './workspace-reference-details'
import {
  loadWorkspaceReferenceDetails,
  useWorkspaceReferenceDetailCache
} from './workspace-reference-detail-cache'

export function useWorkspaceReferenceDetails(
  workspace: Worktree,
  repo: Repo | undefined,
  review: WorktreeCardPrDisplay | null,
  hoverOpen: boolean,
  refreshReviews = true
): WorkspaceReferenceDetailsMap {
  const sleeping = useIsSleepingWorktree(workspace.id)
  const items = useMemo(() => getWorkspaceAttachments(workspace), [workspace])
  const runtimeVersion = getWorkspaceReferenceRuntimeVersion(workspace, repo)
  const requests = useMemo(
    () =>
      items.map((item) => ({
        ...getWorkspaceReferenceRequest(item, workspace, repo, runtimeVersion),
        knownProvider: review?.state ? review.provider : undefined
      })),
    [workspace, repo, items, runtimeVersion, review?.state, review?.provider]
  )
  const entries = useWorkspaceReferenceDetailCache(
    useShallow((state) => requests.map((request) => state.entries[request.key]))
  )
  useEffect(() => {
    if (
      !refreshReviews ||
      sleeping ||
      workspace.isArchived ||
      workspace.isBare ||
      !repo ||
      isMacAppDataPath(repo.path)
    ) {
      return
    }
    let controller = new AbortController()
    const cancelHiddenDemand = (): void => {
      if (!isWindowVisible()) {
        controller.abort()
      }
    }
    document.addEventListener('visibilitychange', cancelHiddenDemand)
    const stop = installWindowVisibilityInterval({
      run: () => {
        if (!isWindowVisible()) {
          return
        }
        if (controller.signal.aborted) {
          controller = new AbortController()
        }
        for (const request of requests) {
          if (
            request.item.type !== 'issue' &&
            canReadWorkspaceReferenceReview(request, request.knownProvider)
          ) {
            void loadWorkspaceReferenceDetails(
              { ...request, admissionTier: 'background' },
              controller.signal
            )
          }
        }
      },
      intervalMs: HOSTED_REVIEW_CARD_REFRESH_INTERVAL_MS,
      jitterOnVisible: true
    })
    return () => {
      stop()
      controller.abort()
      document.removeEventListener('visibilitychange', cancelHiddenDemand)
    }
  }, [requests, refreshReviews, sleeping, workspace.isArchived, workspace.isBare, repo])
  useEffect(() => {
    if (!hoverOpen) {
      return
    }
    const controller = new AbortController()
    for (const request of requests) {
      if (
        request.item.type !== 'issue' &&
        !canReadWorkspaceReferenceReview(request, request.knownProvider)
      ) {
        continue
      }
      if (
        review?.state &&
        matchWorkspaceReferenceReview(request.item, review) &&
        canReadWorkspaceReferenceReview(request, review.provider)
      ) {
        continue
      }
      void loadWorkspaceReferenceDetails(request, controller.signal)
    }
    return () => controller.abort()
  }, [requests, hoverOpen, review, repo, workspace.hostId])
  const matching = requests.filter(
    (request) =>
      matchWorkspaceReferenceReview(request.item, review) &&
      canReadWorkspaceReferenceReview(request, review?.provider)
  )
  return Object.fromEntries(
    requests.map((request, index) => {
      const { item } = request
      if (
        item.type !== 'issue' &&
        !canReadWorkspaceReferenceReview(request, request.knownProvider)
      ) {
        return [getWorkspaceAttachmentKey(item), undefined]
      }
      const primary =
        review?.url && review.state && matching.length === 1 && matching[0].item === item
          ? { title: review.title, url: review.url, review, stale: true }
          : undefined
      return [
        getWorkspaceAttachmentKey(item),
        entries[index] ? (entries[index].data ?? undefined) : primary
      ]
    })
  )
}
