/**
 * Lazily load the Razorpay Checkout SDK, only when a payment is actually started.
 *
 * Razorpay's `checkout.js` initialises itself as soon as it is parsed: it resolves
 * its own build id and then requests
 * `https://checkout-static-next.razorpay.com/build/<build>` — when that resolution
 * fails it falls back to `.../build/undefined`, which 403s and also shows up as an
 * unused `link preload` in the browser console. Loading the SDK from a global
 * `<script>` in index.html made that happen on every screen at launch, long before
 * any payment. Loading it on demand keeps normal screens clean; the payment flow
 * still gets the SDK before `new window.Razorpay(...)` is constructed.
 */
const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

let loadingPromise = null

export function loadRazorpayCheckout () {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay requires a browser'))
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay)
  if (loadingPromise) return loadingPromise

  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = RAZORPAY_CHECKOUT_SRC
    script.async = true
    script.onload = () => {
      if (window.Razorpay) resolve(window.Razorpay)
      else reject(new Error('Razorpay SDK failed to initialise'))
    }
    script.onerror = () => {
      loadingPromise = null
      reject(new Error('Could not load Razorpay SDK'))
    }
    document.head.appendChild(script)
  })

  return loadingPromise
}
