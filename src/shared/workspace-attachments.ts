import {
  WORKSPACE_ATTACHMENT_NUMBER_SLOTS,
  legacyWorkspaceAttachments,
  type WorkspaceAttachmentMetadata
} from './workspace-attachment-legacy'
export type { WorkspaceAttachmentMetadata } from './workspace-attachment-legacy'
import { removeSelectedWorkspaceAttachments } from './workspace-attachment-removal'
import type { WorktreeMeta } from './worktree/meta-types'
import type { WorkspaceAttachment } from './worktree/types'
import {
  mergeWorkspaceAttachmentMutation,
  type WorkspaceAttachmentMutation
} from './workspace-attachment-mutation'
import {
  normalizeWorkspaceAttachments,
  toWorkspaceLinkedItem,
  matchesWorkspaceAttachmentIdentity
} from './workspace-attachment-normalization'
export {
  normalizeWorkspaceAttachment,
  normalizeWorkspaceAttachments,
  toWorkspaceLinkedItem,
  getWorkspaceAttachmentKey,
  getWorkspaceAttachmentUrlScope
} from './workspace-attachment-normalization'

export function getWorkspaceAttachments(
  meta: WorkspaceAttachmentMetadata | null | undefined
): WorkspaceAttachment[] {
  if (!meta) {
    return []
  }
  const items = normalizeWorkspaceAttachments(meta.linkedItems)
  for (const legacy of legacyWorkspaceAttachments(meta)) {
    if (!items.some((item) => matchesWorkspaceAttachmentIdentity(item, legacy))) {
      items.push(legacy)
    }
  }
  return items
}

function synchronizeSelection(
  meta: WorkspaceAttachmentMetadata,
  items: WorkspaceAttachment[],
  updates: WorkspaceAttachmentMetadata
): WorkspaceAttachmentMetadata {
  const result: WorkspaceAttachmentMetadata = { linkedItems: items }
  const reviews = items.filter((item) => item.type !== 'issue')
  const selectionCleared = WORKSPACE_ATTACHMENT_NUMBER_SLOTS.filter(
    ([, , type]) => type !== 'issue'
  ).every(([slot]) => updates[slot] === null)
  const selectedReview = selectionCleared
    ? undefined
    : (reviews.find((item) =>
        WORKSPACE_ATTACHMENT_NUMBER_SLOTS.some(
          ([slot, provider, type]) =>
            type !== 'issue' &&
            item.provider === provider &&
            item.type === type &&
            updates[slot] === item.number
        )
      ) ??
      reviews.find((item) =>
        WORKSPACE_ATTACHMENT_NUMBER_SLOTS.some(
          ([slot, provider, type]) =>
            type !== 'issue' &&
            item.provider === provider &&
            item.type === type &&
            meta[slot] === item.number
        )
      ) ??
      reviews[0])
  for (const [slot, provider, type] of WORKSPACE_ATTACHMENT_NUMBER_SLOTS) {
    const selected =
      type !== 'issue'
        ? selectedReview
        : (items.find(
            (item) => item.provider === provider && item.type === type && item.number === meta[slot]
          ) ?? items.find((item) => item.provider === provider && item.type === type))
    result[slot] =
      selected?.provider === provider && selected.type === type ? selected.number : null
  }
  const linear =
    items.find(
      (item) =>
        item.provider === 'linear' &&
        (item.identifier ?? item.linearIdentifier) === meta.linkedLinearIssue
    ) ?? items.find((item) => item.provider === 'linear')
  result.linkedLinearIssue = linear?.identifier ?? linear?.linearIdentifier ?? null
  result.linkedLinearIssueWorkspaceId = linear?.linearWorkspaceId ?? null
  result.linkedLinearIssueOrganizationUrlKey = linear?.linearOrganizationUrlKey ?? null
  const previous = legacyWorkspaceAttachments({
    linkedWorkItem: meta.linkedWorkItem,
    linkedTaskSourceContext: meta.linkedTaskSourceContext
  })[0]
  const rich =
    (previous && items.find((item) => matchesWorkspaceAttachmentIdentity(item, previous))) ??
    items.find((item) => item.type === 'issue' && toWorkspaceLinkedItem(item))
  result.linkedWorkItem = toWorkspaceLinkedItem(rich)
  result.linkedTaskSourceContext = rich?.taskSourceContext ?? null
  return result
}

