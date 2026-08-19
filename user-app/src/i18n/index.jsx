import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const en = {
  app_name: 'RideEasy',
  select_language: 'Select Language',
  language: 'Language',
  english: 'English',
  hindi: 'Hindi',
  marathi: 'Marathi',
  loading: 'Loading…',
  login: 'Login',
  logging_in: 'Logging in…',
  dashboard: 'Dashboard',
  sign_in: 'Sign in',
  email: 'Email',
  password: 'Password',
  new_here: 'New here?',
  create_account: 'Create account',
  login_response_missing: 'Unexpected login response',
  registration_response_missing: 'Unexpected registration response',
  your_name: 'Your name',
  full_name: 'Full name',
  phone: 'Phone',
  mobile_10_digit: '10-digit mobile number',
  city: 'City',
  bank_details_title: 'Bank details (for signup)',
  bank_details_hint: 'Fill all four fields below — account holder, account number, IFSC, UPI. These are used for ride payments / verification.',
  account_holder_name_ph: 'Account holder name',
  account_number_ph: 'Account number (9–18 digits)',
  ifsc_ph: 'IFSC (e.g. HDFC0001234)',
  upi_id_ph: 'UPI ID (e.g. name@okaxis)',
  min_6_chars: 'Minimum 6 characters',
  referral_optional: 'Referral code (optional)',
  friends_referral_ph: "Friend's referral code",
  referral_hint: 'Referrals give bonus credits to both of you',
  signup_note: 'Verification takes up to 24 hours after signup.',
  creating: 'Creating…',
  already_have_account: 'Already have an account?',
  login_here: 'Login here',

  // --- Auth flow (AuthScreen) ---
  welcome_back: 'Welcome back',
  sign_in_continue: 'Sign in to continue',
  email_or_phone: 'Email or phone number',
  email_or_phone_ph: 'Email or phone number',
  forgot_password: 'Forgot password?',
  logging_in_dots: 'Logging in…',
  or_continue_with: 'or continue with',
  continue_with_google: 'Continue with Google',
  continue_with_apple: 'Continue with Apple',
  social_login_unavailable: 'Social login is not available yet. Please sign in with your email or phone.',
  google_not_configured: 'Google login is not configured yet. Ask your developer to add VITE_GOOGLE_CLIENT_ID.',
  google_login_failed: 'Google sign-in failed. Please try again.',
  dont_have_account: "Don't have an account?",
  sign_up: 'Sign up',
  checking_account: 'Checking account…',
  account_continue: 'Continue',
  new_account_detected: 'New account detected',
  lets_create_your_account: "Let's create your RideEasy account.",
  create_your_account: 'Create your account',
  fill_details_below: 'Fill in the details below',
  enter_full_name: 'Enter your full name',
  enter_email: 'Enter your email',
  enter_phone: 'Enter phone number',
  send_otp: 'Send OTP',
  sending_otp: 'Sending OTP…',
  otp_sent: 'OTP sent',
  valid_name_error: 'Please enter your full name.',
  valid_email_error: 'Please enter a valid email address.',
  valid_phone_error: 'Please enter a valid phone number.',
  account_exists: 'An account already exists with this email/phone. Please log in instead.',
  verify_your_number: 'Verify your number',
  otp_sent_to_phone: 'Enter the 6-digit code sent to',
  otp_sent_to: 'Enter the 6-digit code sent to',
  login_with_otp: 'Login with OTP',
  resend_otp_in: 'Resend OTP in {{seconds}}s',
  resend_otp: 'Resend OTP',
  verify_continue: 'Verify & Continue',
  verifying: 'Verifying…',
  invalid_otp: 'Invalid OTP. Please try again.',
  otp_expired: 'OTP expired. Please request a new OTP.',
  otp_error: 'Could not verify OTP. Please try again.',
  back_to_login: 'Back to login',
  back_to_registration: 'Back to registration',
  register_login_hint: 'Already have an account?',
  login_tab: 'Login',
  welcome_hero_sub: 'Book a ride in minutes',
  ride_anytime_anywhere: 'Ride Anytime, Anywhere',
  welcome_sub: 'Your city, your ride — book in seconds.',
  get_started: 'Get started',
  country_code: '+91',
  password_show: 'Show password',
  password_hide: 'Hide password',
  wrong_password_error: 'Invalid credentials. Please try again.',
  user_not_found_error: 'No account found with this email/phone. Please sign up instead.',

  // --- BottomNav.jsx ---
  book: 'Book',
  live: 'Live',
  trips: 'Trips',
  profile: 'Profile',

  // --- Home.jsx ---
  find_trip: 'Find trip',
  pickup_address: 'Pickup address',
  drop_destination: 'Drop destination',
  find_a_trip: 'Find a trip',
  from: 'From',
  to: 'To',
  home_to_pickup: 'Home → Pickup',
  work_to_drop: 'Work → Drop',
  home_to_drop: 'Home → Drop',
  work_to_pickup: 'Work → Pickup',

  // --- UserProfile.jsx ---
  display_name: 'Display name',
  home_address: 'Home address',
  work_address: 'Work address',
  save_changes: 'Save changes',
  log_out: 'Log out',
  refresh_profile: 'Refresh profile',
  saved: 'Saved',
  saving: 'Saving…',

  // --- RideHistory.jsx ---
  ride_history: 'Ride History',
  your_past_trips: 'Your past trips',
  refresh_list: 'Refresh list',
  no_rides_yet: 'No rides yet',
  book_a_ride: 'Book a ride',

  // --- Riding.jsx ---
  open_google_maps: 'Open Google Maps',
  vehicle: 'Vehicle',
  pickup: 'Pickup',
  drop: 'Drop',
}

