# next-axis — Next.js-native `fetch` with Axios-level DX
[![npm](https://img.shields.io/npm/v/next-axis?color=%2300b894&label=next-axis)](https://www.npmjs.com/package/next-axis)
[![size](https://img.shields.io/bundlephobia/minzip/next-axis)](https://bundlephobia.com/package/next-axis)
![types](https://img.shields.io/badge/types-included-blue)
![deps](https://img.shields.io/badge/dependencies-0-brightgreen)
[![license](https://img.shields.io/npm/l/next-axis)](./LICENSE)

> **Axios DX without losing Next.js caching.**
> A tiny, zero-dependency HTTP client built on platform `fetch` that preserves **`next: { revalidate, tags }`**, request memoization, and Edge compatibility—while giving you the ergonomics you actually want.

---

## Why this exists

You love **Next.js RSC, Server Actions, ISR, tag revalidation**… but real apps still call external APIs.

* Use **Axios** and you **opt out** of Next’s server `fetch` cache/memoization and tag revalidation.
* Use **native `fetch`** and you’re stuck sprinkling `if (!res.ok) throw …` everywhere, wiring `AbortController` by hand, and duplicating error handling.

**next-axis** is a **purpose-built, Next-aware wrapper** that keeps platform `fetch` semantics intact and adds a thin layer of DX:

* Axios-style **methods**: `.get/.post/.put/.patch/.delete/.head/.options`
* **Clean errors**: auto-reject on non-2xx with `error.response.data`
* **Interceptors**: request & response (auth headers, logging, metrics)
* **Base URL** helpers
* **Timeout** via `AbortController`
* 100% **Edge/Workers** safe, **zero dependencies**
* Full **`RequestInit` pass-through** (including `next: { revalidate, tags }`, `cache`, `signal`, `credentials`)

> Not “just another wrapper.” It’s designed specifically for **Next.js server/RSC/Route Handlers** where `fetch` is the framework boundary.

---

## Install

```bash
npm i next-axis
# or
pnpm add next-axis
# or
yarn add next-axis
```

---

## Quick start

```ts
import http from "next-axis";

// 1) Optional: set a base URL
http.setBaseURL(process.env.NEXT_PUBLIC_API_URL!);

// 2) Minimal auth & cache discipline
http.interceptors.request.use((cfg) => {
  const m = (cfg.method ?? "GET").toUpperCase();
  if (m !== "GET") {
    cfg.withCredentials = true; // cookie auth
    (cfg.headers as any) = {
      ...(cfg.headers ?? {}),
      "X-CSRF-Token": getCsrfToken(),
    };
    cfg.cache = "no-store"; // never cache mutations
  }
  return cfg;
});

// 3) Call it — resolves to `data`
const posts = await http.get<Post[]>("/posts", {
  next: { revalidate: 300, tags: ["posts"] }, // ✅ Next caching + tags preserved
});
```

### Error handling (Axios-style)

```ts
import type { HttpError } from "next-axis";

try {
  await http.get("/missing");
} catch (e) {
  const err = e as HttpError;
  console.log(err.status);           // e.g., 404
  console.log(err.response?.data);   // parsed body if JSON/text
}
```

### Route Handler example (server caching + invalidation)

```ts
// app/api/posts/route.ts
import http from "next-axis";

export async function GET() {
  const posts = await http.get<Post[]>("https://api.example.com/posts", {
    next: { revalidate: 300, tags: ["posts"] },
  });
  return Response.json(posts);
}
```

Later, invalidate everywhere tagged `"posts"`:

```ts
// app/api/revalidate/route.ts
import { revalidateTag } from "next/cache";

export async function POST() {
  revalidateTag("posts");
  return Response.json({ ok: true });
}
```

---

## Why pick **next-axis** over other clients?

| Concern                                               | **next-axis**                  | Axios                  | Ky / ofetch / wretch                             |
| ----------------------------------------------------- | ------------------------------ | ---------------------- | ------------------------------------------------ |
| Next server cache (`revalidate`, `tags`, memoization) | ✅ **Preserved** (pass-through) | ❌ Not integrated       | ✅ Possible if you forward `next` (often untyped) |
| Edge runtime (no Node APIs)                           | ✅                              | ⚠️ Needs fetch adapter | ✅                                                |
| Errors (auto throw + `response.data`)                 | ✅                              | ✅                      | ✅ (varies per lib)                               |
| Interceptors                                          | ✅                              | ✅                      | ✅ (hooks/middlewares)                            |
| Size / deps                                           | **Zero deps**, tiny            | Heavier                | Small                                            |
| DX focus                                              | **Axios-style**                | Axios                  | Different APIs                                   |

**next-axis** is the sweet spot if your priority is **Next features first**, Axios-level DX second.

---

## API

### Methods (all resolve to `data`)

```ts
http.get<T>(url, config?)
http.post<T, B>(url, body?, config?)
http.put<T, B>(url, body?, config?)
http.patch<T, B>(url, body?, config?)
http.delete<T>(url, config?)
http.head<T>(url, config?)
http.options<T>(url, config?)
http.request<T>(config) // { url, method, ... }
```

### Configuration (TypeScript)

```ts
export type NextCache = { revalidate?: number | false; tags?: string[] };

export type RequestConfig<D = any> = RequestInit & {
  url?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  baseURL?: string;
  headers?: HeadersInit;
  data?: D;           // auto-JSON if plain object
  timeout?: number;   // ms, AbortController
  withCredentials?: boolean; // → credentials:'include'
  next?: NextCache;   // passed straight to fetch (server only)
};
```

### Interceptors

```ts
// Request (FIFO)
const reqId = http.interceptors.request.use((cfg) => {
  // mutate cfg: add Authorization, trace headers, etc.
  return cfg;
});

// Response (FIFO)
const resId = http.interceptors.response.use((resp) => {
  // inspect/transform resp if needed; must return it
  return resp;
});

// Remove later
http.interceptors.request.eject(reqId);
http.interceptors.response.eject(resId);
```

### Runtime helpers

```ts
http.setBaseURL("https://api.example.com");
http.setHeader("X-App", "my-app");
http.removeHeader("X-App");
```

---

## Best practices (Next.js)

* **Cache only idempotent GETs.** Use `next: { revalidate: N, tags: [...] }` or `cache: 'force-cache'`.
* **Never cache per-user data.** For authenticated/user-scoped responses, set `cache: 'no-store'` (or `revalidate: 0`).
* **Keep GET headers stable.** Don’t add non-deterministic headers (timestamps, random IDs) in request interceptors for cached requests.
* **Client components:** `next` options are ignored in the browser—server caching lives on the server.

---

## FAQ

**Why not just Axios with the fetch adapter?**
You still won’t get Next’s server `fetch` features (revalidate/tags/memoization). **next-axis** embraces platform `fetch` to keep those benefits.

**How is this different from Ky/ofetch?**
Those are great! **next-axis** is laser-focused on **Axios-style DX + explicit Next cache support** with zero extra defaults that might change cache keys. If you already use Ky/ofetch, make sure you forward `next` and avoid mutating GET headers.

**Upload/download progress?**
Not included (to stay tiny). If you need progress, add a browser-only XHR upload helper or a Node streaming path for downloads.

---

## Install size & runtime

* **Zero dependencies**
* Works in **Node 18+**, **modern browsers**, and **Next.js Edge/Node** runtimes.

---

## License

MIT © Kehinde Oke

---
