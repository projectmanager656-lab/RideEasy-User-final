/**
 * Aggregates every per-feature extra dictionary. Merge order: later modules
 * win over earlier ones; nothing here may shadow a key already in index.jsx.
 */
import { en as baseEn, hi as baseHi, mr as baseMr } from './base'
import { en as homeEn, hi as homeHi, mr as homeMr } from './home'
import { en as bookEn, hi as bookHi, mr as bookMr } from './book-ride'
import { en as searchEn, hi as searchHi, mr as searchMr } from './search'
import { en as ridingEn, hi as ridingHi, mr as ridingMr } from './riding'
import { en as profileEn, hi as profileHi, mr as profileMr } from './profile'
import { en as supportEn, hi as supportHi, mr as supportMr } from './support'

export const en = { ...baseEn, ...homeEn, ...bookEn, ...searchEn, ...ridingEn, ...profileEn, ...supportEn }
export const hi = { ...baseHi, ...homeHi, ...bookHi, ...searchHi, ...ridingHi, ...profileHi, ...supportHi }
export const mr = { ...baseMr, ...homeMr, ...bookMr, ...searchMr, ...ridingMr, ...profileMr, ...supportMr }