const hi = {
  app_name: 'राइडईज़ी',
  select_language: 'भाषा चुनें',
  language: 'भाषा',
  english: 'अंग्रेज़ी',
  hindi: 'हिन्दी',
  marathi: 'मराठी',
  loading: 'लोड हो रहा है…',
  login: 'लॉगिन',
  logging_in: 'लॉग इन हो रहा है…',
  dashboard: 'डैशबोर्ड',
  sign_in: 'साइन इन',
  email: 'ईमेल',
  password: 'पासवर्ड',
  new_here: 'नए हैं?',
  create_account: 'खाता बनाएं',
  login_response_missing: 'अप्रत्याशित लॉगिन प्रतिक्रिया',
  registration_response_missing: 'अप्रत्याशित पंजीकरण प्रतिक्रिया',
  your_name: 'आपका नाम',
  full_name: 'पूरा नाम',
  phone: 'फ़ोन',
  mobile_10_digit: '10 अंकों का मोबाइल नंबर',
  city: 'शहर',
  bank_details_title: 'बैंक विवरण (साइनअप के लिए)',
  bank_details_hint: 'नीचे चारों फ़ील्ड भरें — खाताधारक का नाम, खाता संख्या, IFSC, UPI। इनका उपयोग राइड पेमेंट / वेरिफिकेशन के लिए किया जाता है।',
  account_holder_name_ph: 'खाताधारक का नाम',
  account_number_ph: 'खाता संख्या (9-18 अंक)',
  ifsc_ph: 'IFSC (जैसे HDFC0001234)',
  upi_id_ph: 'UPI आईडी (जैसे name@okaxis)',
  min_6_chars: 'कम से कम 6 अक्षर',
  referral_optional: 'रेफरल कोड (वैकल्पिक)',
  friends_referral_ph: "मित्र का रेफरल कोड",
  referral_hint: 'रेफरल दोनों को बोनस क्रेडिट देते हैं',
  signup_note: 'साइनअप के बाद वेरिफिकेशन में 24 घंटे तक लग सकते हैं।',
  creating: 'बनाया जा रहा है…',
  already_have_account: 'पहले से खाता है?',
  login_here: 'यहाँ लॉगिन करें',

  // --- Auth flow (AuthScreen) ---
  welcome_back: 'वापसी पर स्वागत है',
  sign_in_continue: 'जारी रखने के लिए साइन इन करें',
  email_or_phone: 'ईमेल या फ़ोन नंबर',
  email_or_phone_ph: 'ईमेल या फ़ोन नंबर',
  forgot_password: 'पासवर्ड भूल गए?',
  logging_in_dots: 'लॉग इन हो रहा है…',
  or_continue_with: 'या इसके साथ जारी रखें',
  continue_with_google: 'Google से जारी रखें',
  continue_with_apple: 'Apple से जारी रखें',
  social_login_unavailable: 'सोशल लॉगिन अभी उपलब्ध नहीं है। कृपया ईमेल या फ़ोन से साइन इन करें।',
  google_not_configured: 'Google लॉगिन अभी कॉन्फ़िगर नहीं है। VITE_GOOGLE_CLIENT_ID जोड़ने के लिए अपने डेवलपर से पूछें।',
  google_login_failed: 'Google साइन-इन विफल रहा। कृपया पुनः प्रयास करें।',
  dont_have_account: 'खाता नहीं है?',
  sign_up: 'साइन अप करें',
  checking_account: 'खाता जाँचा जा रहा है…',
  account_continue: 'आगे बढ़ें',
  new_account_detected: 'नया खाता मिला',
  lets_create_your_account: 'आपका RideEasy खाता बनाते हैं।',
  create_your_account: 'अपना खाता बनाएं',
  fill_details_below: 'नीचे विवरण भरें',
  enter_full_name: 'अपना पूरा नाम दर्ज करें',
  enter_email: 'अपना ईमेल दर्ज करें',
  enter_phone: 'फ़ोन नंबर दर्ज करें',
  send_otp: 'OTP भेजें',
  sending_otp: 'OTP भेजा जा रहा है…',
  otp_sent: 'OTP भेजा गया',
  valid_name_error: 'कृपया अपना पूरा नाम दर्ज करें।',
  valid_email_error: 'कृपया एक मान्य ईमेल पता दर्ज करें।',
  valid_phone_error: 'कृपया एक मान्य फ़ोन नंबर दर्ज करें।',
  account_exists: 'इस ईमेल/फ़ोन के साथ पहले से एक खाता मौजूद है। कृपया इसके बजाय लॉगिन करें।',
  verify_your_number: 'अपना नंबर सत्यापित करें',
  otp_sent_to_phone: 'इस पर भेजा गया 6-अंकीय कोड दर्ज करें',
  otp_sent_to: 'इस पर भेजा गया 6-अंकीय कोड दर्ज करें',
  login_with_otp: 'OTP से लॉगिन करें',
  resend_otp_in: '{{seconds}} सेकंड में OTP फिर से भेजें',
  resend_otp: 'OTP फिर से भेजें',
  verify_continue: 'सत्यापित करें और जारी रखें',
  verifying: 'सत्यापित हो रहा है…',
  invalid_otp: 'गलत OTP। कृपया पुनः प्रयास करें।',
  otp_expired: 'OTP समाप्त हो गया। कृपया नया OTP मांगें।',
  otp_error: 'OTP सत्यापित नहीं हो सका। कृपया पुनः प्रयास करें।',
  back_to_login: 'लॉगिन पर वापस जाएं',
  back_to_registration: 'पंजीकरण पर वापस जाएं',
  register_login_hint: 'पहले से खाता है?',
  login_tab: 'लॉगिन',
  welcome_hero_sub: 'मिनटों में राइड बुक करें',
  ride_anytime_anywhere: 'कभी भी, कहीं भी राइड करें',
  welcome_sub: 'आपका शहर, आपकी राइड — सेकंडों में बुक करें।',
  get_started: 'शुरू करें',
  country_code: '+91',
  password_show: 'पासवर्ड दिखाएं',
  password_hide: 'पासवर्ड छुपाएं',
  wrong_password_error: 'गलत क्रेडेंशियल। कृपया पुनः प्रयास करें।',
  user_not_found_error: 'इस ईमेल/फ़ोन के साथ कोई खाता नहीं मिला। कृपया साइन अप करें।',

  // --- BottomNav.jsx ---
  book: 'बुक करें',
  live: 'लाइव',
  trips: 'ट्रिप्स',
  profile: 'प्रोफ़ाइल',

  // --- Home.jsx ---
  find_trip: 'ट्रिप खोजें',
  pickup_address: 'पिकअप पता',
  drop_destination: 'ड्रॉप गंतव्य',
  find_a_trip: 'ट्रिप खोजें',
  from: 'से',
  to: 'तक',
  home_to_pickup: 'घर → पिकअप',
  work_to_drop: 'कार्यालय → ड्रॉप',
  home_to_drop: 'घर → ड्रॉप',
  work_to_pickup: 'कार्यालय → पिकअप',

  // --- UserProfile.jsx ---
  display_name: 'प्रदर्शित नाम',
  home_address: 'घर का पता',
  work_address: 'कार्यालय का पता',
  save_changes: 'परिवर्तन सहेजें',
  log_out: 'लॉग आउट',
  refresh_profile: 'प्रोफ़ाइल रीफ़्रेश करें',
  saved: 'सहेजा गया',
  saving: 'सहेजा जा रहा है…',

  // --- RideHistory.jsx ---
  ride_history: 'राइड इतिहास',
  your_past_trips: 'आपकी पिछली यात्राएँ',
  refresh_list: 'सूची रीफ़्रेश करें',
  no_rides_yet: 'अभी कोई राइड नहीं',
  book_a_ride: 'राइड बुक करें',

  // --- Riding.jsx ---
  open_google_maps: 'Google Maps खोलें',
  vehicle: 'वाहन',
  pickup: 'पिकअप',
  drop: 'ड्रॉप',
}

