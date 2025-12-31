
interface Env {
    SPOTIFY_CLIENT_ID: string;
    SPOTIFY_CLIENT_SECRET: string;
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
                        JSON.stringify({ error: "Failed to authenticate with Spotify" }),
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

        return new Response("Not Found", { status: 404, headers: corsHeaders });
    }
};
