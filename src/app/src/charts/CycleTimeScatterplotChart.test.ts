/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { t } from '../ui/i18n.tsx'
import { cycleTimeTipLines } from './text.ts'
import { onScatterDotClick, openScatterItem, scatterItemUrl } from './scatterLink.ts'

describe('cycle time hover tooltip', () => {
  it('lists total age and each included stage, with singular only for 1', () => {
    expect(
      cycleTimeTipLines(
        9,
        [
          { stageIndex: 1, name: 'Planned', days: 2 },
          { stageIndex: 2, name: 'In Progress', days: 5 },
          { stageIndex: 3, name: 'In Review', days: 1 },
          { stageIndex: 4, name: 'Merged', days: 1 },
        ],
        t,
      ),
    ).toEqual([
      'Total Age: 9 days',
      'Planned: 2 days',
      'In Progress: 5 days',
      'In Review: 1 day',
      'Merged: 1 day',
    ])
    expect(cycleTimeTipLines(0, [{ stageIndex: 0, name: 'Ready', days: 0 }], t)).toEqual([
      'Total Age: 0 days',
      'Ready: 0 days',
    ])
  })
})

describe('scatter item link', () => {
  it('keeps an http(s) link and drops anything else', () => {
    expect(scatterItemUrl('https://linear.app/acme/issue/ENG-1')).toBe('https://linear.app/acme/issue/ENG-1')
    expect(scatterItemUrl('http://linear.app/acme/issue/ENG-1')).toBe('http://linear.app/acme/issue/ENG-1')
    expect(scatterItemUrl(undefined)).toBeUndefined()
    expect(scatterItemUrl('javascript:alert(1)')).toBeUndefined()
    expect(scatterItemUrl('ENG-1')).toBeUndefined()
  })

  it('opens the stored link in a new tab and ignores a missing link', () => {
    const open = vi.fn()
    openScatterItem('https://linear.app/acme/issue/ENG-1', open)
    openScatterItem(undefined, open)
    openScatterItem('not a url', open)
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('https://linear.app/acme/issue/ENG-1', '_blank', 'noopener')
  })

  it('reads the point payload and calls window.open', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    onScatterDotClick({ payload: { link: 'https://linear.app/acme/issue/ENG-2' } })
    onScatterDotClick({ payload: { id: 'ENG-3' } })
    onScatterDotClick({})
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('https://linear.app/acme/issue/ENG-2', '_blank', 'noopener')
    open.mockRestore()
  })
})