export function normalizeWorkspaceAttachmentUpdate(
  existing: WorkspaceAttachmentMetadata | undefined,
  updates: Partial<WorktreeMeta> & WorkspaceAttachmentMutation
): WorkspaceAttachmentMetadata {
  if (updates.linkedItemsBase !== undefined && updates.linkedItems !== undefined) {
    const { linkedItemsBase, linkedItemsSelectionChanged, ...mutationUpdates } = updates
    const reviewSlots = new Set<string>(
      WORKSPACE_ATTACHMENT_NUMBER_SLOTS.filter(([, , type]) => type !== 'issue').map(
        ([slot]) => slot
      )
    )
    const requested =
      linkedItemsSelectionChanged === false
        ? Object.fromEntries(
            Object.entries(mutationUpdates).filter(([key]) => !reviewSlots.has(key))
          )
        : mutationUpdates
    const normalized = normalizeWorkspaceAttachmentUpdate(existing, {
      ...requested,
      linkedItems: mergeWorkspaceAttachmentMutation(
        linkedItemsBase,
        getWorkspaceAttachments(existing),
        updates.linkedItems
      )
    })
    if (
      linkedItemsSelectionChanged === false &&
      Object.hasOwn(mutationUpdates, 'pushTarget') &&
      WORKSPACE_ATTACHMENT_NUMBER_SLOTS.some(
        ([slot, , type]) =>
          type !== 'issue' && (normalized[slot] ?? null) !== (mutationUpdates[slot] ?? null)
      )
    ) {
      normalized.pushTarget = existing?.pushTarget
    }
    return normalized
  }
  if (
    !Object.entries(updates).some(([key, value]) => key.startsWith('linked') && value !== undefined)
  ) {
    return updates
  }
  const merged = {
    ...existing,
    ...Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined))
  }
  if (updates.linkedItems !== undefined) {
    return {
      ...updates,
      ...synchronizeSelection(merged, normalizeWorkspaceAttachments(updates.linkedItems), updates)
    }
  }
  let items = getWorkspaceAttachments(existing)
  const selectedTask = legacyWorkspaceAttachments({
    linkedWorkItem: existing?.linkedWorkItem,
    linkedTaskSourceContext: existing?.linkedTaskSourceContext
  })[0]
  for (const [slot] of WORKSPACE_ATTACHMENT_NUMBER_SLOTS) {
    if (updates[slot] === null) {
      items = removeSelectedWorkspaceAttachments(
        items,
        legacyWorkspaceAttachments({ [slot]: existing?.[slot] }),
        selectedTask
      )
    }
  }
  if (updates.linkedLinearIssue === null || updates.linkedWorkItem === null) {
    const removed = legacyWorkspaceAttachments({
      ...(updates.linkedLinearIssue === null
        ? {
            linkedLinearIssue: existing?.linkedLinearIssue,
            linkedLinearIssueWorkspaceId: existing?.linkedLinearIssueWorkspaceId,
            linkedLinearIssueOrganizationUrlKey: existing?.linkedLinearIssueOrganizationUrlKey
          }
        : {}),
      ...(updates.linkedWorkItem === null
        ? {
            linkedWorkItem: existing?.linkedWorkItem,
            linkedTaskSourceContext: existing?.linkedTaskSourceContext
          }
        : {})
    })
    items = removeSelectedWorkspaceAttachments(items, removed, selectedTask)
  }
  // Do not resurrect a removed rich item through its other compatibility slot.
  const additions = legacyWorkspaceAttachments({
    ...updates,
    ...(updates.linkedWorkItem !== undefined
      ? { linkedTaskSourceContext: merged.linkedTaskSourceContext }
      : {}),
    ...(updates.linkedLinearIssue !== undefined
      ? {
          linkedLinearIssueWorkspaceId: merged.linkedLinearIssueWorkspaceId,
          linkedLinearIssueOrganizationUrlKey: merged.linkedLinearIssueOrganizationUrlKey
        }
      : {})
  })
  for (const item of additions) {
    const index = items.findIndex((candidate) =>
      matchesWorkspaceAttachmentIdentity(candidate, item)
    )
    if (index === -1) {
      items.push(item)
    } else {
      items[index] = { ...items[index], ...item }
    }
  }
  const result: WorkspaceAttachmentMetadata = {
    ...updates,
    linkedItems: normalizeWorkspaceAttachments(items)
  }
  const selectedReviewSlot = WORKSPACE_ATTACHMENT_NUMBER_SLOTS.find(
    ([slot, , type]) => type !== 'issue' && typeof updates[slot] === 'number'
  )?.[0]
  if (selectedReviewSlot) {
    for (const [slot, , type] of WORKSPACE_ATTACHMENT_NUMBER_SLOTS) {
      if (type !== 'issue' && slot !== selectedReviewSlot) {
        result[slot] = null
      }
    }
  }
  for (const [slot] of WORKSPACE_ATTACHMENT_NUMBER_SLOTS) {
    if (updates[slot] === undefined && typeof existing?.[slot] === 'number') {
      const previous = legacyWorkspaceAttachments({ [slot]: existing[slot] })[0]
      if (previous && !items.some((item) => matchesWorkspaceAttachmentIdentity(item, previous))) {
        result[slot] = null
      }
    }
  }
  if (updates.linkedWorkItem === undefined && existing?.linkedWorkItem) {
    const previous = legacyWorkspaceAttachments({
      linkedWorkItem: existing.linkedWorkItem,
      linkedTaskSourceContext: existing.linkedTaskSourceContext
    })[0]
    if (previous && !items.some((item) => matchesWorkspaceAttachmentIdentity(item, previous))) {
      result.linkedWorkItem = null
      result.linkedTaskSourceContext = null
    }
  }
  if (updates.linkedLinearIssue === undefined && existing?.linkedLinearIssue) {
    const previous = legacyWorkspaceAttachments({
      linkedLinearIssue: existing.linkedLinearIssue,
      linkedLinearIssueWorkspaceId: existing.linkedLinearIssueWorkspaceId,
      linkedLinearIssueOrganizationUrlKey: existing.linkedLinearIssueOrganizationUrlKey
    })[0]
    if (previous && !items.some((item) => matchesWorkspaceAttachmentIdentity(item, previous))) {
      result.linkedLinearIssue = null
      result.linkedLinearIssueWorkspaceId = null
      result.linkedLinearIssueOrganizationUrlKey = null
    }
  }
  return result
}
