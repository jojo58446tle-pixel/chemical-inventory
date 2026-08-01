exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return reply(405, { ok: false, error: "Method not allowed" });
  }

  try {
    const { username, password } = JSON.parse(event.body || "{}");
    const expectedUsername = process.env.ADMIN_USERNAME;
    const adminEmail = process.env.ADMIN_AUTH_EMAIL;
    const supabaseUrl = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!expectedUsername || !adminEmail || !supabaseUrl || !publishableKey) {
      throw new Error("Missing Netlify environment variables");
    }

    if (username !== expectedUsername || typeof password !== "string" || !password) {
      return reply(401, { ok: false, error: "Invalid credentials" });
    }

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: publishableKey
      },
      body: JSON.stringify({ email: adminEmail, password })
    });

    const authData = await authResponse.json();
    if (!authResponse.ok || !authData.access_token || !authData.refresh_token) {
      return reply(401, { ok: false, error: "Invalid credentials" });
    }

    return reply(200, {
      ok: true,
      access_token: authData.access_token,
      refresh_token: authData.refresh_token
    });
  } catch (error) {
    console.error(error);
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
