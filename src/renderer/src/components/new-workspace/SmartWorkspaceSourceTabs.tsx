import React from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SmartWorkspaceNameFieldController } from './use-smart-workspace-name-field-controller'

export function SmartWorkspaceSourceTabs({
  controller
}: {
  controller: Pick<
    SmartWorkspaceNameFieldController,
    | 'textOnly'
    | 'mode'
    | 'onActiveSourceModeChange'
    | 'setMode'
    | 'disabled'
    | 'selectedSource'
    | 'markSourcePopoverUserEngaged'
    | 'setOpen'
    | 'cancelLocalInputFocusFrame'
    | 'localInputFocusFrameRef'
    | 'localInputRef'
    | 'tabsListRef'
    | 'availableModes'
  >
}): React.JSX.Element | null {
  const {
    textOnly,
    mode,
    onActiveSourceModeChange,
    setMode,
    disabled,
    selectedSource,
    markSourcePopoverUserEngaged,
    setOpen,
    cancelLocalInputFocusFrame,
    localInputFocusFrameRef,
    localInputRef,
    tabsListRef,
    availableModes
  } = controller
  return (
    <>
      {textOnly ? null : (
        <div className="flex min-w-0 items-center gap-2 border-b border-border/40">
          <Tabs
            value={mode}
            onValueChange={(next) => {
              const nextMode = availableModes.find((item) => item.id === next)?.id
              if (!nextMode) {
                return
              }
              onActiveSourceModeChange?.(nextMode)
              setMode(nextMode)
              if (!disabled && nextMode !== 'text' && selectedSource === null) {
                markSourcePopoverUserEngaged()
                setOpen(true)
              } else {
                setOpen(false)
              }
              cancelLocalInputFocusFrame()
              localInputFocusFrameRef.current = requestAnimationFrame(() => {
                localInputFocusFrameRef.current = null
                localInputRef.current?.focus({ preventScroll: true })
              })
            }}
            className="min-w-0 flex-1 gap-0"
          >
            <TabsList
              ref={tabsListRef}
              variant="line"
              className="h-7 w-full justify-start gap-4 overflow-x-auto overflow-y-hidden px-0 scrollbar-sleek"
              onFocusCapture={(event) => {
                // Why: Radix roving focus races commits, so forward external Tab focus to the input.
                const previous =
                  event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null
                const list = tabsListRef.current
                const input = localInputRef.current
                if (!list || !input) {
                  return
                }
                if (!previous || previous === input || list.contains(previous)) {
                  return
                }
                event.stopPropagation()
                input.focus({ preventScroll: true })
              }}
            >
              {availableModes.map(({ id, label, Icon }) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  tabIndex={-1}
                  data-smart-name-mode={id}
                  className="flex-none gap-1.5 px-0 text-xs"
                >
                  <Icon className="size-3.5" />
                  <span>{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}
    </>
  )
}
