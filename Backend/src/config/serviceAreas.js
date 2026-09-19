/**
 * RideEasy coverage — multiple circles per city (OR logic). `key` must match ride `city` enum:
 * Kolhapur | Ichalkaranji | Sangli
 *
 * tier: `core` = Kolhapur district clusters; `expansion` = wider belts & neighboring towns.
 * Keep frontend copies in sync: `utils/serviceArea.js`
 */
const SERVICE_AREAS = [
    /* Kolhapur CORE */
    { key: 'Kolhapur', name: 'Kolhapur City', tier: 'core', lat: 16.705, lng: 74.243, radius: 22 },
    { key: 'Kolhapur', name: 'Uchgaon', tier: 'core', lat: 16.669, lng: 74.29, radius: 9 },
    { key: 'Kolhapur', name: 'Shiroli MIDC', tier: 'core', lat: 16.783, lng: 74.268, radius: 7 },
    { key: 'Kolhapur', name: 'Gokul Shirgaon', tier: 'core', lat: 16.734, lng: 74.288, radius: 8 },
    { key: 'Kolhapur', name: 'Kasaba Bawada', tier: 'core', lat: 16.694, lng: 74.23, radius: 6 },
    /* Ichalkaranji expansion belt */
    { key: 'Ichalkaranji', name: 'Ichalkaranji', tier: 'expansion', lat: 16.6917, lng: 74.4592, radius: 14 },
    { key: 'Ichalkaranji', name: 'Hupari', tier: 'expansion', lat: 16.739, lng: 74.385, radius: 10 },
    { key: 'Ichalkaranji', name: 'Rukadi', tier: 'expansion', lat: 16.64, lng: 74.356, radius: 9 },
    /* Sangli */
    { key: 'Sangli', name: 'Sangli', tier: 'expansion', lat: 16.8524, lng: 74.5815, radius: 20 },
];

module.exports = { SERVICE_AREAS };
