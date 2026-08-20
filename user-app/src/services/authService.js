/**
 * Auth service — login, registration OTP, Google sign-in, logout.
 * All calls go through the shared apiClient; screens never hit the API directly.
 */
import { apiClient, withAuth } from './apiClient'

/** Check whether an email/phone identifier belongs to an existing account. */
export function checkUserExists (identifier) {
  return apiClient.post('/users/check-user', { identifier })
}

/** Password login — may return { passwordVerified } to trigger the OTP step. */
export function login (identifier, password) {
  return apiClient.post('/users/login', { identifier, password })
}

/** Google Identity token exchange — creates/links the account and returns a session. */
export function googleLogin (idToken) {
  return apiClient.post('/users/google', { idToken })
}

/** Send registration OTP to a phone (optionally with email/name). */
export function sendPhoneOtp (payload) {
  return apiClient.post('/users/phone/send-otp', payload)
}

/** Verify registration OTP — returns { token, user } on success. */
export function verifyPhoneOtp (payload) {
  return apiClient.post('/users/phone/verify-otp', payload)
}

/** Send login OTP to an existing account's identifier. */
export function sendLoginOtp (identifier) {
  return apiClient.post('/users/login/send-otp', { identifier })
}

/** Verify login OTP — returns { token, user } on success. */
export function verifyLoginOtp (identifier, otp) {
  return apiClient.post('/users/login/verify-otp', { identifier, otp })
}

/** Invalidate the passenger session server-side (local cleanup is centralized). */
export function logout () {
  return apiClient.get('/users/logout', withAuth())
}