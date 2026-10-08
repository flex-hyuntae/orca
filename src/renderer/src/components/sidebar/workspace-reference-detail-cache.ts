import { create } from 'zustand'
import { PrioritySemaphore } from '../../../../shared/priority-semaphore'
import { withTimeout } from '../../../../shared/promise-timeout-fallback'
import { readWorkspaceReferenceDetails } from './workspace-reference-detail-read'
import type {
  WorkspaceReferenceDetails,
  WorkspaceReferenceRequest
} from './workspace-reference-details'

type Entry = { data: WorkspaceReferenceDetails | null; fetchedAt: number }
type PendingRead = {
  promise: Promise<void>
  controller: AbortController
  demands: Map<AbortSignal, () => void>
  persistent: boolean
  started: boolean
}
export const useWorkspaceReferenceDetailCache = create<{
  entries: Readonly<Record<string, Entry | undefined>>
}>(() => ({ entries: {} }))
const pending = new Map<string, PendingRead>()
const TTL = 60_000
const reads = new PrioritySemaphore(3)

function registerDemand(entry: PendingRead, signal?: AbortSignal): void {
  if (!signal) {
    entry.persistent = true
    return
  }
  if (entry.demands.has(signal)) {
    return
  }
  const abort = (): void => {
    entry.demands.delete(signal)
    if (!entry.persistent && entry.demands.size === 0 && !entry.started) {
      entry.controller.abort()
    }
  }
  entry.demands.set(signal, abort)
  signal.addEventListener('abort', abort, { once: true })
}

export function loadWorkspaceReferenceDetails(
  request: WorkspaceReferenceRequest,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    return Promise.resolve()
  }
  const cached = useWorkspaceReferenceDetailCache.getState().entries[request.key]
  if (cached && Date.now() - cached.fetchedAt < TTL) {
    return Promise.resolve()
  }
  const cachedData = cached?.data
  if (cached && cachedData && !cachedData.stale) {
    useWorkspaceReferenceDetailCache.setState((state) => ({
      entries: {
        ...state.entries,
        [request.key]: { ...cached, data: { ...cachedData, stale: true } }
      }
    }))
  }
  const existing = pending.get(request.key)
  if (existing && !existing.controller.signal.aborted) {
    registerDemand(existing, signal)
    return existing.promise
  }
  const entry: PendingRead = {
    promise: Promise.resolve(),
    controller: new AbortController(),
    demands: new Map(),
    persistent: false,
    started: false
  }
  registerDemand(entry, signal)
  const providerRead = reads
    .acquire(request.admissionTier === 'background' ? 1 : 0, entry.controller.signal)
    .then(async (release) => {
      try {
        if (entry.controller.signal.aborted) {
          return null
        }
        entry.started = true
        return await readWorkspaceReferenceDetails(request)
      } finally {
        // Native reads retain their concurrency slot even after the presentation deadline.
        release()
      }
    })
  entry.promise = withTimeout(
    providerRead,
    30_000,
    cached?.data ? { ...cached.data, stale: true } : null
  )
    .then((data) => {
      if (!entry.started) {
        entry.controller.abort()
      }
      if (entry.controller.signal.aborted) {
        return
      }
      useWorkspaceReferenceDetailCache.setState((state) => {
        const entries = { ...state.entries, [request.key]: { data, fetchedAt: Date.now() } }
        const keys = Object.keys(entries)
          .sort((a, b) => (entries[b]?.fetchedAt ?? 0) - (entries[a]?.fetchedAt ?? 0))
          .slice(0, 500)
        return { entries: Object.fromEntries(keys.map((key) => [key, entries[key]])) }
      })
    })
    .finally(() => {
      for (const [demand, abort] of entry.demands) {
        demand.removeEventListener('abort', abort)
      }
      if (pending.get(request.key) === entry) {
        pending.delete(request.key)
      }
    })
  pending.set(request.key, entry)
  return entry.promise
}
