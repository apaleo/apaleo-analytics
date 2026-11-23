import { useEffect, useRef, useState } from 'react'
import {
  createRandom,
  simulateHowMany,
  simulateHowManyChunked,
  simulateWhen,
  simulateWhenChunked,
  type HowManyResult,
  type TrialHistogram,
} from './simulate.ts'

const IDLE: TrialHistogram = { counts: [], trials: 0 }
const IDLE_HOW_MANY: HowManyResult = { counts: [], trials: 0, cumulativeMean: [] }

/**
 * First paint runs the simulation immediately so a static render still has a histogram.
 * Later input changes run in slices and yield, so 100K–1M trials do not freeze the tab.
 */
export function useMonteCarloRun(
  mode: 'howMany' | 'when',
  samples: readonly number[],
  amount: number,
  trials: number,
  seed: number | undefined,
  skip = false,
): { histogram: TrialHistogram; cumulativeMean: number[]; running: boolean } {
  const key = simulationKey(mode, samples, amount, trials, seed, skip)
  const [snapshot, setSnapshot] = useState(() => ({
    key,
    result: runSync(mode, samples, amount, trials, seed, skip),
  }))
  const applied = useRef(snapshot.key)

  useEffect(() => {
    if (applied.current === key) return
    if (skip) {
      applied.current = key
      setSnapshot({ key, result: idleResult(mode) })
      return
    }
    let cancelled = false
    const random = createRandom(seed)
    void (async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
      })
      if (cancelled) return
      const result =
        mode === 'howMany'
          ? await simulateHowManyChunked(samples, amount, trials, random, { shouldCancel: () => cancelled })
          : await simulateWhenChunked(samples, amount, trials, random, { shouldCancel: () => cancelled })
      if (cancelled) return
      applied.current = key
      setSnapshot({ key, result: toResult(mode, result) })
    })()
    return () => {
      cancelled = true
    }
  }, [key, mode, samples, amount, trials, seed, skip])

  const result = skip ? idleResult(mode) : snapshot.result
  return {
    histogram: { counts: result.counts, trials: result.trials },
    cumulativeMean: result.cumulativeMean,
    running: !skip && applied.current !== key,
  }
}

function idleResult(mode: 'howMany' | 'when'): HowManyResult {
  return mode === 'howMany' ? IDLE_HOW_MANY : { ...IDLE, cumulativeMean: [] }
}

function toResult(mode: 'howMany' | 'when', result: TrialHistogram | HowManyResult): HowManyResult {
  if (mode === 'howMany' && 'cumulativeMean' in result) return result
  return { counts: result.counts, trials: result.trials, cumulativeMean: [] }
}

function runSync(
  mode: 'howMany' | 'when',
  samples: readonly number[],
  amount: number,
  trials: number,
  seed: number | undefined,
  skip: boolean,
): HowManyResult {
  if (skip) return idleResult(mode)
  const random = createRandom(seed)
  if (mode === 'howMany') return simulateHowMany(samples, amount, trials, random)
  const when = simulateWhen(samples, amount, trials, random)
  return { ...when, cumulativeMean: [] }
}

function simulationKey(
  mode: 'howMany' | 'when',
  samples: readonly number[],
  amount: number,
  trials: number,
  seed: number | undefined,
  skip: boolean,
): string {
  return `${mode}|${amount}|${trials}|${seed ?? ''}|${skip ? 1 : 0}|${samples.join(',')}`
}
