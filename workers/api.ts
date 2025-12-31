
interface Env {
    SPOTIFY_CLIENT_ID: string;
    SPOTIFY_CLIENT_SECRET: string;
    PLAYLIST_STORAGE: KVNamespace;
    APPLE_PRIVATE_KEY: string;
    APPLE_TEAM_ID: string;
    APPLE_KEY_ID: string;
}

export default {
    async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
        const url = new URL(request.url);

        // Common headers including CORS
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        if (url.pathname === "/api/share" && request.method === "POST") {
            try {
                const data = await request.json();
                const id = crypto.randomUUID().slice(0, 8); // Short ID
                await env.PLAYLIST_STORAGE.put(id, JSON.stringify(data), { expirationTtl: 60 * 60 * 24 * 7 }); // 1 week
                return new Response(JSON.stringify({ id }), {
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: "Failed to save playlist" }), { status: 500, headers: corsHeaders });
            }
        }

        if (url.pathname.startsWith("/api/playlist/") && request.method === "GET") {
            const id = url.pathname.split("/").pop();
            if (!id) return new Response("Missing ID", { status: 400 });

            const data = await env.PLAYLIST_STORAGE.get(id);
            if (!data) return new Response("Not Found", { status: 404, headers: corsHeaders });

            return new Response(data, {
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
        }

        if (url.pathname === "/api/spotify-token") {
            if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
                return new Response(
                    JSON.stringify({ error: "Server misconfiguration: Missing Spotify credentials" }),
                    {
                        status: 500,
                        headers: { "Content-Type": "application/json", ...corsHeaders }
                    }
                );
            }

            try {
                const credentials = btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);

                const response = await fetch("https://accounts.spotify.com/api/token", {
                    method: "POST",
                    headers: {
                        "Authorization": `Basic ${credentials}`,
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    body: new URLSearchParams({
                        grant_type: "client_credentials",
                    }),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error("Spotify Token Error:", errorText);
                    return new Response(
                        JSON.stringify({ error: `Spotify Error: ${response.status} ${response.statusText}`, details: errorText }),
                        {
                            status: response.status,
                            headers: { "Content-Type": "application/json", ...corsHeaders }
                        }
                    );
                }

                const data = await response.json();
                return new Response(JSON.stringify(data), {
                    headers: {
                        "Content-Type": "application/json",
                        ...corsHeaders
                    }
                });

            } catch (err) {
                console.error("Worker Error:", err);
                return new Response(
                    JSON.stringify({ error: "Internal Server Error" }),
                    {
                        status: 500,
                        headers: { "Content-Type": "application/json", ...corsHeaders }
                    }
                );
            }
        }

        if (url.pathname === "/api/apple-token" && request.method === "GET") {
            try {
                if (!env.APPLE_PRIVATE_KEY || !env.APPLE_TEAM_ID || !env.APPLE_KEY_ID) {
                    throw new Error("Missing Apple Credentials");
                }

                const privateKeyPEM = env.APPLE_PRIVATE_KEY
                    .replace(/-----BEGIN PRIVATE KEY-----/, "")
                    .replace(/-----END PRIVATE KEY-----/, "")
                    .replace(/\s+/g, "");

                const binaryKey = Uint8Array.from(atob(privateKeyPEM), c => c.charCodeAt(0));

                const algorithm = {
                    name: "ECDSA",
                    namedCurve: "P-256", // ES256 uses P-256
                };

                const importedKey = await crypto.subtle.importKey(
                    "pkcs8",
                    binaryKey,
                    algorithm,
                    false,
                    ["sign"]
                );

                const header = {
                    alg: "ES256",
                    kid: env.APPLE_KEY_ID
                };

                const now = Math.floor(Date.now() / 1000);
                const payload = {
                    iss: env.APPLE_TEAM_ID,
                    iat: now,
                    exp: now + (60 * 60 * 24 * 180) // 180 days max
                };

                const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
                const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

                const signatureInput = `${encodedHeader}.${encodedPayload}`;
                const signatureBuffer = await crypto.subtle.sign(
                    { name: "ECDSA", hash: { name: "SHA-256" } },
                    importedKey,
                    new TextEncoder().encode(signatureInput)
                );

                const signatureArray = Array.from(new Uint8Array(signatureBuffer));
                const encodedSignature = btoa(String.fromCharCode.apply(null, signatureArray))
                    .replace(/=/g, "")
                    .replace(/\+/g, "-")
                    .replace(/\//g, "_");

                const token = `${signatureInput}.${encodedSignature}`;

                return new Response(JSON.stringify({ token }), {
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });

            } catch (err: any) {
                console.error("Apple Token Error:", err);
                return new Response(JSON.stringify({ error: "Failed to generate token", details: err.message }), { status: 500, headers: corsHeaders });
            }
        }

        if (url.pathname === "/api/spotify/login" && request.method === "GET") {
            const redirectUri = new URL(request.url).origin + "/api/spotify/callback";
            // Use X-Forwarded-Host if available to handle proxies correctly
            const host = request.headers.get("X-Forwarded-Host") || request.headers.get("Host");
            const proto = request.headers.get("X-Forwarded-Proto") || "https";
            const finalRedirectUri = host ? `${proto}://${host}/api/spotify/callback` : redirectUri;

            const scope = "playlist-read-private playlist-read-collaborative";
            const state = crypto.randomUUID();

            const spotifyUrl = `https://accounts.spotify.com/authorize?` + new URLSearchParams({
                response_type: 'code',
                client_id: env.SPOTIFY_CLIENT_ID,
                scope: scope,
                redirect_uri: finalRedirectUri,
                state: state
            });

            return Response.redirect(spotifyUrl);
        }

        if (url.pathname === "/api/spotify/callback" && request.method === "GET") {
            const code = url.searchParams.get("code");
            const state = url.searchParams.get("state");
            const error = url.searchParams.get("error");

            if (error || !code) {
                return Response.redirect(`${new URL(request.url).origin}/?error=${error || 'missing_code'}`);
            }

            // Reconstruct redirect_uri exactly as sent in login
            const host = request.headers.get("X-Forwarded-Host") || request.headers.get("Host");
            const proto = request.headers.get("X-Forwarded-Proto") || "https";
            const redirectUri = host ? `${proto}://${host}/api/spotify/callback` : (new URL(request.url).origin + "/api/spotify/callback");

            try {
                const credential = btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);
                const response = await fetch("https://accounts.spotify.com/api/token", {
                    method: "POST",
                    headers: {
                        "Authorization": `Basic ${credential}`,
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    body: new URLSearchParams({
                        code: code,
                        redirect_uri: redirectUri,
                        grant_type: 'authorization_code'
                    })
                });

                if (!response.ok) {
                    const text = await response.text();
                    console.error("Spotify Auth Token Error:", text);
                    return Response.redirect(`${new URL(request.url).origin}/?error=spotify_token_error`);
                }

                const data: any = await response.json();
                // Redirect to home with token in hash (so it's not sent to server in history usually, though here it is)
                // Better: params.
                return Response.redirect(`${new URL(redirectUri).origin}/#spotify_token=${data.access_token}`);

            } catch (err) {
                console.error("Callback Error:", err);
                return Response.redirect(`${new URL(request.url).origin}/?error=internal_error`);
            }
        }

        return new Response("Not Found", { status: 404, headers: corsHeaders });
    }
};
