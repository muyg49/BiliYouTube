export interface HomepageShellBridge {
  destroy: () => void
}

export function installHomepageShell(container: HTMLElement): HomepageShellBridge {
  const shell = container.querySelector<HTMLElement>('.app-shell')
  const menu = container.querySelector<HTMLButtonElement>('.menu-button')

  if (!shell || !menu)
    return { destroy() {} }

  let collapsed = false

  const applyState = () => {
    container.classList.toggle('byt-sidebar-collapsed', collapsed)
    shell.classList.toggle('byt-sidebar-collapsed', collapsed)
    menu.setAttribute('aria-expanded', String(!collapsed))
    menu.setAttribute('aria-label', collapsed ? '展开菜单' : '收起菜单')
    menu.title = collapsed ? '展开菜单' : '收起菜单'
  }

  const onClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    collapsed = !collapsed
    applyState()
  }

  menu.addEventListener('click', onClick)
  applyState()

  return {
    destroy() {
      menu.removeEventListener('click', onClick)
      container.classList.remove('byt-sidebar-collapsed')
      shell.classList.remove('byt-sidebar-collapsed')
    },
  }
}
