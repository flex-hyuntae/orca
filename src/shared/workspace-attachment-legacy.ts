import type { WorktreeMeta } from './worktree/meta-types'
import type { WorkspaceAttachment } from './worktree/types'
import {
  normalizeWorkspaceAttachment,
  normalizeWorkspaceAttachments
} from './workspace-attachment-normalization'

export type WorkspaceAttachmentMetadata = Partial<
  Pick<
    WorktreeMeta,
    | 'linkedItems'
    | 'linkedIssue'
    | 'linkedPR'
    | 'linkedGitLabMR'
    | 'linkedGitLabIssue'
    | 'linkedBitbucketPR'
    | 'linkedAzureDevOpsPR'
    | 'linkedGiteaPR'
    | 'linkedLinearIssue'
    | 'linkedLinearIssueWorkspaceId'
    | 'linkedLinearIssueOrganizationUrlKey'
    | 'linkedWorkItem'
    | 'linkedTaskSourceContext'
    | 'pushTarget'
  >
>

export const WORKSPACE_ATTACHMENT_NUMBER_SLOTS = [
  ['linkedIssue', 'github', 'issue'],
  ['linkedPR', 'github', 'pr'],
  ['linkedGitLabMR', 'gitlab', 'mr'],
  ['linkedGitLabIssue', 'gitlab', 'issue'],
  ['linkedBitbucketPR', 'bitbucket', 'pr'],
  ['linkedAzureDevOpsPR', 'azure-devops', 'pr'],
  ['linkedGiteaPR', 'gitea', 'pr']
] as const

export function legacyWorkspaceAttachments(
  meta: WorkspaceAttachmentMetadata
): WorkspaceAttachment[] {
  const items: WorkspaceAttachment[] = []
  // Rich identities carry the task source before their compatibility slots are folded in.
  if (meta.linkedWorkItem) {
    const item = normalizeWorkspaceAttachment({
      ...meta.linkedWorkItem,
      taskSourceContext: meta.linkedTaskSourceContext,
      ...(meta.linkedWorkItem.provider === 'linear'
        ? {
            linearWorkspaceId: meta.linkedLinearIssueWorkspaceId,
            linearOrganizationUrlKey: meta.linkedLinearIssueOrganizationUrlKey
          }
        : {})
    })
    if (item) {
      items.push(item)
    }
  }
  for (const [slot, provider, type] of WORKSPACE_ATTACHMENT_NUMBER_SLOTS) {
    const number = meta[slot]
    if (typeof number === 'number' && Number.isSafeInteger(number) && number > 0) {
      items.push({ provider, type, number })
    }
  }
  if (meta.linkedLinearIssue?.trim()) {
    items.push({
      provider: 'linear',
      type: 'issue',
      number: 0,
      identifier: meta.linkedLinearIssue ?? undefined,
      linearIdentifier: meta.linkedLinearIssue ?? undefined,
      linearWorkspaceId: meta.linkedLinearIssueWorkspaceId ?? undefined,
      linearOrganizationUrlKey: meta.linkedLinearIssueOrganizationUrlKey ?? undefined
    })
  }
  return normalizeWorkspaceAttachments(items)
}
