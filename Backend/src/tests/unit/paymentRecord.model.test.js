const PaymentRecord = require("../../models/paymentRecord.model");

describe("PaymentRecord indexes", () => {
  test("enforces unique ride and payment type combinations", () => {
    const indexes = PaymentRecord.schema.indexes();
    const uniqueIndexes = indexes.filter(([, options]) => options?.unique);

    expect(uniqueIndexes).toEqual(expect.arrayContaining([
      [
        { rideId: 1, paymentType: 1 },
        expect.objectContaining({
          unique: true,
          name: "payment_record_rideid_paymenttype_unique",
          partialFilterExpression: {
            rideId: { $type: "objectId" },
            paymentType: { $in: ["ride_fare", "ride_approach_payment"] },
          },
        }),
      ],
      [
        { paymentIntentId: 1 },
        expect.objectContaining({
          unique: true,
          sparse: true,
          name: "payment_record_payment_intent_unique",
        }),
      ],
    ]));
  });
});