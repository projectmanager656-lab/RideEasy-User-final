const socketIo = require('socket.io');
const jwtConfig = require('../config/jwt.config');
const { socketIoCorsConfig } = require('../config/cors.config');
const { LOCATION_UPDATE } = require('./rideSocket.events');
const { emitJoinCatchUp } = require('./rideJoinCatchUp');
const userModel = require('../models/user.model');
const captainModel = require('../models/captain.model');
const rideModel = require('../models/rideCore.model');
const DriverLocation = require('../models/driverLocation.model');

let io;

/** Standard ride phase names (optional dual-emit for gradual client migration). */
const STANDARD_PHASE_EVENTS = {
    searching: 'ride:searching',
    assigned: 'ride:assigned',
    arrived: 'ride:arrived',
    started: 'ride:started',
    completed: 'ride:completed',
};

const SOCKET_DEBUG = process.env.RIDEEASY_SOCKET_DEBUG === '1' || process.env.RIDEEASY_SOCKET_DEBUG === 'true';

function slog (...args) {
    if (SOCKET_DEBUG) console.log('[rideeasy-socket]', new Date().toISOString(), ...args);
}

function roomId (ref) {
    if (ref == null) return '';
    if (typeof ref === 'string' || typeof ref === 'number') return String(ref);
    if (typeof ref === 'object' && ref._id != null) return String(ref._id);
    return String(ref);
}

/** Client may send Mongoose-shaped `{ _id }` or a plain string id. */
function normalizeClientId (raw) {
    if (raw == null || raw === '') return '';
    if (typeof raw === 'object' && raw._id != null) return String(raw._id);
    return String(raw);
}

/** Room name for targeted driver emits — matches client spec `driver-{id}`. */
function driverRoomHyphen (driverMongoId) {
    return `driver-${String(driverMongoId)}`;
}

/** City broadcast / presence room — `city-{CityName}` e.g. city-Kolhapur */
function cityRoomFromKey (city) {
    const s = String(city || '').trim();
    return s ? `city-${s}` : '';
}

/**
 * Join Socket.IO rooms so ride broadcasts reach this connection.
 * Leaves previous city room when the driver switches city.
 */
function joinDriverSocketRooms (socket, driverMongoId, cityKey) {
    const did = normalizeClientId(driverMongoId);
    if (!did) return;
    const cityRoom = cityRoomFromKey(cityKey);
    const prevCity = socket.data.rideeasyCityRoom;
    if (prevCity && cityRoom && prevCity !== cityRoom) {
        socket.leave(prevCity);
        slog('city room leave', prevCity);
    }
    socket.join(driverRoomHyphen(did));
    if (cityRoom) {
        socket.join(cityRoom);
        socket.data.rideeasyCityRoom = cityRoom;
    }
    slog('driver rooms joined', {
        driverId: did,
        rooms: [ driverRoomHyphen(did), cityRoom ].filter(Boolean),
    });
}

function emitToUser (userId, event, data, options = {}) {
    if (!io || userId == null) return;
    const id = roomId(userId);
    if (!id) return;
    const room = io.to(`user:${id}`);
    if (options.volatile) {
        room.volatile.emit(event, data);
    } else {
        room.emit(event, data);
    }
}

function emitToCaptain (captainId, event, data) {
    if (!io || captainId == null) return;
    const id = roomId(captainId);
    if (!id) return;
    io.to(driverRoomHyphen(id)).emit(event, data);
}

/**
 * Emit standardized ride phase events (in addition to legacy events).
 * Enable with RIDEEASY_STANDARD_SOCKET_EVENTS=true
 */
function emitStandardRidePhase (phase, { userId, captainId, payload }) {
    if (process.env.RIDEEASY_STANDARD_SOCKET_EVENTS !== 'true') return;
    const ev = STANDARD_PHASE_EVENTS[phase];
    if (!ev) return;
    if (userId) emitToUser(userId, ev, payload);
    if (captainId) emitToCaptain(captainId, ev, payload);
}

function getIo () {
    return io;
}

async function handleDriverPresenceJoin (socket, payload, sourceEvent) {
    const { driverId, city, lat, lng } = payload || {};
    if (!driverId) return;
    const did = normalizeClientId(driverId);
    if (!did) return;

    const update = {
        socketId: socket.id,
        status: 'active',
        isOnline: true,
    };
    if (city) update.city = city;
    if (lat != null && lng != null) {
        update.location = { type: 'Point', coordinates: [ Number(lng), Number(lat) ] };
    }
    await captainModel.findByIdAndUpdate(did, update);

    socket.data.rideeasyRole = 'captain';
    socket.data.rideeasyUserId = did;

    let cityKey = city;
    if (!cityKey) {
        const cap = await captainModel.findById(did).select('city');
        cityKey = cap?.city || 'Kolhapur';
    }
    joinDriverSocketRooms(socket, did, cityKey);
    void emitJoinCatchUp(socket);

    slog(sourceEvent, { driverId: did, city: cityKey, socket: socket.id });
}

