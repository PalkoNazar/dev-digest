import { buildApp } from './app.js';
import { isLoopbackHost, loadConfig } from './platform/config.js';

/** Production/dev entrypoint. `pnpm dev` runs `tsx watch src/server.ts`. */
async function main() {
  const config = loadConfig();
  const app = await buildApp({ config });

  // Graceful shutdown: on SIGTERM/SIGINT close the server, which runs the
  // onClose hooks (drains in-flight requests/SSE, closes the postgres pool).
  // Guarded so a second signal during shutdown doesn't double-close.
  let closing = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, async () => {
      if (closing) return;
      closing = true;
      app.log.info(`${signal} received — shutting down`);
      try {
        await app.close();
        process.exit(0);
      } catch (err) {
        app.log.error(err, 'error during shutdown');
        process.exit(1);
      }
    });
  }

  try {
    await app.listen({ port: config.apiPort, host: config.host });
    app.log.info(`DevDigest API listening on http://${config.host}:${config.apiPort}`);
    if (!isLoopbackHost(config.host)) {
      app.log.warn(
        { host: config.host },
        'API is reachable from other machines and has NO authentication — anyone on this network can change keys and run reviews. Set HOST=localhost unless the network is trusted.',
      );
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
