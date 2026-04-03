/**
 * FITMOD — API Utility
 * Configuration Axios/Fetch pour communiquer avec le backend MySQL
 */

// L'URL du backend en dev (vite utilise le port par défaut 5173, backend sur 3001)
const API_URL = 'http://localhost:3001/api';

/**
 * Fonction helper pour les appels API
 */
export async function fetchApi(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    const headers = {
        'Accept': 'application/json',
        ...(options.headers || {})
    };

    // Ne pas forcer Content-Type pour FormData (uploads multer)
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        if (options.body && typeof options.body === 'object') {
            options.body = JSON.stringify(options.body);
        }
    }

    try {
        const res = await fetch(url, { ...options, headers });
        const isJson = res.headers.get('content-type')?.includes('application/json');
        const data = isJson ? await res.json() : await res.text();

        if (!res.ok) {
            throw new Error((data && data.error) || data || res.statusText || 'Erreur API');
        }

        return data;
    } catch (err) {
        console.error(`[API Error] ${options.method || 'GET'} ${endpoint}:`, err.message);
        throw err;
    }
}

export default {
    get: (endpoint) => fetchApi(endpoint, { method: 'GET' }),
    post: (endpoint, body) => fetchApi(endpoint, { method: 'POST', body }),
    put: (endpoint, body) => fetchApi(endpoint, { method: 'PUT', body }),
    patch: (endpoint, body) => fetchApi(endpoint, { method: 'PATCH', body }),
    delete: (endpoint) => fetchApi(endpoint, { method: 'DELETE' }),
    getUploadUrl: (path) => path ? `http://localhost:3001${path}` : ''
};
