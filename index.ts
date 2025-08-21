import type {
  HttpClient,
  HttpError,
  HttpResponse,
  Method,
  RequestConfig,
} from "./types";
import { combine, Interceptors, makeError, toHeaders } from "./utils";

export function createHttp(init: RequestConfig = {}): HttpClient {
  const defaults: RequestConfig = { method: "GET", headers: {}, ...init };
  const req = new Interceptors<RequestConfig>();
  const res = new Interceptors<HttpResponse>();

  async function core<T = any, D = any>(cfg: RequestConfig<D>): Promise<T> {
    // merge defaults → cfg
    const headers = toHeaders(defaults.headers);
    toHeaders(cfg.headers).forEach((v, k) => headers.set(k, v));

    let url = cfg.url ?? "";
    const base = cfg.baseURL ?? defaults.baseURL;
    if (url && base) url = combine(base, url);

    // body (auto JSON for plain objects)
    let body = cfg.data;
    const isPlainObj =
      body != null &&
      !(body instanceof FormData) &&
      !(body instanceof Blob) &&
      !(body instanceof ArrayBuffer) &&
      !(body instanceof URLSearchParams) &&
      typeof body === "object";
    if (isPlainObj && !headers.has("Content-Type"))
      headers.set("Content-Type", "application/json");
    if (isPlainObj) body = JSON.stringify(body) as any;

    let final: RequestConfig<D> = {
      ...defaults,
      ...cfg,
      url,
      headers,
      credentials: cfg.withCredentials
        ? "include"
        : (cfg.credentials ?? defaults.credentials),
      data: body,
      method: (cfg.method ?? defaults.method ?? "GET")
        .toString()
        .toUpperCase() as Method,
    };

    final = await req.run(final);

    const ac =
      !final.signal && final.timeout ? new AbortController() : undefined;
    const timer = ac ? setTimeout(() => ac.abort(), final.timeout!) : undefined;

    try {
      const r = await fetch(final.url!, {
        ...final,
        body: final.data as any,
        headers: final.headers as Headers,
        signal: final.signal ?? ac?.signal,
      } as RequestInit);

      const hdrs: Record<string, string> = {};
      r.headers.forEach((v, k) => (hdrs[k] = v));
      const ct = r.headers.get("content-type") || "";
      let parsed: any;
      try {
        parsed = ct.includes("application/json")
          ? await r.json()
          : await r.text();
      } catch {
        parsed = ct.includes("application/json") ? null : "";
      }

      const wrapped: HttpResponse<T, D> = {
        data: parsed as T,
        status: r.status,
        headers: hdrs,
        config: final,
      };

      if (r.status < 200 || r.status >= 300) {
        const err = makeError<T, D>(
          "Request failed with status code " + r.status,
          final,
          wrapped,
          r.status,
        );
        throw err;
      }

      return (await res.run(wrapped)).data as T;
    } catch (e: any) {
      const isTimeout = e?.name === "AbortError";
      const err: HttpError = e?.isAxiosError
        ? e
        : makeError(
            isTimeout
              ? `timeout of ${final.timeout}ms exceeded`
              : (e?.message ?? "Network Error"),
            final,
            undefined,
            isTimeout ? 0 : undefined,
          );
      // let response interceptors see error responses only (no separate chain here)
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const api: HttpClient = {
    defaults,
    interceptors: { request: req, response: res },
    setBaseURL(u) {
      api.defaults.baseURL = u;
    },
    setHeader(k, v) {
      const h = toHeaders(api.defaults.headers);
      h.set(k, v);
      api.defaults.headers = h;
    },
    removeHeader(k) {
      const h = toHeaders(api.defaults.headers);
      h.delete(k);
      api.defaults.headers = h;
    },

    request: core,
    get: (u, c) => core({ ...(c ?? {}), url: u, method: "GET" }),
    delete: (u, c) => core({ ...(c ?? {}), url: u, method: "DELETE" }),
    head: (u, c) => core({ ...(c ?? {}), url: u, method: "HEAD" }),
    options: (u, c) => core({ ...(c ?? {}), url: u, method: "OPTIONS" }),
    post: (u, b, c) => core({ ...(c ?? {}), url: u, data: b, method: "POST" }),
    put: (u, b, c) => core({ ...(c ?? {}), url: u, data: b, method: "PUT" }),
    patch: (u, b, c) =>
      core({ ...(c ?? {}), url: u, data: b, method: "PATCH" }),
  };
  return api;
}

const http = createHttp();
export default http;
