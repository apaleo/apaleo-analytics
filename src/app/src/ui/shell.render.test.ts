import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from '../App.tsx'

describe('analytics shell markup', () => {
  const html = renderToStaticMarkup(createElement(App))

  it('opens on Aging Work In Progress with the example dataset loaded', () => {
    expect(html).toContain('data-theme="light"')
    expect(html).toContain('--aa-accent:#284907')
    expect(html).toContain('apaleo')
    expect(html).not.toContain('Français')
    expect(html).toContain('Aging Work In Progress')
    expect(html).toContain('data-chart="aging-wip"')
    expect(html).toContain('Age counts days since the item entered the first workflow stage.')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('Example Data')
    expect(html).toContain('>Data<')
    expect(html).toContain('>Export<')
    expect(html).toContain('>Settings<')
    expect(html).not.toContain('>Info<')
    expect(html.match(/class="chart-nav__item/g)).toHaveLength(13)
  })

  it('shows attribute choices and workflow stage toggles for the example sheet', () => {
    expect(html).toContain('Type')
    expect(html).toContain('Team')
    expect(html).toContain('Class of Service')
    expect(html).toContain('Feature')
    expect(html).toContain('Backlog')
    expect(html).toContain('In Progress')
    expect(html).toContain('>15<')
    expect(html).not.toContain('Blocked Days')
  })
})
