import type { Interceptors } from "../utils";

export type NextCache = { revalidate?: number | false; tags?: string[] };
export type Method =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type RequestConfig<D = any> = RequestInit & {
  url?: string;
  method?: Method;
  baseURL?: string;
  headers?: HeadersInit;
  data?: D; // request body (auto-JSON if plain object)
  timeout?: number; // ms
  withCredentials?: boolean; // → credentials:'include'
  next?: NextCache; // Next.js server cache options (passthrough)
};

export type HttpResponse<T = any, D = any> = {
  data: T;
  status: number;
  headers: Record<string, string>;
  config: RequestConfig<D>;
};

export type HttpError<T = any, D = any> = Error & {
  isAxiosError: true;
  status?: number;
  response?: HttpResponse<T, D>;
  config: RequestConfig<D>;
  toJSON(): any;
};


export type HttpClient = {
  defaults: RequestConfig;
  interceptors: {
    request: Interceptors<RequestConfig>;
    response: Interceptors<HttpResponse>;
  };
  setBaseURL(url: string): void;
  setHeader(k: string, v: string): void;
  removeHeader(k: string): void;

  request<T = any, D = any>(cfg: RequestConfig<D>): Promise<T>;
  get<T = any>(url: string, cfg?: RequestConfig): Promise<T>;
  delete<T = any>(url: string, cfg?: RequestConfig): Promise<T>;
  head<T = any>(url: string, cfg?: RequestConfig): Promise<T>;
  options<T = any>(url: string, cfg?: RequestConfig): Promise<T>;
  post<T = any, B = any>(
    url: string,
    body?: B,
    cfg?: RequestConfig<B>,
  ): Promise<T>;
  put<T = any, B = any>(
    url: string,
    body?: B,
    cfg?: RequestConfig<B>,
  ): Promise<T>;
  patch<T = any, B = any>(
    url: string,
    body?: B,
    cfg?: RequestConfig<B>,
  ): Promise<T>;
};
