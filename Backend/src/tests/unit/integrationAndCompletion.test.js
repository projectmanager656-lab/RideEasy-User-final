const mongoose = require('mongoose');
const auditLogService = require('../../services/auditLog.service');
const invoiceService = require('../../services/invoice.service');
const supportTicketService = require('../../services/supportTicket.service');

const AuditLog = require('../../models/auditLog.model');
const Invoice = require('../../models/invoice.model');
const PaymentRecord = require('../../models/paymentRecord.model');
const SupportTicket = require('../../models/supportTicket.model');
const pricingService = require('../../services/pricing.service');

const RecentSearch = require('../../models/recentSearch.model');
const SavedLocation = require('../../models/savedLocation.model');
const DeviceToken = require('../../models/deviceToken.model');
const SosEvent = require('../../models/sosEvent.model');
const RideShare = require('../../models/rideShare.model');
const WebhookEvent = require('../../models/webhookEvent.model');

jest.mock('../../models/auditLog.model');
jest.mock('../../models/invoice.model');
jest.mock('../../models/paymentRecord.model');
jest.mock('../../models/supportTicket.model');
jest.mock('../../services/pricing.service');

describe('AuditLog Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('sanitizes sensitive data when logging admin actions', async () => {
        AuditLog.create = jest.fn().mockImplementation((payload) => Promise.resolve({ _id: 'audit-1', ...payload }));

        const adminId = new mongoose.Types.ObjectId();
        const newValue = {
            notes: 'Updating driver status',
            password: 'super-secret-password',
            token: 'jwt.token.here',
            otp: '123456',
            publicInfo: 'visible'
        };

        const result = await auditLogService.logAdminAction({
            adminId,
            action: 'DRIVER_APPROVE',
            targetType: 'driver',
            targetId: 'driver-123',
            newValue,
            req: { headers: { 'user-agent': 'JestTestRunner' }, ip: '127.0.0.1' }
        });

        expect(AuditLog.create).toHaveBeenCalledTimes(1);
        const createdArg = AuditLog.create.mock.calls[0][0];
        expect(createdArg.action).toBe('DRIVER_APPROVE');
        expect(createdArg.newValue.password).toBe('[REDACTED]');
        expect(createdArg.newValue.token).toBe('[REDACTED]');
        expect(createdArg.newValue.otp).toBe('[REDACTED]');
        expect(createdArg.newValue.publicInfo).toBe('visible');
    });
});

describe('Invoice Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns existing invoice if already generated', async () => {
        const existing = { _id: 'inv-existing', invoiceNumber: 'INV-123', finalAmount: 250 };
        Invoice.findOne = jest.fn().mockResolvedValue(existing);

        const ride = { _id: new mongoose.Types.ObjectId() };
        const result = await invoiceService.getOrCreateInvoice(ride);
        expect(result).toBe(existing);
        expect(Invoice.findOne).toHaveBeenCalledWith({ rideId: ride._id });
    });

    it('creates and calculates breakdown when generating new invoice', async () => {
        Invoice.findOne = jest.fn().mockResolvedValue(null);
        PaymentRecord.findOne = jest.fn().mockReturnValue({
            sort: jest.fn().mockResolvedValue({ _id: 'pay-1', externalRef: 'razorpay-ref-1' })
        });
        pricingService.getRates = jest.fn().mockResolvedValue({
            AUTO: { baseFare: 30, perKm: 12, perMin: 1.5 }
        });
        Invoice.create = jest.fn().mockImplementation((payload) => Promise.resolve({ _id: 'inv-new', ...payload }));

        const ride = {
            _id: new mongoose.Types.ObjectId(),
            user: new mongoose.Types.ObjectId(),
            captain: new mongoose.Types.ObjectId(),
            price: 200,
            vehicleType: 'AUTO',
            distance: 5,
            duration: 1200,
            status: 'completed'
        };

        const result = await invoiceService.getOrCreateInvoice(ride);
        expect(result).toBeDefined();
        expect(result.finalAmount).toBe(200);
        expect(result.invoiceNumber).toMatch(/^INV-/);
        expect(Invoice.create).toHaveBeenCalledTimes(1);
    });
});

