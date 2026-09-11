const captainModel = require("../../models/captain.model");

describe("captain registration schema", () => {
  test("defines operational driver fields", () => {
    const fields = captainModel.schema.paths;

    ["vehicleType", "vehicleNumber", "license", "servingCity"].forEach(
      (field) => {
        expect(fields[field]).toBeDefined();
      },
    );

    expect(fields.vehicleType.isRequired).toBe(false);
    expect(fields.vehicleNumber.isRequired).toBe(false);
    expect(fields.license.isRequired).toBe(false);
    expect(fields.servingCity.isRequired).toBe(false);
  });

  test("does not keep onboarding payment or legacy city fields", () => {
    const fields = captainModel.schema.paths;

    ["city", "bankDetails", "upiId", "paymentQrUrl", "otp"].forEach((field) => {
      expect(fields[field]).toBeUndefined();
    });
  });

  test("retains temporary login OTP fields outside normal document selection", () => {
    expect(captainModel.schema.paths.loginOtp.options.select).toBe(false);
    expect(captainModel.schema.paths.loginOtpExpiresAt.options.select).toBe(
      false,
    );
  });

  test("applies intended operational defaults", () => {
    const captain = new captainModel({
      name: "Test Captain",
      phone: "8888887777",
      email: "captain@example.com",
      password: "hashed",
      vehicleType: "AUTO",
      vehicleNumber: "MH12AB1234",
      license: "LIC12345",
      servingCity: "Kolhapur",
    });

    expect(captain.isOnline).toBe(false);
    expect(captain.busy).toBe(false);
    expect(captain.status).toBe("inactive");
    expect(captain.approved).toBe(false);
    expect(captain.blocked).toBe(false);
    expect(captain.subscriptionStatus).toBe("none");

    expect(captain.walletBalance).toBe(0);
    expect(captain.totalEarnings).toBe(0);
    expect(captain.ratingSum).toBe(0);
    expect(captain.ratingCount).toBe(0);
    expect(captain.driverCancelCount).toBe(0);
  });
});
