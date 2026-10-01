/**
 * One-time, idempotent migration for Captain onboarding personal information.
 * Copies legacy personalInformation.city to personalInformation.servingCity,
 * only when servingCity is absent; existing servingCity values are never overwritten.
 * Run: npm run migrate:captain-onboarding-serving-city (from Backend/)
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const mongoose = require("mongoose");
const connectToDb = require("../config/db");

async function main() {
  await connectToDb();
  const result = await mongoose.connection.db
    .collection("captain_onboardings")
    .updateMany(
      {
        "personalInformation.city": { $exists: true },
        "personalInformation.servingCity": { $exists: false },
      },
      [
        {
          $set: {
            "personalInformation.servingCity": "$personalInformation.city",
          },
        },
        { $unset: "personalInformation.city" },
      ],
    );
  console.log(
    "[migrate:captain-onboarding-serving-city] onboardings matched:",
    result.matchedCount,
    "modified:",
    result.modifiedCount,
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[migrate:captain-onboarding-serving-city]", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
