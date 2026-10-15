import { createConnection } from "node:net";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("../site/vendor/ethers.umd.min.js");

// This transport only connects to the demo's own loopback Anvil process.
// A direct local TCP connection avoids routing local test traffic through an HTTP proxy.
export async function localRequest(port, payload) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({host:"127.0.0.1",port});
    const parts = [];
    const body = JSON.stringify(payload);
    socket.setTimeout(10000, () => socket.destroy(new Error("Local Anvil request timed out.")));
    socket.on("error", reject);
    socket.on("connect", () => socket.write(
      `POST / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`
    ));
    socket.on("data", chunk => parts.push(chunk));
    socket.on("end", () => {
      try {
        const response = Buffer.concat(parts);
        const boundary = response.indexOf("\r\n\r\n");
        if (boundary < 0) throw new Error("Incomplete local HTTP response.");
        const headers = response.subarray(0,boundary).toString();
        if (!/^HTTP\/1\.[01] 200\b/.test(headers)) throw new Error("Local Anvil returned a non-200 HTTP response.");
        let data = response.subarray(boundary+4);
        if (/transfer-encoding:\s*chunked/i.test(headers)) {
          const chunks = [];
          while (data.length) {
            const end = data.indexOf("\r\n");
            const size = parseInt(data.subarray(0,end).toString(),16);
            if (!Number.isFinite(size) || size < 0) throw new Error("Invalid local HTTP chunk.");
            if (size === 0) break;
            chunks.push(data.subarray(end+2,end+2+size)); data = data.subarray(end+size+4);
          }
          data = Buffer.concat(chunks);
        }
        const json = JSON.parse(data.toString());
        resolve(Array.isArray(json) ? json : [json]);
      } catch (error) { reject(error); }
    });
  });
}

export class LocalProvider extends E.JsonRpcProvider {
  constructor(port, chainId) {
    super(undefined, chainId, {cacheTimeout:-1, batchMaxCount:1});
    this.localPort = port;
    this.pollingInterval = 100;
  }
  async _send(payload) {
    return localRequest(this.localPort, payload);
  }
}
