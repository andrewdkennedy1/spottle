
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === "/api/spotify-token") {
            try {
                const response = await fetch(
                    "https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
                    {
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                            "Accept": "application/json"
                        }
                    }
                );

                if (!response.ok) {
                    return new Response(JSON.stringify({ error: "Failed to fetch from Spotify" }), {
                        status: response.status,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                const data = await response.json();
                return new Response(JSON.stringify(data), {
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    }
                });

            } catch (err) {
                return new Response(JSON.stringify({ error: "Internal Server Error" }), {
                    status: 500,
                    headers: { "Content-Type": "application/json" }
                });
            }
        }

        return new Response("Not Found", { status: 404 });
    }
};
