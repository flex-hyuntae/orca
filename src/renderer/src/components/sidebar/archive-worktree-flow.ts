import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { translate } from '@/i18n/i18n'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import type { Worktree } from '../../../../shared/worktree/types'
import { runSleepWorktrees } from './sleep-worktree-flow'
import { prepareActiveWorktreeFocusAfterDelete } from './active-worktree-focus-after-delete'

// Why: the primary checkout stands in for the project row, and folder-workspace
// lanes do not filter archived rows yet, so hiding either would misbehave.
export function isArchivableWorktree(worktree: Worktree): boolean {
  return (
    !worktree.isArchived &&
    !worktree.isMainWorktree &&
    parseWorkspaceKey(worktree.id)?.type !== 'folder'
  )
}

async function setWorktreesArchived(
  worktreeIds: readonly string[],
  isArchived: boolean
): Promise<string[]> {
  const { updateWorktreeMeta } = useAppStore.getState()
  const results = await Promise.all(
    worktreeIds.map(async (id) => ({ id, result: await updateWorktreeMeta(id, { isArchived }) }))
  )
  return results.filter(({ result }) => result.ok).map(({ id }) => id)
}

/**
 * Archive = sleep (release PTYs/browsers, keep tab records) + hide from the
 * sidebar. Unlike delete, the worktree and branch stay on disk.
 */
export async function runArchiveWorktrees(worktreeIds: readonly string[]): Promise<void> {
  if (worktreeIds.length === 0) {
    return
  }
  const { activeWorktreeId } = useAppStore.getState()
  const commitFocus =
    activeWorktreeId && worktreeIds.includes(activeWorktreeId)
      ? prepareActiveWorktreeFocusAfterDelete(activeWorktreeId)
      : null
  const failedSleepIds = await runSleepWorktrees(worktreeIds)
  const archivedIds = await setWorktreesArchived(
    worktreeIds.filter((id) => !failedSleepIds.has(id)),
    true
  )
  commitFocus?.()
  if (archivedIds.length === 0) {
    if (failedSleepIds.size === 0) {
      toast.error(
        translate(
          'auto.components.sidebar.archive.worktree.flow.failed',
          'Failed to archive workspace'
        )
      )
    }
    return
  }
  toast.success(
    archivedIds.length === 1
      ? translate('auto.components.sidebar.archive.worktree.flow.archivedOne', 'Workspace archived')
      : translate(
          'auto.components.sidebar.archive.worktree.flow.archivedMany',
          '{{value0}} workspaces archived',
          { value0: archivedIds.length }
        ),
    {
      description: translate(
        'auto.components.sidebar.archive.worktree.flow.restoreHint',
        'Restore it from Workspace options → Archived.'
      ),
      action: {
        label: translate('auto.components.sidebar.archive.worktree.flow.undo', 'Undo'),
        onClick: () => {
          void setWorktreesArchived(archivedIds, false)
        }
      }
    }
  )
}

export async function runRestoreArchivedWorktree(worktreeId: string): Promise<void> {
  const [restoredId] = await setWorktreesArchived([worktreeId], false)
  if (!restoredId) {
    toast.error(
      translate(
        'auto.components.sidebar.archive.worktree.flow.restoreFailed',
        'Failed to restore workspace'
      )
    )
    return
  }
  activateAndRevealWorktree(restoredId, { navigationIntent: 'user-open' })
}
