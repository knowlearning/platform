import { getLogger } from "https://deno.land/x/socket_io@0.2.1/deps.ts";
import { Transport } from "https://deno.land/x/socket_io@0.2.1/packages/engine.io/lib/transport.ts";
import { Packet, Parser, RawData } from "https://deno.land/x/socket_io@0.2.1/packages/engine.io-parser/mod.ts";

export class WS extends Transport {
  private socket?: WebSocket;

  public get name() {
    return "websocket";
  }

  public get upgradesTo(): string[] {
    return [];
  }

  public send(packets: Packet[]) {
    for (const packet of packets) {
      Parser.encodePacket(packet, true, (data: RawData) => {
        if (this.writable && this.socket?.readyState === WebSocket.OPEN) {
          this.socket?.send(data);
        }
      });
    }
  }

  public onRequest(req: Request): Promise<Response> {
    const { socket, response } = Deno.upgradeWebSocket(req);

    this.socket = socket;

    socket.onopen = () => {
      getLogger("engine.io").debug(
        "[websocket] transport is now writable",
      );
      this.writable = true;
      this.emitReserved("drain");
    };

    socket.onmessage = ({ data }) => {
      if (this.readyState === "closing" || this.readyState === "closed") {
        return;
      }
      if (data === null || data === undefined) {
        this.onError("invalid WebSocket message data");
        this.close();
        return;
      }

      // note: we use the length of the string here, which might be different from the number of bytes (up to 4 bytes)
      const byteLength = typeof data === "string"
        ? data.length
        : data.byteLength;
      if (byteLength > this.opts.maxHttpBufferSize) {
        return this.onError("payload too large");
      } else {
        this.onData(data);
      }
    };

    socket.onclose = (closeEvent) => {
      getLogger("engine.io").debug(
        `[websocket] onclose with code ${closeEvent.code}`,
      );
      this.writable = false;
      this.onClose();
    };

    // note: response.headers is immutable, so it seems we can't add headers here

    return Promise.resolve(response);
  }

  protected doClose() {
    this.socket?.close();
  }
}
