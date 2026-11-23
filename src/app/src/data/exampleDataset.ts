import { parseCsv } from './parseCsv.ts'
import type { Dataset } from '../domain/types.ts'

/**
 * Small kanban export in the original column order:
 * ID, link, title, backlog, four workflow stages, attributes, blocked days.
 * Dates are ISO so the format is unambiguous. Completed items run through June 2026;
 * three items are still in progress.
 */
const EXAMPLE_CSV = `ID,Link,Title,Backlog,Ready,In Progress,Review,Done,Type,Team,Class of Service,Blocked Days
AA-101,https://example.com/browse/AA-101,Checkout retry policy,2026-01-05,2026-01-06,2026-01-08,2026-01-13,2026-01-15,Feature,Payments,Standard,1
AA-102,https://example.com/browse/AA-102,Payment webhook duplicates,2026-01-12,2026-01-13,2026-01-14,2026-01-16,2026-01-20,Bug,Payments,Expedite,0
AA-103,https://example.com/browse/AA-103,Guest checkout address validation,2026-01-20,2026-01-21,2026-01-22,,2026-01-28,Feature,Identity,Standard,2
AA-104,https://example.com/browse/AA-104,Saved card expiry notice,2026-02-02,2026-02-03,2026-02-04,2026-02-10,2026-02-12,Feature,Checkout,Fixed Date,0
AA-105,https://example.com/browse/AA-105,Tax rounding on discounts,2026-02-10,2026-02-11,2026-02-16,2026-02-18,2026-02-18,Bug,Checkout,Expedite,3
AA-106,https://example.com/browse/AA-106,Search index lag,2026-03-02,2026-03-03,2026-03-04,2026-03-09,2026-03-11,Debt,Platform,Intangible,0
AA-107,https://example.com/browse/AA-107,Account deletion export,2026-03-16,2026-03-17,2026-03-18,2026-03-24,2026-03-27,Feature,Platform,Standard,1
AA-108,https://example.com/browse/AA-108,Login rate limit,2026-04-06,2026-04-07,2026-04-08,2026-04-09,2026-04-10,Bug,Identity,Expedite,0
AA-109,https://example.com/browse/AA-109,Invoice PDF timeout,2026-04-20,2026-04-21,2026-04-28,2026-05-04,2026-05-06,Feature,Payments,Standard,4
AA-110,https://example.com/browse/AA-110,Promo code stacking,2026-05-11,2026-05-12,2026-05-13,2026-05-15,2026-05-15,Debt,Checkout,Fixed Date,0
AA-111,https://example.com/browse/AA-111,Address autocomplete,2026-06-01,2026-06-02,2026-06-08,2026-06-12,2026-06-16,Feature,Identity,Standard,2
AA-112,https://example.com/browse/AA-112,Session cookie refresh,2026-06-15,2026-06-16,2026-06-17,2026-06-18,2026-06-19,Bug,Platform,Expedite,0
AA-113,https://example.com/browse/AA-113,Refund status page,2026-09-01,2026-09-02,2026-09-04,,,Feature,Payments,Standard,1
AA-114,https://example.com/browse/AA-114,Bulk price import,2026-09-14,2026-09-15,2026-09-16,2026-09-22,,Debt,Checkout,Fixed Date,0
AA-115,https://example.com/browse/AA-115,Warehouse cutoff rules,2026-10-05,2026-10-06,,,,Feature,Identity,Intangible,0
`

export function loadExampleDataset(today = new Date()): Dataset {
  const result = parseCsv(EXAMPLE_CSV, { today, sourceName: 'Example Data' })
  if (!result.ok) throw new Error(result.error)
  return result.dataset
}
