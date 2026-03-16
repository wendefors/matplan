
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: "ics-dev-proxy",
      configureServer(server) {
        server.middlewares.use("/api/ics", async (req, res) => {
          try {
            const url = new URL(req.url ?? "", "http://localhost");
            const rawTarget = url.searchParams.get("url") ?? "";
            const target = rawTarget.trim();

            if (!target) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: "Missing url parameter" }));
              return;
            }

            const upstream = await fetch(target, { cache: "no-store" });
            if (!upstream.ok) {
              res.statusCode = upstream.status;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: `Upstream HTTP ${upstream.status}` }));
              return;
            }

            const text = await upstream.text();
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/calendar; charset=utf-8");
            res.end(text);
          } catch {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "Proxy failed" }));
          }
        });
      },
    },
  ],
  base: "/matplan/", // Detta säkerställer att alla filer hittas oavsett undermapp på GitHub Pages
  build: {
    outDir: 'dist',
  }
});
