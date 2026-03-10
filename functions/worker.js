// Worker entry point — routes API requests to handlers, everything else to static assets.
import { onRequest } from "./api/quote.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/quote") {
      // Build a Pages-Function-style context and delegate
      const response = await onRequest({ request, env, ctx });
      return response;
    }

    // All other requests fall through to the static asset handler
    return env.ASSETS.fetch(request);
  },
};
