import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { isWindowVisible } from '@/lib/window-visibility-interval'
import { isWebClientLocation } from '@/lib/web-client-location'
import { createVisibleHostedReviewRefreshScheduler } from '@/store/github/visible-hosted-review-refresh-scheduler'
import {
  createWorkspaceReferenceRefreshTargets,
  workspaceReferenceRefreshRequests
} from '@/components/sidebar/workspace-reference-refresh-targets'
import { useWorkspaceReferenceDetailCache } from '@/components/sidebar/workspace-reference-detail-cache'
import {
  getVisibleHostedReviewRefreshTargets,
  visibleHostedReviewRefreshInputsChanged
} from '@/store/github/visible-hosted-review-refresh-targets'

export function useVisibleHostedReviewRefresh({ enabled }: { enabled: boolean }): void {
  useEffect(() => {
    if (!enabled) {
      return
    }
    const scheduler = createVisibleHostedReviewRefreshScheduler()
    const references = createWorkspaceReferenceRefreshTargets()
    const update = (): void => {
      const state = useAppStore.getState()
      const selectedOnly = isWebClientLocation()
      scheduler.update([
        ...getVisibleHostedReviewRefreshTargets(state, useAppStore.getState, { selectedOnly }),
        ...references.update(state, { visible: isWindowVisible(), selectedOnly })
      ])
    }
    const visibilityChanged = (): void => {
      scheduler.setVisible(false)
      update()
      scheduler.setVisible(isWindowVisible())
    }
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (visibleHostedReviewRefreshInputsChanged(state, previous)) {
        update()
      }
    })
    const unsubscribeReferences = workspaceReferenceRefreshRequests.subscribe(update)
    const unsubscribeDetails = useWorkspaceReferenceDetailCache.subscribe(update)
    update()
    visibilityChanged()
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      unsubscribe()
      unsubscribeReferences()
      unsubscribeDetails()
      document.removeEventListener('visibilitychange', visibilityChanged)
      scheduler.dispose()
      references.dispose()
    }
  }, [enabled])
}
