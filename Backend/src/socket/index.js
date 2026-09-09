const socketIo = require("socket.io");
const mongoose = require("mongoose");
const jwtConfig = require("../config/jwt.config");
const { socketIoCorsConfig } = require("../config/cors.config");
const { LOCATION_UPDATE } = require("./rideSocket.events");
const { emitJoinCatchUp } = require("./rideJoinCatchUp");
const userModel = require("../models/user.model");
const captainModel = require("../models/captain.model");
const blackListTokenModel = require("../models/blackListToken.model");
const rideModel = require("../models/rideCore.model");
const DriverLocation = require("../models/driverLocation.model");

let io;

/** Standard ride phase names (optional dual-emit for gradual client migration). */
const STANDARD_PHASE_EVENTS = {
  searching: "ride:searching",
  assigned: "ride:assigned",
  arrived: "ride:arrived",
  started: "ride:started",
  completed: "ride:completed",
};

const SOCKET_DEBUG =
  process.env.RIDEEASY_SOCKET_DEBUG === "1" ||
  process.env.RIDEEASY_SOCKET_DEBUG === "true";

function slog(...args) {
  if (SOCKET_DEBUG)
    console.log("[rideeasy-socket]", new Date().toISOString(), ...args);
}

function roomId(ref) {
  if (ref == null) return "";
  if (typeof ref === "string" || typeof ref === "number") return String(ref);
  if (typeof ref === "object" && ref._id != null) return String(ref._id);
  return String(ref);
}

/** Client may send Mongoose-shaped `{ _id }` or a plain string id. */
function normalizeClientId(raw) {
  if (raw == null || raw === "") return "";
  if (typeof raw === "object" && raw._id != null) return String(raw._id);
  return String(raw);
}