const mr = {
  app_name: 'राइडईझी',
  select_language: 'भाषा निवडा',
  language: 'भाषा',
  english: 'इंग्रजी',
  hindi: 'हिंदी',
  marathi: 'मराठी',
  loading: 'लोड होत आहे…',
  login: 'लॉगिन',
  logging_in: 'लॉगिन होत आहे…',
  dashboard: 'डॅशबोर्ड',
  sign_in: 'साइन इन',
  email: 'ईमेल',
  password: 'पासवर्ड',
  new_here: 'नवीन आहात?',
  create_account: 'खाते तयार करा',
  login_response_missing: 'अनपेक्षित लॉगिन प्रतिसाद',
  registration_response_missing: 'अनपेक्षित नोंदणी प्रतिसाद',
  your_name: 'तुमचे नाव',
  full_name: 'पूर्ण नाव',
  phone: 'फोन',
  mobile_10_digit: '10 अंकी मोबाईल क्रमांक',
  city: 'शहर',
  bank_details_title: 'बँक तपशील (नोंदणीसाठी)',
  bank_details_hint: 'खालील चारही फील्ड भरा — खातेदाराचे नाव, खाते क्रमांक, IFSC, UPI. हे तपशील राइड पेमेंट / पडताळणीसाठी वापरले जातात.',
  account_holder_name_ph: 'खातेदाराचे नाव',
  account_number_ph: 'खाते क्रमांक (9-18 अंक)',
  ifsc_ph: 'IFSC (उदा. HDFC0001234)',
  upi_id_ph: 'UPI आयडी (उदा. नाव@okaxis)',
  min_6_chars: 'किमान 6 अक्षरे',
  referral_optional: 'रेफरल कोड (ऐच्छिक)',
  friends_referral_ph: 'मित्राचा रेफरल कोड',
  referral_hint: 'रेफरल दोघांनाही बोनस क्रेडिट देतात',
  signup_note: 'नोंदणीनंतर पडताळणीसाठी 24 तासांपर्यंत वेळ लागू शकतो.',
  creating: 'तयार होत आहे…',
  already_have_account: 'आधीच खाते आहे?',
  login_here: 'येथे लॉगिन करा',

  // --- Auth flow (AuthScreen) ---
  welcome_back: 'पुन्हा स्वागत आहे',
  sign_in_continue: 'सुरू ठेवण्यासाठी साइन इन करा',
  email_or_phone: 'ईमेल किंवा फोन नंबर',
  email_or_phone_ph: 'ईमेल किंवा फोन नंबर',
  forgot_password: 'पासवर्ड विसरलात?',
  logging_in_dots: 'लॉगिन होत आहे…',
  or_continue_with: 'किंवा यासह सुरू ठेवा',
  continue_with_google: 'Google सह सुरू ठेवा',
  continue_with_apple: 'Apple सह सुरू ठेवा',
  social_login_unavailable: 'सोशल लॉगिन अद्याप उपलब्ध नाही. कृपया ईमेल किंवा फोनने साइन इन करा.',
  google_not_configured: 'Google लॉगिन अद्याप कॉन्फिगर केलेले नाही. VITE_GOOGLE_CLIENT_ID जोडण्यासाठी तुमच्या विकासकाला विचारा.',
  google_login_failed: 'Google साइन-इन अयशस्वी. कृपया पुन्हा प्रयत्न करा.',
  dont_have_account: 'खाते नाही का?',
  sign_up: 'साइन अप करा',
  checking_account: 'खाते तपासले जात आहे…',
  account_continue: 'पुढे जा',
  new_account_detected: 'नवीन खाते आढळले',
  lets_create_your_account: 'चला तुमचे RideEasy खाते बनवूया.',
  create_your_account: 'तुमचे खाते तयार करा',
  fill_details_below: 'खाली तपशील भरा',
  enter_full_name: 'तुमचे पूर्ण नाव प्रविष्ट करा',
  enter_email: 'तुमचा ईमेल प्रविष्ट करा',
  enter_phone: 'फोन नंबर प्रविष्ट करा',
  send_otp: 'OTP पाठवा',
  sending_otp: 'OTP पाठवले जात आहे…',
  otp_sent: 'OTP पाठवले',
  valid_name_error: 'कृपया तुमचे पूर्ण नाव प्रविष्ट करा.',
  valid_email_error: 'कृपया वैध ईमेल पत्ता प्रविष्ट करा.',
  valid_phone_error: 'कृपया वैध फोन नंबर प्रविष्ट करा.',
  account_exists: 'या ईमेल/फोनसह आधीच खाते आहे. कृपया त्याऐवजी लॉगिन करा.',
  verify_your_number: 'तुमचा नंबर सत्यापित करा',
  otp_sent_to_phone: 'यावर पाठवलेला 6-अंकी कोड प्रविष्ट करा',
  otp_sent_to: 'यावर पाठवलेला 6-अंकी कोड प्रविष्ट करा',
  login_with_otp: 'OTP द्वारे लॉगिन करा',
  resend_otp_in: '{{seconds}} सेकंदात OTP पुन्हा पाठवा',
  resend_otp: 'OTP पुन्हा पाठवा',
  verify_continue: 'सत्यापित करा आणि सुरू ठेवा',
  verifying: 'सत्यापित होत आहे…',
  invalid_otp: 'चुकीचा OTP. कृपया पुन्हा प्रयत्न करा.',
  otp_expired: 'OTP कालबाह्य झाला. कृपया नवीन OTP मागवा.',
  otp_error: 'OTP सत्यापित करता आला नाही. कृपया पुन्हा प्रयत्न करा.',
  back_to_login: 'लॉगिनवर परत जा',
  back_to_registration: 'नोंदणीवर परत जा',
  register_login_hint: 'आधीच खाते आहे?',
  login_tab: 'लॉगिन',
  welcome_hero_sub: 'मिनिटांत राइड बुक करा',
  ride_anytime_anywhere: 'कधीही, कुठेही राइड करा',
  welcome_sub: 'तुमचे शहर, तुमची राइड — सेकंदांत बुक करा.',
  get_started: 'सुरू करा',
  country_code: '+91',
  password_show: 'पासवर्ड दाखवा',
  password_hide: 'पासवर्ड लपवा',
  wrong_password_error: 'चुकीचे क्रेडेन्शियल. कृपया पुन्हा प्रयत्न करा.',
  user_not_found_error: 'या ईमेल/फोनसह खाते सापडले नाही. कृपया साइन अप करा.',

  // --- BottomNav.jsx ---
  book: 'बुक करा',
  live: 'लाइव्ह',
  trips: 'ट्रिप्स',
  profile: 'प्रोफाइल',

  // --- Home.jsx ---
  find_trip: 'ट्रिप शोधा',
  pickup_address: 'पिकअप पत्ता',
  drop_destination: 'ड्रॉप ठिकाण',
  find_a_trip: 'ट्रिप शोधा',
  from: 'पासून',
  to: 'पर्यंत',
  home_to_pickup: 'घर → पिकअप',
  work_to_drop: 'ऑफिस → ड्रॉप',
  home_to_drop: 'घर → ड्रॉप',
  work_to_pickup: 'ऑफिस → पिकअप',

  // --- UserProfile.jsx ---
  display_name: 'दाखवले जाणारे नाव',
  home_address: 'घराचा पत्ता',
  work_address: 'ऑफिसचा पत्ता',
  save_changes: 'बदल साठवा',
  log_out: 'लॉग आउट',
  refresh_profile: 'प्रोफाइल रिफ्रेश करा',
  saved: 'साठवले',
  saving: 'साठवले जात आहे…',

  // --- RideHistory.jsx ---
  ride_history: 'राइड इतिहास',
  your_past_trips: 'तुमच्या मागील सहली',
  refresh_list: 'यादी रिफ्रेश करा',
  no_rides_yet: 'अजून राइड नाही',
  book_a_ride: 'राइड बुक करा',

  // --- Riding.jsx ---
  open_google_maps: 'Google Maps उघडा',
  vehicle: 'वाहन',
  pickup: 'पिकअप',
  drop: 'ड्रॉप',
}

export const DEFAULT_LANGUAGE = 'en'

export const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'mr', label: 'मराठी' },
]

const DICTIONARIES = { en, hi, mr }
const STORAGE_KEY = 'rideeasy_user_language'

const LanguageContext = createContext(null)

const readInitialLanguage = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && DICTIONARIES[saved]) return saved
  } catch (_) {}
  return DEFAULT_LANGUAGE
}

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(readInitialLanguage)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language)
    } catch (_) {}
    document.documentElement.lang = language
  }, [language])

  const setLanguage = useCallback((code) => {
    if (DICTIONARIES[code]) setLanguageState(code)
  }, [])

  const t = useCallback((key, params) => {
    let text = DICTIONARIES[language]?.[key] ?? en[key] ?? key
    if (params) {
      Object.entries(params).forEach(([name, value]) => {
        text = text.split(`{{${name}}}`).join(String(value))
      })
    }
    return text
  }, [language])

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export const useLanguage = () => {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLanguage must be used within LanguageProvider')
  return context
}
