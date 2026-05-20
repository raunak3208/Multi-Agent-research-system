function API_BASE() {
    return document.getElementById('apiBaseUrl')?.value || 'http://localhost:8000';
}

async function testConnectionAPI() {
    const res = await fetch(`${API_BASE()}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function startResearchStreamAPI(topic, onEvent, onError) {
    const es = new EventSource(`${API_BASE()}/api/research/stream?topic=${encodeURIComponent(topic)}`);
    
    es.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            onEvent(data);
            if (data.status === 'complete' && data.agent === 'system') {
                es.close();
            }
        } catch (err) {
            console.error("Failed to parse SSE message", err);
        }
    };

    es.onerror = (err) => {
        console.error("EventSource error", err);
        es.close();
        onError(new Error("Connection error with backend. Check if the server is running on " + API_BASE()));
    };

    return es;
}
