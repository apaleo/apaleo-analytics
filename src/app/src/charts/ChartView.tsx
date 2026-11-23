import type { Dataset, WorkItem, WorkflowStage } from '../domain/types.ts'
import type { ChartId } from '../ui/charts.ts'
import { AgingWipChart } from './AgingWipChart.tsx'
import { CumulativeFlowChart } from './CumulativeFlowChart.tsx'
import { CycleTimeHistogramChart } from './CycleTimeHistogramChart.tsx'
import { CycleTimeScatterplotChart } from './CycleTimeScatterplotChart.tsx'
import { FlowEfficiencyChart } from './FlowEfficiencyChart.tsx'
import { HeatMapChart } from './HeatMapChart.tsx'
import { SourceDataView } from './SourceDataView.tsx'
import { ThroughputHistogramChart } from './ThroughputHistogramChart.tsx'
import { ThroughputRunChart } from './ThroughputRunChart.tsx'
import { WipRunChart } from './WipRunChart.tsx'
import { DashboardChart } from './montecarlo/DashboardChart.tsx'
import { MonteCarloHowManyChart } from './montecarlo/MonteCarloHowManyChart.tsx'
import { MonteCarloWhenChart } from './montecarlo/MonteCarloWhenChart.tsx'
import './charts.css'

export function ChartView({
  chartId,
  dataset,
  items,
  stages,
}: {
  chartId: ChartId
  dataset: Dataset
  items: readonly WorkItem[]
  stages: readonly WorkflowStage[]
}) {
  switch (chartId) {
    case 'cycle-time-scatterplot':
      return <CycleTimeScatterplotChart items={items} stages={stages} />
    case 'cycle-time-histogram':
      return <CycleTimeHistogramChart items={items} stages={stages} />
    case 'throughput-histogram':
      return <ThroughputHistogramChart items={items} stages={stages} />
    case 'cumulative-flow':
      return <CumulativeFlowChart items={items} stages={stages} />
    case 'monte-carlo-how-many':
      return <MonteCarloHowManyChart items={items} stages={stages} />
    case 'monte-carlo-when':
      return <MonteCarloWhenChart dataset={dataset} items={items} stages={stages} />
    case 'aging-wip':
      return <AgingWipChart items={items} stages={stages} />
    case 'flow-efficiency':
      return (
        <FlowEfficiencyChart
          items={items}
          stages={stages}
          useBlockedDays={dataset.metadata.blockedDaysColumn !== undefined}
        />
      )
    case 'heat-map':
      return <HeatMapChart items={items} stages={stages} />
    case 'throughput-run':
      return <ThroughputRunChart items={items} stages={stages} />
    case 'wip-run':
      return <WipRunChart items={items} stages={stages} />
    case 'dashboard':
      return <DashboardChart items={items} stages={stages} />
    case 'source-data':
      return <SourceDataView dataset={dataset} items={items} stages={stages} />
    default: {
      const unexpected: never = chartId
      throw new Error(`Unknown chart: ${String(unexpected)}`)
    }
  }
}
