import { ArgusServer } from "../src";

const server = new ArgusServer();

server.method("user.get", async (payload) => {
  const input = payload as { id: number };

  return {
    id: input.id,
    name: "Williams"
  };
});

server.method("system.ping", async () => {
  return {
    ok: true,
    service: "argus-rpc"
  };
});

const port = await server.listen(7000);

console.log(`Argus server listening on tcp://127.0.0.1:${port}`);
