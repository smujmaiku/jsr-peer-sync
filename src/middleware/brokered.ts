import type { DataConnection } from 'npm:peerjs';
import type PeerConn from '../peer-conn.ts';

interface PeerBrokeredOptionsI {
	payload: string;
	brokerId: string;
}

interface BrokerPayloadI {
	peers: { id: string }[];
}

function isBrokerPayload(data: unknown): data is BrokerPayloadI {
	if (!(data instanceof Object)) return false;
	if (!('peers' in data)) return false;
	return data?.peers instanceof Array;
}

export class PeerBrokered {
	private $timer?: number;
	private $broker?: DataConnection;
	private $cleanup?: () => void;

	constructor(
		private peerConn: PeerConn,
		private options: PeerBrokeredOptionsI,
	) {
		this.start();
	}

	get active(): boolean {
		return this.$timer !== undefined;
	}

	private openBroker(): void {
		this.peerConn.manualConnect(this.options.brokerId);
	}

	private closeBroker(): void {
		try {
			this.$broker?.close();
		} catch (_e) {}

		this.$broker = undefined;
	}

	private handleConnected(): void {
		if (!this.active) return;
		this.openBroker();
	}

	private handleUnknownConnection(peer: DataConnection, event: Event): void {
		if (peer.peer !== this.options.brokerId) return;
		event.preventDefault();
		this.closeBroker();

		this.$broker = peer;

		peer.on('data', (data: unknown) => {
			const pids = [];
			if (isBrokerPayload(data)) {
				for (const peer of data.peers) {
					if (peer.id) pids.push(peer.id);
				}
			}
			this.peerConn.pids = pids;
		});

		peer.on('close', () => {
			if (!this.active) return;
			if (this.$broker !== peer) return;
			this.peerConn.pids = [];
		});

		peer.on('open', () => {
			peer.send(this.options.payload);
			console.log('sending', this.options.payload);
		});
	}

	start(): void {
		this.stop();

		this.$timer = setInterval(() => {
			if (!this.$broker?.open) {
				this.openBroker();
			}
		}, 1000);

		const handleUnknownConnection = this.handleUnknownConnection.bind(this);
		const handleConnected = this.handleConnected.bind(this);
		this.peerConn.on('unknownConnection', handleUnknownConnection);
		this.peerConn.on('connected', handleConnected);

		this.$cleanup = () => {
			this.peerConn.off('unknownConnection', handleUnknownConnection);
			this.peerConn.off('connected', handleConnected);
		};

		if (this.peerConn.open) {
			this.handleConnected();
		}
	}

	stop(): void {
		clearInterval(this.$timer);
		this.$timer = undefined;

		this.$cleanup?.();
		this.$cleanup = undefined;

		this.closeBroker();
	}
}

export default PeerBrokered;
