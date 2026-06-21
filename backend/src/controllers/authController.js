const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const crypto = require("crypto");
const { env } = require("../config/env");
const userModel = require("../models/userModel");
const { asyncHandler } = require("../utils/asyncHandler");
const { AppError } = require("../utils/appError");
const { success } = require("../utils/apiResponse");

const allowedRoles = ["ADMIN", "STAFF", "VIEWER"];
const googleClient = env.googleClientId ? new OAuth2Client(env.googleClientId) : null;

const register = asyncHandler(async (req, res) => {
  const { full_name, email, password, role } = req.body;

  if (!full_name || !email || !password || !role) {
    throw new AppError("full_name, email, password, and role are required", 400);
  }

  if (!allowedRoles.includes(role)) {
    throw new AppError("Invalid role", 400);
  }

  const existingUser = await userModel.findByEmail(email);
  if (existingUser) {
    throw new AppError("Email already registered", 409);
  }

  const password_hash = await bcrypt.hash(password, 10);
  const user = await userModel.create({ full_name, email, password_hash, role });

  return success(res, { user }, 201);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError("email and password are required", 400);
  }

  const user = await userModel.findByEmail(email);
  if (!user || !user.is_active) {
    throw new AppError("Invalid credentials", 401);
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    throw new AppError("Invalid credentials", 401);
  }

  await userModel.updateLastLogin(user.id);

  return res.json(buildAuthResponse(user));
});

const me = asyncHandler(async (req, res) => {
  return success(res, { user: req.user });
});

async function verifyGoogleEmail(credential) {
  if (!credential) {
    throw new AppError("Google credential token is required", 400);
  }

  if (!googleClient || !env.googleClientId) {
    throw new AppError("Google Client ID is not configured on the server", 500);
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: env.googleClientId,
    });
    const payload = ticket.getPayload();

    if (!payload.email_verified) {
      throw new AppError("Google email address is not verified", 401);
    }

    return payload.email;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError("Invalid Google credential token: " + err.message, 401);
  }
}

function buildAuthResponse(user) {
  const token = jwt.sign(
    {
      id: user.id,
      role: user.role
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );

  return {
    success: true,
    token,
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role
    }
  };
}

const googleRegister = asyncHandler(async (req, res) => {
  const { credential, full_name, role } = req.body;
  const requestedName = typeof full_name === "string" ? full_name.trim() : "";
  const requestedRole = role || "";

  if (!requestedName || !requestedRole) {
    throw new AppError("full_name and role are required to create a Google account", 400);
  }

  if (!allowedRoles.includes(requestedRole)) {
    throw new AppError("Invalid role", 400);
  }

  const email = await verifyGoogleEmail(credential);

  if (!email) {
    throw new AppError("Could not retrieve email from Google credential", 400);
  }

  const existingUser = await userModel.findByEmail(email);
  if (existingUser) {
    throw new AppError("Email already registered. Please log in with Google instead.", 409);
  }

  const randomPassword = crypto.randomBytes(32).toString("hex");
  const password_hash = await bcrypt.hash(randomPassword, 10);
  const user = await userModel.create({
    full_name: requestedName,
    email,
    password_hash,
    role: requestedRole
  });

  return success(res, { user }, 201);
});

const googleLogin = asyncHandler(async (req, res) => {
  const { credential } = req.body;
  const email = await verifyGoogleEmail(credential);

  if (!email) {
    throw new AppError("Could not retrieve email from Google credential", 400);
  }

  const user = await userModel.findByEmail(email);
  if (!user) {
    throw new AppError("No account found for this Google email. Please create an account first.", 404);
  }

  if (!user.is_active) {
    throw new AppError("User is inactive", 401);
  }

  await userModel.updateLastLogin(user.id);

  return res.json(buildAuthResponse(user));
});

module.exports = {
  register,
  login,
  googleRegister,
  googleLogin,
  me
};
