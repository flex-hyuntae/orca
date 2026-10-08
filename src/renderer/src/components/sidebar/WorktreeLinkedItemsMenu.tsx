import { translate } from '@/i18n/i18n'
import React from 'react'
import { ExternalLink, GitPullRequest, Link2, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { Worktree } from '../../../../shared/worktree/types'
import {
  getWorkspaceAttachmentKey,
  getWorkspaceAttachments
} from '../../../../shared/workspace-attachments'
import {
  workspaceAttachmentLabel,
  workspaceAttachmentProviderLabel
} from './worktree-attachment-editing'

export function WorktreeLinkedItemsMenu({
  worktree,
  onManage
}: {
  worktree: Worktree
  onManage: (event: React.MouseEvent) => void
}): React.JSX.Element | null {
  const items = getWorkspaceAttachments(worktree)
  if (items.length <= 1) {
    return null
  }
  const groups = [
    {
      label: translate('workspace.links.reviews', 'Reviews'),
      items: items.filter((item) => item.type !== 'issue')
    },
    {
      label: translate('workspace.links.tasks', 'Issues & tasks'),
      items: items.filter((item) => item.type === 'issue')
    }
  ].filter((group) => group.items.length > 0)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          aria-label={translate('workspace.links.show', 'Show {{count}} linked reviews and tasks', {
            count: items.length
          })}
          onClick={(event) => event.stopPropagation()}
        >
          <Link2 className="size-3" />
          {translate('workspace.links.count', '{{count}} linked', { count: items.length })}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-w-80"
        onClick={(event) => event.stopPropagation()}
      >
        {groups.map((group) => (
          <React.Fragment key={group.label}>
            <DropdownMenuLabel>
              {group.label} · {group.items.length}
            </DropdownMenuLabel>
            {group.items.map((item) => (
              <DropdownMenuItem
                key={getWorkspaceAttachmentKey(item)}
                onClick={item.url ? undefined : onManage}
                onSelect={() => {
                  if (item.url) {
                    void window.api.shell.openUrl(item.url)
                  }
                }}
              >
                {item.type === 'issue' ? <Ticket /> : <GitPullRequest />}
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {workspaceAttachmentLabel(item)}{' '}
                    <span className="text-muted-foreground">
                      {workspaceAttachmentProviderLabel(item)}
                    </span>
                  </p>
                  {item.title ? (
                    <p className="truncate text-xs text-muted-foreground">{item.title}</p>
                  ) : null}
                </div>
                {item.url ? <ExternalLink className="size-3" /> : null}
              </DropdownMenuItem>
            ))}
          </React.Fragment>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onManage}>
          <Link2 />
          {translate('workspace.links.manage', 'Manage links…')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
