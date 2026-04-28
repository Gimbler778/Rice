import axios, {
  type AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { env } from "@/lib/env";

interface AxiosConfigWithRetry extends InternalAxiosRequestConfig {
  retryCount?: number;
}

// Create axios instance with default config
export const axiosInstance = axios.create({
  baseURL: env.VITE_SERVER_BASE_URL,
  timeout: 15000, // Increased from 10s to handle larger datasets
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  },
);

// Response interceptor with exponential backoff retry
axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as AxiosConfigWithRetry;

    if (!config || config.retryCount === undefined) {
      if (config) config.retryCount = 0;
    }

    // Retry on timeout, 5xx errors, or 429 (rate limit)
    // Don't retry 4xx client errors except 429
    const shouldRetry =
      (error.code === "ECONNABORTED" ||
        error.response?.status === 429 ||
        (error.response?.status ?? 0) >= 500) &&
      config.retryCount! < 2;

    if (shouldRetry) {
      config.retryCount! += 1;
      const delay = Math.pow(2, config.retryCount! - 1) * 1000; // 1s, then 2s
      await new Promise((resolve) => setTimeout(resolve, delay));
      return axiosInstance(config);
    }

    return Promise.reject(error);
  },
);
