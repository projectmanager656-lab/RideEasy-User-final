export const FAQ_DATA = {
  booking: {
    label: 'Booking',
    icon: 'ri-taxi-line',
    detail: 'Booking and scheduling rides',
    faqs: [
      { q: 'How do I book a ride?', a: 'Enter your pickup and drop locations on the Home screen, select a ride type on Choose Ride, then tap the yellow confirm button.' },
      { q: 'How do I change my pickup location?', a: 'On the Home screen, tap the pickup field and choose a different location from the suggestions.' },
      { q: 'How do I change my destination?', a: 'Tap the drop field on the Home screen and pick another destination, or use the back arrow on Choose Ride to go back and edit.' },
      { q: 'How do I cancel a ride?', a: 'Open your active ride and select Cancel Ride. Follow the confirmation steps shown in the app.' },
      { q: 'Can I cancel a scheduled ride?', a: 'Yes — open the scheduled ride in My Trips and choose Cancel Ride before the pickup time.' },
      { q: 'How do I schedule a ride?', a: 'On Choose Ride, tap the calendar button, pick a date, hour, minutes and AM/PM, then confirm.' },
      { q: 'How do I select a ride type?', a: 'On Choose Ride, tap the ride option you want — like Bike, Auto or a car tier — then confirm.' },
    ],
  },
  payment: {
    label: 'Payment',
    icon: 'ri-wallet-3-line',
    detail: 'Fare and payment issues',
    faqs: [
      { q: 'How is my fare calculated?', a: 'Fare is based on the distance and duration of your trip, plus the selected ride type. The app shows an estimate before you book.' },
      { q: 'Why is my fare different?', a: 'The final fare can change if your route, distance or ride type changes. Your final amount is confirmed before you complete the ride.' },
      { q: 'My payment failed.', a: 'Check that your payment method has sufficient balance, then try again. If it still fails, contact support for help.' },
      { q: 'I was charged incorrectly.', a: 'Please use Report a Problem and choose the Payment issue option so we can review your trip charges.' },
      { q: 'What payment methods are available?', a: 'Cash and UPI are currently supported in RideEasy.' },
    ],
  },
  ride: {
    label: 'Ride Issues',
    icon: 'ri-car-warning-line',
    detail: 'Problems during a ride',
    faqs: [
      { q: 'Driver hasn\'t arrived.', a: 'Wait a few minutes for the driver. If they still don\'t arrive, you can cancel and request another ride, or Report a Problem.' },
      { q: 'Driver cancelled my ride.', a: 'Your ride will be cancelled and you can request a new one. A cancellation fee may apply depending on when it happened.' },
      { q: 'Driver or vehicle doesn\'t match.', a: 'Do not start the ride. Verify the driver and vehicle details, and contact support / Report a Problem immediately.' },
      { q: 'Wrong route taken.', a: 'You can ask the driver to follow the app route. If the issue continues, Report a Problem after the ride.' },
      { q: 'Unsafe driving.', a: 'If you feel unsafe during a trip, activate SOS from the Safety screen. After the ride, use Report a Problem to flag the issue.' },
      { q: 'Wrong fare charged.', a: 'Use Report a Problem and select the Wrong fare option with your trip details.' },
      { q: 'Ride completed incorrectly.', a: 'Report the issue with the ride details and we will review your trip.' },
    ],
  },
  account: {
    label: 'Account',
    icon: 'ri-user-settings-line',
    detail: 'Login and account problems',
    faqs: [
      { q: 'How do I log in?', a: 'Open the app and sign in with your registered phone number and OTP.' },
      { q: 'I forgot my account details.', a: 'Use the phone number you registered with to sign in again and receive a new OTP.' },
      { q: 'How do I update my profile?', a: 'Go to Account in the bottom navigation and edit your display name or saved addresses.' },
    ],
  },
}

export const CATEGORY_IDS = [ 'booking', 'payment', 'ride', 'account' ]