const jwt = require("jsonwebtoken");
const crypto = require("crypto");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return reply(405, { ok: false, error: "Method not allowed" });
  }

  try {
    const { username, password } = JSON.parse(event.body || "{}");
    const expectedUsername = process.env.ADMIN_USERNAME;
    const expectedPassword = process.env.ADMIN_PASSWORD;
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;

    if (!expectedUsername || !expectedPassword || !jwtSecret) {
      throw new Error("Missing Netlify environment variables");
    }

    const usernameOK =
      typeof username === "string" &&
      username.length === expectedUsername.length &&
      crypto.timingSafeEqual(
        Buffer.from(username),
        Buffer.from(expectedUsername)
      );

    const passwordOK =
      typeof password === "string" &&
      password.length === expectedPassword.length &&
      crypto.timingSafeEqual(
        Buffer.from(password),
        Buffer.from(expectedPassword)
      );

    if (!usernameOK || !passwordOK) {
      return reply(401, { ok: false, error: "Invalid credentials" });
    }

    const now = Math.floor(Date.now() / 1000);
    const accessToken = jwt.sign(
      {
        aud: "authenticated",
        role: "authenticated",
        sub: "00000000-0000-0000-0000-000000000001",
        username: expectedUsername,
        iat: now,
        exp: now + 8 * 60 * 60
      },
      jwtSecret,
      { algorithm: "HS256" }
    );

    return reply(200, { ok: true, access_token: accessToken });
  } catch (error) {
    console.error("Login error:", error);
    return reply(500, { ok: false, error: "Login service error" });
  }
};

function reply(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}
