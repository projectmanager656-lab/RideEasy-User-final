/**
 * Zod schemas for ride APIs — wire incrementally into routes/middleware.
 * Example: `parseResult = rideCreateSchema.safeParse(req.body)`
 */
const { z } = require('zod');

const rideCreateSchema = z.object({
    pickupLocation: z.string().min(3),
    dropLocation: z.string().min(3),
    city: z.enum([ 'Kolhapur', 'Ichalkaranji', 'Sangli' ]).optional(),
    vehicleType: z.enum([ 'BIKE', 'AUTO', 'CAR' ]),
    paymentMethod: z.literal('Cash').optional(),
    price: z.coerce.number().positive(),
    distanceKm: z.coerce.number().optional(),
});

module.exports = {
    rideCreateSchema,
};
