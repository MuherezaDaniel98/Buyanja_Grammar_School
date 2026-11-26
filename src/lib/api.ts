import axios from 'axios';

let inMemoryToken: string | null = null;

export function setInMemoryToken(token: string | null): void {
  inMemoryToken = token;
}

export function getInMemoryToken(): string | null {
  return inMemoryToken;
}

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (inMemoryToken) {
    config.headers.Authorization = `Bearer ${inMemoryToken}`;
  }
  return config;
});

let refreshingPromise: Promise<string | null> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes('/auth/login') &&
      !original.url?.includes('/auth/refresh')
    ) {
      original._retry = true;
      try {
        if (!refreshingPromise) {
          refreshingPromise = axios
            .post<{ accessToken: string }>('/api/auth/refresh', {}, { withCredentials: true })
            .then((res) => {
              inMemoryToken = res.data.accessToken;
              return res.data.accessToken;
            })
            .catch(() => {
              inMemoryToken = null;
              return null;
            })
            .finally(() => {
              refreshingPromise = null;
            });
        }
        const nextToken = await refreshingPromise;
        if (nextToken) {
          original.headers.Authorization = `Bearer ${nextToken}`;
          return api(original);
        }
      } catch {
        inMemoryToken = null;
      }
    }
    return Promise.reject(error);
  }
);

export async function downloadProtectedFile(
  url: string,
  filename: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown
): Promise<void> {
  const response = await api.request<Blob>({
    url,
    method,
    data: body,
    responseType: 'blob',
  });
  const blobUrl = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}
