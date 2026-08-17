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