function validCoordinates(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function socketToken(socket) {
  const candidate =
    socket.handshake.auth?.token ||
    socket.handshake.query?.token ||
    socket.handshake.headers?.authorization;
  if (typeof candidate !== "string") return "";
  return candidate.trim().replace(/^Bearer\s+/i, "");
}

/** Room name for targeted driver emits — matches client spec `driver-{id}`. */
function driverRoomHyphen(driverMongoId) {
  return `driver-${String(driverMongoId)}`;
}

/** City broadcast / presence room — `city-{CityName}` e.g. city-Kolhapur */
function cityRoomFromKey(city) {
  const s = String(city || "").trim();
  return s ? `city-${s}` : "";
}

/**
 * Join Socket.IO rooms so ride broadcasts reach this connection.
 * Leaves previous city room when the driver switches city.
 */
function joinDriverSocketRooms(socket, driverMongoId, cityKey) {
  const did = normalizeClientId(driverMongoId);
  if (!did) return;
  const cityRoom = cityRoomFromKey(cityKey);
  const prevCity = socket.data.rideeasyCityRoom;
  if (prevCity && cityRoom && prevCity !== cityRoom) {
    socket.leave(prevCity);
    slog("city room leave", prevCity);
  }
  socket.join(driverRoomHyphen(did));
  if (cityRoom) {
    socket.join(cityRoom);
    socket.data.rideeasyCityRoom = cityRoom;
  }
  slog("driver rooms joined", {
    driverId: did,
    rooms: [driverRoomHyphen(did), cityRoom].filter(Boolean),
  });
}

function emitToUser(userId, event, data, options = {}) {
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

function emitToCaptain(captainId, event, data) {
  if (!io || captainId == null) return;

  const id = roomId(captainId);
  if (!id) return;

  const roomName = driverRoomHyphen(id);
  const room = io.sockets.adapter.rooms.get(roomName);
  const socketCount = room ? room.size : 0;

  console.log("[socket emitToCaptain]", {
    captainId: id,
    event,
    room: roomName,
    socketCount,
    socketIds: room ? [...room] : [],
  });

  io.to(roomName).emit(event, data);
}

/**
 * Emit standardized ride phase events (in addition to legacy events).
 * Enable with RIDEEASY_STANDARD_SOCKET_EVENTS=true
 */
function emitStandardRidePhase(phase, { userId, captainId, payload }) {
  if (process.env.RIDEEASY_STANDARD_SOCKET_EVENTS !== "true") return;
  const ev = STANDARD_PHASE_EVENTS[phase];
  if (!ev) return;
  if (userId) emitToUser(userId, ev, payload);
  if (captainId) emitToCaptain(captainId, ev, payload);
}

function getIo() {
  return io;
}

async function handleDriverPresenceJoin(socket, payload, sourceEvent) {
  if (socket.data.jwtRole !== "captain" || !socket.data.jwtUserId) return;
  const did = socket.data.jwtUserId;
  const lat = payload?.lat;
  const lng = payload?.lng;
  const hasLocation = lat != null || lng != null;
  const latN = Number(lat);
  const lngN = Number(lng);
  if (hasLocation && !validCoordinates(latN, lngN)) return;

  const update = {
    socketId: socket.id,
    status: "active",
    isOnline: true,
  };
  if (hasLocation) {
    update.location = { type: "Point", coordinates: [lngN, latN] };
  }
  await captainModel.findByIdAndUpdate(did, update);

  const cap = await captainModel.findById(did).select("servingCity");
  const cityKey = cap?.servingCity || "Kolhapur";
  joinDriverSocketRooms(socket, did, cityKey);
  void emitJoinCatchUp(socket);

  slog(sourceEvent, { city: cityKey, socket: socket.id });
}

function initializeSocket(server, app) {
  io = socketIo(server, {
    cors: socketIoCorsConfig(),
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },
  });

  if (app) app.set("io", io);

  io.use(async (socket, next) => {
    const raw = socketToken(socket);
    console.log('[socket auth] token received:', !!raw);
    if (!raw) return next(new Error("Unauthorized"));
    try {
      const blacklisted = await blackListTokenModel.findOne({ token: raw });
      if (blacklisted) return next(new Error("Unauthorized"));
      const decoded = jwtConfig.verifyToken(raw);
      const id = decoded?._id ?? decoded?.id;
      const role = decoded?.role;
      if (
        !mongoose.isValidObjectId(id) ||
        !["user", "captain"].includes(role)
      ) {
        return next(new Error("Unauthorized"));
      }
      const account =
        role === "user"
          ? await userModel.findById(id).select("_id blocked")
          : await captainModel.findById(id).select("_id blocked");
      if (!account || account.blocked) return next(new Error("Unauthorized"));
      socket.data.jwtPayload = decoded;
      socket.data.jwtUserId = String(account._id);
      socket.data.jwtRole = role;
      socket.data.jwtVerified = true;
      socket.data.rideeasyUserId = String(account._id);
      socket.data.rideeasyRole = role;
      return next();
    } catch (e) {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    slog("connection", socket.id);

    socket.on("join", async () => {
      const id = socket.data.jwtUserId;
      const role = socket.data.jwtRole;
      if (!id || !["user", "captain"].includes(role)) return;

      if (role === "user") {
        try {
          await userModel.findByIdAndUpdate(id, { socketId: socket.id });
        } catch (e) {
          console.warn("[socket join user] db update:", e?.message || e);
        }
        socket.join(`user:${id}`);
        void emitJoinCatchUp(socket);
      } else if (role === "captain") {
        try {
          await captainModel.findByIdAndUpdate(id, {
            socketId: socket.id,
            status: "active",
            isOnline: true,
          });
        } catch (e) {
          console.warn("[socket join captain] db update:", e?.message || e);
        }
        const cap = await captainModel.findById(id).select("servingCity");
        const cityKey = cap?.servingCity || "Kolhapur";
        joinDriverSocketRooms(socket, id, cityKey);
        void emitJoinCatchUp(socket);
        slog("join captain", { city: cityKey, socket: socket.id });
      }
    });

    socket.on("driver:join", (payload) => {
      void handleDriverPresenceJoin(socket, payload, "driver:join");
    });

    socket.on("join-driver", (payload) => {
      void handleDriverPresenceJoin(socket, payload, "join-driver");
    });

    socket.on("user:location-update", async (payload) => {
      if (socket.data.rideeasyRole !== "user" || !socket.data.rideeasyUserId)
        return;
      const lat = Number(payload?.lat);
      const lng = Number(payload?.lng);
      if (!validCoordinates(lat, lng)) return;

      const ride = await rideModel
        .findOne({
          user: socket.data.rideeasyUserId,
          status: { $in: ["searching", "accepted", "arrived", "started"] },
        })
        .select("captain _id");

      if (!ride?.captain) return;

      const capId = roomId(ride.captain);
      if (!capId) return;

      const at = Date.now();
      emitToCaptain(capId, LOCATION_UPDATE, {
        rideId: ride._id,
        lat,
        lng,
        at,
        source: "passenger",
      });
    });

    const handleCaptainLocation = async (driverId, lat, lng) => {
      if (!driverId || lat == null || lng == null) return;
      await captainModel.findByIdAndUpdate(driverId, {
        location: { type: "Point", coordinates: [lng, lat] },
        lastLocationUpdatedAt: new Date(),
        socketId: socket.id,
      });
      if (process.env.DRIVER_LOCATION_PERSIST === "true") {
        try {
          await DriverLocation.create({
            driverId,
            coordinates: { type: "Point", coordinates: [lng, lat] },
            recordedAt: new Date(),
          });
        } catch (e) {
          console.warn("[driverLocation]", e?.message || e);
        }
      }
      const ride = await rideModel.findOne({
        captain: driverId,
        status: { $in: ["accepted", "arrived", "started"] },
      });
      if (ride?.user) {
        const locPayload = {
          rideId: ride._id,
          lat,
          lng,
          at: Date.now(),
          source: "driver",
        };
        emitToUser(ride.user, LOCATION_UPDATE, locPayload, { volatile: true });
        emitToUser(
          ride.user,
          "ride:status-update",
          {
            rideId: ride._id,
            status: ride.status,
            driverLocation: { lat, lng },
          },
          { volatile: true },
        );
      }
    };

    const onDriverLocationPayload = async (payload) => {
      const { lat, lng } = payload || {};
      const latN = Number(lat);
      const lngN = Number(lng);
      if (socket.data.jwtRole !== "captain" || !validCoordinates(latN, lngN))
        return;
      const did = socket.data.jwtUserId;
      if (!did) return;
      await handleCaptainLocation(did, latN, lngN);
    };

    socket.on("driver:location-update", onDriverLocationPayload);
    socket.on("driver-location-update", onDriverLocationPayload);

    socket.on("disconnect", async () => {
      await Promise.all([
        captainModel.findOneAndUpdate(
          { socketId: socket.id },
          { $unset: { socketId: "" } },
        ),
        userModel.findOneAndUpdate(
          { socketId: socket.id },
          { $unset: { socketId: "" } },
        ),
      ]);
    });
  });
}

function sendMessageToSocketId(socketId, messageObject) {
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