describe('Support Ticket Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('creates support ticket with unique ticket number', async () => {
        SupportTicket.create = jest.fn().mockImplementation((payload) => Promise.resolve({ _id: 'ticket-1', ...payload }));

        const ticket = await supportTicketService.createTicket({
            userId: new mongoose.Types.ObjectId(),
            subject: 'Billing discrepancy',
            category: 'billing',
            description: 'Charged twice',
            priority: 'high'
        });

        expect(SupportTicket.create).toHaveBeenCalledTimes(1);
        expect(ticket.ticketNumber).toMatch(/^TCK-/);
        expect(ticket.status).toBe('open');
        expect(ticket.responses).toHaveLength(1);
        expect(ticket.responses[0].senderRole).toBe('user');
        expect(ticket.responses[0].message).toBe('Charged twice');
    });

    it('adds reply and updates ticket responses', async () => {
        const mockTicket = {
            _id: 'ticket-1',
            status: 'open',
            responses: [],
            save: jest.fn().mockResolvedValue(true)
        };
        SupportTicket.findById = jest.fn().mockResolvedValue(mockTicket);

        await supportTicketService.addTicketReply({
            ticketId: 'ticket-1',
            senderRole: 'admin',
            senderId: 'admin-1',
            message: 'We have resolved the issue.'
        });

        expect(mockTicket.responses).toHaveLength(1);
        expect(mockTicket.responses[0].message).toBe('We have resolved the issue.');
        expect(mockTicket.status).toBe('in_progress');
        expect(mockTicket.save).toHaveBeenCalledTimes(1);
    });
});

describe('Models Instantiation & Field Validation', () => {
    it('instantiates RecentSearch model correctly', () => {
        const search = new RecentSearch({
            user: new mongoose.Types.ObjectId(),
            pickup: 'Central Bus Stand',
            destination: 'Railway Station'
        });
        expect(search.pickup).toBe('Central Bus Stand');
        expect(search.destination).toBe('Railway Station');
    });

    it('instantiates SavedLocation model correctly', () => {
        const loc = new SavedLocation({
            userId: new mongoose.Types.ObjectId(),
            type: 'home',
            label: 'My House',
            address: '123 Main Street',
            latitude: 16.70,
            longitude: 74.24
        });
        expect(loc.type).toBe('home');
        expect(loc.label).toBe('My House');
        expect(loc.address).toBe('123 Main Street');
    });

    it('instantiates DeviceToken model correctly', () => {
        const token = new DeviceToken({
            userId: new mongoose.Types.ObjectId(),
            role: 'user',
            token: 'fcm-device-token-123',
            platform: 'android'
        });
        expect(token.platform).toBe('android');
        expect(token.active).toBe(true);
    });

    it('instantiates SosEvent model correctly', () => {
        const sos = new SosEvent({
            userId: new mongoose.Types.ObjectId(),
            status: 'triggered'
        });
        expect(sos.status).toBe('triggered');
    });

    it('instantiates RideShare model with token', () => {
        const share = new RideShare({
            rideId: new mongoose.Types.ObjectId(),
            userId: new mongoose.Types.ObjectId(),
            shareToken: 'test-share-token-abc',
            expiresAt: new Date(Date.now() + 86400000)
        });
        expect(share.shareToken).toBe('test-share-token-abc');
        expect(share.revoked).toBe(false);
    });

    it('instantiates WebhookEvent model for idempotency', () => {
        const evt = new WebhookEvent({
            eventId: 'evt_razorpay_123',
            eventType: 'payment.captured',
            provider: 'razorpay'
        });
        expect(evt.eventId).toBe('evt_razorpay_123');
        expect(evt.provider).toBe('razorpay');
    });
});
