/** Day-month-year order chosen while reading workflow dates. */
export type DateOrder = 'ymd' | 'dmy' | 'mdy'

/** Where the active dataset came from. Example data is the built-in sheet. */
export type SourceKind = 'linear' | 'file' | 'example'

/** Backlog is optional and sits before the commitment stages. */
export type StageRole = 'backlog' | 'workflow'

export interface WorkflowStage {
  name: string
  role: StageRole
}

export interface DatasetMetadata {
  sourceName: string
  idColumn: string
  linkColumn?: string
  titleColumn?: string
  /** Workflow columns in sheet order, including the backlog column when present. */
  stages: WorkflowStage[]
  /** Trailing columns. The blocked-days column is included when the sheet has one. */
  attributeColumns: string[]
  blockedDaysColumn?: string
  dateOrder: DateOrder
  /** Set when a file, the example sheet, or a Linear team export produced this dataset. */
  sourceKind?: SourceKind
  /** Linear team that was exported. Present when `sourceKind` is `linear`. */
  linearTeamId?: string
  linearTeamName?: string
  /** ISO timestamp of the last successful Linear sync. Refresh loads issues updated after this instant. */
  fetchedAt?: string
  /** First-import lower bound, `YYYY-MM-DD`. Refresh keeps this value. */
  linearSince?: string
  /** Latest completed issue day, `YYYY-MM-DD`. Display only; Refresh does not query by this day. */
  linearClosedThrough?: string
}

export interface WorkItem {
  id: string
  /**
   * Linear parent issue id. A non-empty value marks a sub-issue.
   * File imports and older rows omit it and stay issues.
   */
  parentId?: string
  link?: string
  title?: string
  /**
   * Entry date of each stage, aligned with `DatasetMetadata.stages`.
   * Empty cells inherit the next stage's date. A null means the item has not reached that stage.
   */
  stageDates: (Date | null)[]
  blockedDays: number
  attributes: Record<string, string>
}

export interface Dataset {
  metadata: DatasetMetadata
  items: WorkItem[]
  warnings: string[]
}
