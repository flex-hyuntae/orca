import type { WorktreeMeta } from '../../../../../../shared/worktree/meta-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import {
  getWorkspaceAttachments,
  normalizeWorkspaceAttachmentUpdate
} from '../../../../../../shared/workspace-attachments'

export function rebaseWorkspaceAttachmentUpdate(
  snapshot: Worktree | undefined,
  current: Worktree | undefined,
  updates: Partial<WorktreeMeta>,
  selectionChanged = true
): Partial<WorktreeMeta> {
  if (snapshot === current) {
    return updates
  }
  if (updates.linkedItems === undefined) {
    return normalizeWorkspaceAttachmentUpdate(current, updates)
  }
  return normalizeWorkspaceAttachmentUpdate(current, {
    ...updates,
    linkedItemsBase: getWorkspaceAttachments(snapshot),
    linkedItemsSelectionChanged: selectionChanged
  })
}
