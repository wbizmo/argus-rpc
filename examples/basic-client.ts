import { ArgusClient } from "../src";

const client = new ArgusClient({
  host: "127.0.0.1",
  port: 7000
});

const user = await client.call("user.get", {
  id: 1
});

console.log("user.get response:", user);

const ping = await client.call("system.ping");

console.log("system.ping response:", ping);

await client.close();
