/**
 * Barrel export for service layer (does not load Socket-dependent modules eagerly).
 */
module.exports = {
    rideService: require('./ride.service'),
    rideCoreService: require('./rideCore.service'),
    mapsService: require('./maps.service'),
    pricingService: require('./pricing.service'),
    paymentService: require('./payment.service'),
    subscriptionService: require('./subscription.service'),
    subscriptionDriverService: require('./subscriptionDriver.service'),
    driverService: require('./driver.service'),
    userService: require('./user.service'),
    otpService: require('./otp.service'),
    notificationService: require('./notification.service'),
    analyticsService: require('./analytics.service'),
    adminService: require('./admin.service'),
    trackingService: require('./tracking.service'),
    /** Call only after HTTP server + `initializeSocket` */
    getSocketService: () => require('./socket.service'),
};
