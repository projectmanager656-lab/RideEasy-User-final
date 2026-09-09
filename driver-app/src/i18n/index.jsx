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
  driver: 'Driver',
  online: 'Online',
  offline: 'Offline',
  trip_history: 'Trip history',
  logout: 'Log out',
  activate_subscription: 'Activate subscription',
  new_here: 'New here?',
  register: 'Register',
  login_here: 'Login here',
  login_response_missing: 'Unexpected login response',
  registration_response_missing: 'Unexpected registration response',
  verification_response_missing: 'Unexpected verification response',
  rideeasy_driver: 'RideEasy Driver',
  sign_in_to_go_online: 'Sign in to go online',
  email: 'Email',
  password: 'Password',
  phone_otp: 'Phone OTP',
  driver_phone_number: 'Driver phone number',
  sending_otp: 'Sending OTP…',
  send_otp: 'Send OTP',
  otp_6_digit: '6-digit OTP',
  verifying: 'Verifying…',
  verify_login: 'Verify & Login',
  driver_registration: 'Driver Registration',
  name: 'Name',
  full_name: 'Full name',
  phone: 'Phone',
  mobile_10_digit: '10-digit mobile number',
  vehicle_type: 'Vehicle type',
  select: 'Select',
  bike: 'Bike',
  auto: 'Auto',
  cab: 'Cab',
  vehicle_number: 'Vehicle number',
  license_number: 'License number',
  license_no: 'License no.',
  operating_city: 'Operating city',
  choose_subscription_plan: 'Choose subscription plan',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
  recommended: 'Recommended',
  upi_id_for_payments_optional: 'Your UPI ID for passenger payments (optional)',
  bank_details_payouts_optional: 'Bank details for payouts (optional)',
  bank_fields_fill_all: 'If you add this, fill all four fields. UPI can match the field above.',
  account_holder_name: 'Account holder name',
  account_number: 'Account number',
  ifsc: 'IFSC code',
  upi_bank_record_optional: 'UPI for bank record (or leave blank if same as above)',
  bank_details_partial_error: 'Bank details: enter holder name, account number, IFSC, and UPI together, or leave all blank.',
  min_6_characters: 'Minimum 6 characters',
  creating: 'Creating…',
  create_driver_account: 'Create driver account',
  already_have_account: 'Already have an account?',
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
  logging_in: 'लॉगिन हो रहा है…',
  dashboard: 'डैशबोर्ड',
  driver: 'ड्राइवर',
  online: 'ऑनलाइन',
  offline: 'ऑफ़लाइन',
  trip_history: 'ट्रिप इतिहास',
  logout: 'लॉग आउट',
  activate_subscription: 'सब्सक्रिप्शन सक्रिय करें',
  new_here: 'नए हैं?',
  register: 'पंजीकरण करें',
  login_here: 'यहाँ लॉगिन करें',
  login_response_missing: 'लॉगिन प्रतिक्रिया में खाता या टोकन नहीं है।',
  registration_response_missing: 'पंजीकरण प्रतिक्रिया में खाता या टोकन नहीं है।',
  verification_response_missing: 'सत्यापन प्रतिक्रिया में खाता या टोकन नहीं है।',
  rideeasy_driver: 'राइडईज़ी ड्राइवर',
  sign_in_to_go_online: 'ऑनलाइन जाने के लिए साइन इन करें',
  email: 'ईमेल',
  password: 'पासवर्ड',
  phone_otp: 'फ़ोन OTP',
  driver_phone_number: 'ड्राइवर फ़ोन नंबर',
  sending_otp: 'OTP भेजा जा रहा है…',
  send_otp: 'OTP भेजें',
  otp_6_digit: '6 अंकों वाला ओटीपी',
  verifying: 'सत्यापित हो रहा है…',
  verify_login: 'सत्यापित करें और लॉगिन करें',
  driver_registration: 'ड्राइवर पंजीकरण',
  name: 'नाम',
  full_name: 'पूरा नाम',
  phone: 'फ़ोन',
  mobile_10_digit: '10 अंकों का मोबाइल',
  vehicle_type: 'वाहन प्रकार',
  select: 'चुनें',
  bike: 'बाइक',
  auto: 'ऑटो',
  cab: 'कैब',
  vehicle_number: 'वाहन संख्या',
  license_number: 'लाइसेंस संख्या',
  license_no: 'लाइसेंस नं.',
  operating_city: 'कार्यशील शहर',
  choose_subscription_plan: 'सब्सक्रिप्शन प्लान चुनें',
  weekly: 'साप्ताहिक',
  monthly: 'मासिक',
  yearly: 'वार्षिक',
  recommended: 'अनुशंसित',
  upi_id_for_payments_optional: 'पैसेंजर भुगतान के लिए आपका UPI ID (वैकल्पिक)',
  bank_details_payouts_optional: 'भुगतान के लिए बैंक विवरण (वैकल्पिक)',
  bank_fields_fill_all: 'यदि यह जोड़ते हैं, तो चारों फ़ील्ड भरें। UPI ऊपर वाले फ़ील्ड से मेल खा सकता है।',
  account_holder_name: 'खाताधारक का नाम',
  account_number: 'खाता संख्या',
  ifsc: 'IFSC कोड',
  upi_bank_record_optional: 'बैंक रिकॉर्ड के लिए UPI (या ऊपर समान होने पर खाली छोड़ें)',
  bank_details_partial_error: 'बैंक विवरण: खाताधारक का नाम, खाता संख्या, IFSC और UPI एक साथ भरें, या सभी खाली छोड़ें।',
  min_6_characters: 'न्यूनतम 6 अक्षर',
  creating: 'बनाया जा रहा है…',
  create_driver_account: 'ड्राइवर खाता बनाएं',
  already_have_account: 'पहले से खाता है?',
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
  driver: 'ड्रायव्हर',
  online: 'ऑनलाइन',
  offline: 'ऑफलाइन',
  trip_history: 'ट्रिप इतिहास',
  logout: 'लॉग आउट',
  activate_subscription: 'सबस्क्रिप्शन सक्रिय करा',
  new_here: 'नवीन आहात?',
  register: 'नोंदणी करा',
  login_here: 'येथे लॉगिन करा',
  login_response_missing: 'लॉगिन प्रतिसादात खाते किंवा टोकन नाही.',
  registration_response_missing: 'नोंदणी प्रतिसादात खाते किंवा टोकन नाही.',
  verification_response_missing: 'पडताळणी प्रतिसादात खाते किंवा टोकन नाही.',
  rideeasy_driver: 'राइडईझी ड्रायव्हर',
  sign_in_to_go_online: 'ऑनलाइन जाण्यासाठी साइन इन करा',
  email: 'ईमेल',
  password: 'पासवर्ड',
  phone_otp: 'फोन ओटीपी',
  driver_phone_number: 'ड्रायव्हर फोन क्रमांक',
  sending_otp: 'ओटीपी पाठवला जात आहे…',
  send_otp: 'ओटीपी पाठवा',
  otp_6_digit: '6 अंकी ओटीपी',
  verifying: 'पडताळणी होत आहे…',
  verify_login: 'पडताळा आणि लॉगिन करा',
  driver_registration: 'ड्रायव्हर नोंदणी',
  name: 'नाव',
  full_name: 'पूर्ण नाव',
  phone: 'फोन',
  mobile_10_digit: '10 अंकी मोबाइल',
  vehicle_type: 'वाहन प्रकार',
  select: 'निवडा',
  bike: 'बाईक',
  auto: 'ऑटो',
  cab: 'कॅब',
  vehicle_number: 'वाहन क्रमांक',
  license_number: 'लायसन्स क्रमांक',
  license_no: 'लायसन्स क्र.',
  operating_city: 'कार्यरत शहर',
  choose_subscription_plan: 'सब्सक्रिप्शन प्लॅन निवडा',
  weekly: 'साप्ताहिक',
  monthly: 'मासिक',
  yearly: 'वार्षिक',
  recommended: 'शिफारस',
  upi_id_for_payments_optional: 'पॅसेंजर पेमेंटसाठी तुमचा UPI ID (ऐच्छिक)',
  bank_details_payouts_optional: 'पेमेंटसाठी बँक तपशील (ऐच्छिक)',
  bank_fields_fill_all: 'जर हे जोडत असाल तर चारही फील्ड भरा. UPI वरील फील्डशी जुळू शकतो.',
  account_holder_name: 'खातेदाराचे नाव',
  account_number: 'खाते क्रमांक',
  ifsc: 'IFSC कोड',
  upi_bank_record_optional: 'बँक रेकॉर्डसाठी UPI (किंवा वरील सारखाच असल्यास रिकामे ठेवा)',
  bank_details_partial_error: 'बँक तपशील: खातेदाराचे नाव, खाते क्रमांक, IFSC आणि UPI एकत्र भरा, किंवा सर्व रिकामे ठेवा.',
  min_6_characters: 'किमान 6 अक्षरे',
  creating: 'तयार होत आहे…',
  create_driver_account: 'ड्रायव्हर खाते तयार करा',
  already_have_account: 'आधीच खाते आहे?',
}

export const DEFAULT_LANGUAGE = 'en'

export const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'mr', label: 'मराठी' },
]

const DICTIONARIES = { en, hi, mr }
const STORAGE_KEY = 'rideeasy_driver_language'

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
