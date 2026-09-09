/**
 * Central HTTP entry — re-exports the shared axios instance and auth helpers.
 */
export {
  apiClient,
  withAuth,
  withCaptainAuth,
  withAdminAuth,
  withUserOrCaptainAuth,
} from './apiClient'
