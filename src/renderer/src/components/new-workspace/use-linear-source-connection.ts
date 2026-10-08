import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { linearStatus } from '@/runtime/runtime-linear-client'
import {
  getTaskSourceCacheScope,
  type TaskSourceContext
} from '../../../../shared/task-source-context'
import type { LinearConnectionStatus } from '../../../../shared/linear/workspace-types'

type LinearSourceConnection = {
  status: LinearConnectionStatus | null
  loaded: boolean
}

const UNLOADED_CONNECTION: LinearSourceConnection = { status: null, loaded: false }

export function useLinearSourceConnection(args: {
  enabled: boolean
  sourceContext: TaskSourceContext | null
}): LinearSourceConnection {
  const scope = args.sourceContext ? getTaskSourceCacheScope(args.sourceContext) : null
  const sourceRef = useRef(args.sourceContext)
  useLayoutEffect(() => {
    sourceRef.current = args.sourceContext
  })
  const [state, setState] = useState<{
    scope: string | null
    status: LinearConnectionStatus | null
  }>({ scope: null, status: null })

  useEffect(() => {
    const source = sourceRef.current
    if (!args.enabled || !source || !scope) {
      return
    }
    let stale = false
    void linearStatus(source)
      .then((status) => {
        if (!stale) {
          setState({ scope, status })
        }
      })
      .catch(() => {
        if (!stale) {
          setState({ scope, status: { connected: false, viewer: null } })
        }
      })
    return () => {
      stale = true
    }
  }, [args.enabled, scope])

  return useMemo(
    () =>
      scope !== null && state.scope === scope
        ? { status: state.status, loaded: true }
        : UNLOADED_CONNECTION,
    [scope, state]
  )
}
