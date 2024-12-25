self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Check if the request is for the proxy path
    if (url.pathname.startsWith('/proxy/')) {
        // Extract target server info from the query parameters
        const targetServer = url.searchParams.get('target');
        const targetPath = url.pathname.replace('/proxy', '');

        if (!targetServer) {
            return event.respondWith(
                new Response(JSON.stringify({ error: 'Target server not specified' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                })
            );
        }

        // Rewrite the request to the target server
        const proxiedUrl = `${targetServer}${targetPath}`;
        event.respondWith(
            fetch(proxiedUrl, {
                method: event.request.method,
                headers: event.request.headers,
                body: event.request.body,
            }).then((response) => {
                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                });
            }).catch((error) => {
                console.error('Error fetching from target server:', error);
                return new Response(JSON.stringify({ error: 'Failed to connect to target server' }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                });
            })
        );
    }
});
