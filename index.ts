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
    // ---- merge defaults → cfg (no base join yet; do it after request interceptors)
    const headers = toHeaders(defaults.headers);
    toHeaders(cfg.headers).forEach((v, k) => headers.set(k, v));

    // Body (auto JSON for plain objects)
    let body = cfg.data as any;
    const isPlainObj =
      body != null &&
      !(body instanceof FormData) &&
      !(body instanceof Blob) &&
      !(body instanceof ArrayBuffer) &&
      !(body instanceof URLSearchParams) &&
      typeof body === "object";

    if (isPlainObj && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (isPlainObj && headers.get("Content-Type")?.includes("application/json")) {
      body = JSON.stringify(body);
    }

    let final: RequestConfig<D> = {
      ...defaults,
      ...cfg,
      headers,
      data: body,
      // credentials: honor per-request OR defaults.withCredentials (axios-like)
      credentials:
        (cfg.withCredentials ?? (defaults as any).withCredentials)
          ? "include"
          : (cfg.credentials ?? defaults.credentials),
      method: (cfg.method ?? defaults.method ?? "GET")
        .toString()
        .toUpperCase() as Method,
    };

    // ---- REQUEST interceptors (fulfilled chain) — normalized errors
    try {
      final = await req.runFulfilled(final);
    } catch (e: any) {
      const err = makeError(
        e?.message ?? "Request interceptor error",
        final as any
      );
      // Route through response error interceptors (Axios semantics)
      try {
        const maybe = await res.runRejected(err);
        if (maybe && typeof maybe === "object" && "status" in maybe && "data" in maybe) {
          return (maybe as HttpResponse<T, D>).data as T;
        }
        return maybe as T;
      } catch (handled) {
        throw handled;
      }
    }

    // ---- Interceptors may have changed url/baseURL, do the base join
    {
      const base = final.baseURL ?? defaults.baseURL;
      const url = final.url ?? cfg.url ?? "";
      final.url = base && url ? combine(base, String(url)) : url;
    }

    // ---- Re-normalize headers (interceptor may have set a plain object)
    final.headers = toHeaders(final.headers as HeadersInit | undefined);

    // ---- timeout handling (only if interceptors succeeded)
    const ac =
      !final.signal && final.timeout ? new AbortController() : undefined;
    const timer = ac ? setTimeout(() => ac.abort(), final.timeout!) : undefined;

    try {
      // ---- do fetch
      const r = await fetch(final.url!, {
        ...final,
        body: final.data as any,
        headers: final.headers as Headers,
        signal: final.signal ?? ac?.signal,
      } as RequestInit);

      // ---- normalize response
      const hdrs: Record<string, string> = {};
      r.headers.forEach((v, k) => (hdrs[k] = v));
      const ct = r.headers.get("content-type") || "";

      let parsed: any = null;
      if (r.status !== 204 && r.status !== 205) {
        try {
          parsed = ct.includes("application/json") ? await r.json() : await r.text();
        } catch {
          parsed = ct.includes("application/json") ? null : "";
        }
      }

      const wrapped: HttpResponse<T, D> = {
        data: parsed as T,
        status: r.status,
        headers: hdrs,
        config: final,
      };

      if (r.status < 200 || r.status >= 300) {
        const httpErr = makeError<T, D>(
          "Request failed with status code " + r.status,
          final,
          wrapped,
          r.status
        );
        // throw to the catch branch → response.onRejected chain will handle
        throw httpErr;
      }

      // ---- RESPONSE interceptors (fulfilled chain)
      const processed = await res.runFulfilled(wrapped);
      return processed.data as T;
    } catch (e: any) {
      const isTimeout = e?.name === "AbortError";
      const normalized: HttpError =
        e?.isAxiosError
          ? e
          : makeError(
              isTimeout
                ? `timeout of ${final.timeout}ms exceeded`
                : (e?.message ?? "Network Error"),
              final,
              e?.response,
              isTimeout ? 0 : e?.response?.status
            );

      // ---- RESPONSE interceptors (rejected chain)
      try {
        const maybe = await res.runRejected(normalized);

        // If handler returned a response-like object, mirror Axios and extract data
        if (maybe && typeof maybe === "object" && "status" in maybe && "data" in maybe) {
          return (maybe as HttpResponse<T, D>).data as T;
        }

        // If handler returned plain data, allow it (advanced)
        return maybe as T;
      } catch (handled) {
        // All onRejected handlers either rethrew or none handled → bubble up
        throw handled;
      }
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

export {
  type HttpClient,
  type HttpError,
  type HttpResponse,
  type Method,
  type RequestConfig,
}
export default http;