function initializeSocket (server, app) {
    io = socketIo(server, {
        cors: socketIoCorsConfig(),
        connectionStateRecovery: {
            maxDisconnectionDuration: 2 * 60 * 1000,
            skipMiddlewares: true,
        },
    });

    if (app) app.set('io', io);

    io.use((socket, next) => {
        const raw =
            socket.handshake.auth?.token
            || socket.handshake.query?.token
            || (typeof socket.handshake.headers?.authorization === 'string'
                ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
                : '');
        if (!raw) {
            socket.data.jwtVerified = false;
            return next();
        }
        try {
            const decoded = jwtConfig.verifyToken(String(raw).trim());
            socket.data.jwtPayload = decoded;
            socket.data.jwtUserId = decoded?._id != null ? String(decoded._id) : null;
            socket.data.jwtRole = decoded?.role;
            socket.data.jwtVerified = true;
        } catch (e) {
            socket.data.jwtVerified = false;
            socket.data.jwtError = e?.message || 'invalid_token';
            if (process.env.SOCKET_REJECT_INVALID_JWT === 'true') {
                return next(new Error('Unauthorized'));
            }
        }
        return next();
    });

    io.on('connection', (socket) => {
        slog('connection', socket.id);

        socket.on('join', async (data) => {
            const { userId, userType } = data || {};
            const type = typeof userType === 'string' ? userType.trim().toLowerCase() : '';
            if (!userId || !type) return;

            if (type === 'user') {
                const uid = normalizeClientId(userId);
                if (!uid) return;
                socket.data.rideeasyRole = 'user';
                socket.data.rideeasyUserId = uid;
                try {
                    await userModel.findByIdAndUpdate(uid, { socketId: socket.id });
                } catch (e) {
                    console.warn('[socket join user] db update:', e?.message || e);
                }
                socket.join(`user:${uid}`);
                void emitJoinCatchUp(socket);
            } else if (type === 'captain' || type === 'driver') {
                const cid = normalizeClientId(userId);
                if (!cid) return;
                try {
                    await captainModel.findByIdAndUpdate(cid, {
                        socketId: socket.id,
                        status: 'active',
                        isOnline: true,
                    });
                } catch (e) {
                    console.warn('[socket join captain] db update:', e?.message || e);
                }
                socket.data.rideeasyRole = 'captain';
                socket.data.rideeasyUserId = cid;
                const cap = await captainModel.findById(cid).select('city');
                const cityKey = cap?.city || 'Kolhapur';
                joinDriverSocketRooms(socket, cid, cityKey);
                void emitJoinCatchUp(socket);
                slog('join captain', { driverId: cid, city: cityKey });
            }
        });

        socket.on('driver:join', (payload) => {
            void handleDriverPresenceJoin(socket, payload, 'driver:join');
        });

        socket.on('join-driver', (payload) => {
            void handleDriverPresenceJoin(socket, payload, 'join-driver');
        });

        socket.on('user:location-update', async (payload) => {
            if (socket.data.rideeasyRole !== 'user' || !socket.data.rideeasyUserId) return;
            const lat = Number(payload?.lat);
            const lng = Number(payload?.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

            const ride = await rideModel.findOne({
                user: socket.data.rideeasyUserId,
                status: { $in: [ 'searching', 'accepted', 'arrived', 'started' ] },
            }).select('captain _id');

            if (!ride?.captain) return;

            const capId = roomId(ride.captain);
            if (!capId) return;

            const at = Date.now();
            emitToCaptain(capId, LOCATION_UPDATE, {
                rideId: ride._id,
                lat,
                lng,
                at,
                source: 'passenger',
            });
        });

        const handleCaptainLocation = async (driverId, lat, lng) => {
            if (!driverId || lat == null || lng == null) return;
            await captainModel.findByIdAndUpdate(driverId, {
                location: { type: 'Point', coordinates: [ lng, lat ] },
                lastLocationUpdatedAt: new Date(),
                socketId: socket.id,
            });
            if (process.env.DRIVER_LOCATION_PERSIST === 'true') {
                try {
                    await DriverLocation.create({
                        driverId,
                        coordinates: { type: 'Point', coordinates: [ lng, lat ] },
                        recordedAt: new Date(),
                    });
                } catch (e) {
                    console.warn('[driverLocation]', e?.message || e);
                }
            }
            const ride = await rideModel.findOne({
                captain: driverId,
                status: { $in: [ 'accepted', 'arrived', 'started' ] },
            });
            if (ride?.user) {
                const locPayload = {
                    rideId: ride._id,
                    lat,
                    lng,
                    at: Date.now(),
                    source: 'driver',
                };
                emitToUser(ride.user, LOCATION_UPDATE, locPayload, { volatile: true });
                emitToUser(ride.user, 'ride:status-update', {
                    rideId: ride._id,
                    status: ride.status,
                    driverLocation: { lat, lng },
                }, { volatile: true });
            }
        };

        const onDriverLocationPayload = async (payload) => {
            const { driverId, lat, lng } = payload || {};
            const latN = Number(lat);
            const lngN = Number(lng);
            if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return;
            const did = driverId != null && driverId !== ''
                ? normalizeClientId(driverId)
                : socket.data.rideeasyUserId;
            if (!did) return;
            await handleCaptainLocation(did, latN, lngN);
        };

        socket.on('driver:location-update', onDriverLocationPayload);
        socket.on('driver-location-update', onDriverLocationPayload);

        socket.on('disconnect', async () => {
            await Promise.all([
                captainModel.findOneAndUpdate(
                    { socketId: socket.id },
                    { $unset: { socketId: '' } }
                ),
                userModel.findOneAndUpdate(
                    { socketId: socket.id },
                    { $unset: { socketId: '' } }
                ),
            ]);
        });
    });
}

function sendMessageToSocketId (socketId, messageObject) {
    if (!io || !socketId || !messageObject?.event) return;
    io.to(socketId).emit(messageObject.event, messageObject.data);
}

module.exports = {
    initializeSocket,
    sendMessageToSocketId,
    emitToUser,
    emitToCaptain,
    emitStandardRidePhase,
    STANDARD_PHASE_EVENTS,
    getIo,
    driverRoomHyphen,
    cityRoomFromKey,
};
