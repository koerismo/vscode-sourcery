/** A router configuration. One of these has to exist for both the client and server for strong typing! */
export type RouteConfig = Record<string, (arg: any) => void>;

/** Defines a message router, which proxies postMessage requests via strongly-typed function calls. */
export type Router = <Peer extends RouteConfig, Self extends RouteConfig>(callback: (peer: Peer) => Self) => void;

export function makeRouterConstructor(
	addMessageListener: (onMessage: (message: any) => void) => void,
	sendMessage: (message: any) => void,
): Router {
	return <Peer extends RouteConfig, Self extends RouteConfig>(
		callback: (peer: Peer) => Self,
	) => {

		// Proxy client-to-peer calls to message format
		const peerEndpoints = new Proxy({} as Peer, {
			get(_target, p, _receiver) {
				if (typeof p !== 'string') {
					throw Error('Cannot use router with symbol keys!');
				}
				return (arg: any) => {
					sendMessage({ p, arg });
				};
			},
		});

		// Listen for peer-to-client messages
		const selfEndpoints = callback(peerEndpoints as Peer);
		addMessageListener(({ p, arg }) => {
			if (!(p in selfEndpoints)) {
				throw Error(`Endpoint "${p}" does not exist! Are server/client synced?`);
			}
			selfEndpoints[p](arg);
		});

		// Provide external reference to router
		return peerEndpoints;
	};
}
