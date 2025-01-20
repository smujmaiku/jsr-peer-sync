import {
	DefaultListener,
	ListenerSignature,
	TypedEmitter,
} from 'tiny-typed-emitter';
import { DataConnection, Peer, PeerOptions } from 'peerjs';

export interface PeerConnEvents<PD = unknown> {
	connected: () => void;
	disconnected: () => void;
	peers: (pids: string[]) => void;
	peerOpen: (pid: string) => void;
	peerClose: (pid: string) => void;
	peerData: (pid: string, data: PD) => void;
}

export interface PeerConnOptionsI extends PeerOptions {
	id?: string;
}

export class PeerConn<
	PD = unknown,
	L extends ListenerSignature<L> = DefaultListener,
> extends TypedEmitter<PeerConnEvents<PD> & L> {
	private $timer?: number;

	private $host: Peer;
	private $peers: Record<string, DataConnection> = {};
	private $pids: string[] = [];

	constructor(options: PeerConnOptionsI = {}) {
		super();

		const { id, ...hostOptions } = options;

		this.$host = id ? new Peer(id, hostOptions) : new Peer(hostOptions);

		this.$host.on('open', this.handleOpen.bind(this));
		this.$host.on('disconnected', this.handleDisconnected.bind(this));
		this.$host.on('connection', this.handlePeer.bind(this));

		this.start();
	}

	get id(): string {
		return this.$host.id;
	}

	get open(): boolean {
		return this.$host.open;
	}

	get destroyed(): boolean {
		return this.$host.destroyed;
	}

	get peers(): string[] {
		const { $peers } = this;
		return Object.keys($peers).filter((pid) => $peers[pid].open);
	}

	get pids(): string[] {
		return new Proxy(this.$pids, {
			set: (target, key, value) => {
				Reflect.set(target, key, value);
				this.updatePeers();
				return true;
			},
		});
	}

	set pids(pids: string[]) {
		this.$pids = pids;
		this.updatePeers();
	}

	private handleOpen(): void {
		this.emit('connected');
	}

	private handleDisconnected(): void {
		this.emit('disconnected');
	}

	private updatePeers() {
		const { id, $host, $peers, $pids } = this;
		for (const pid of Object.keys($peers)) {
			if ($pids.includes(pid)) continue;
			this.closePeer(pid);
		}

		for (const pid of $pids) {
			if (typeof pid !== 'string') continue;
			if (pid === id || $peers[pid]) continue;

			const peer = $host.connect(pid);
			this.handlePeer(peer);
		}
	}

	private emitPeers() {
		this.emit('peers', this.peers);
	}

	private closePeer(pid: string): void {
		const { $peers } = this;

		const peer = $peers[pid];
		if (!peer) return;

		peer.close();
		peer.removeAllListeners();

		this.emit('peerClose', pid);
		delete $peers[pid];
		this.emitPeers();
	}

	private handlePeer(peer: DataConnection): void {
		const { $peers, pids } = this;
		const { peer: pid, open } = peer;

		this.closePeer(pid);
		if (!pids.includes(pid)) {
			peer.close();
			return;
		}

		$peers[pid] = peer;

		peer.on('data', (data: unknown) => {
			this.emit('peerData', pid, data as PD);
		});
		peer.on('close', () => {
			this.closePeer(pid);
		});
		peer.on('open', () => {
			this.emit('peerOpen', pid);
			this.emitPeers();
		});
	}

	send(pid: string, data: PD): void {
		const { $peers } = this;

		const peer = $peers[pid];
		peer.send(data);
	}

	sendAll(data: PD): void {
		const { peers } = this;

		for (const pid of peers) {
			this.send(pid, data);
		}
	}

	start() {
		const { $host } = this;

		clearInterval(this.$timer);

		this.$timer = setInterval(() => {
			if ($host.destroyed) {
				this.$host = new Peer($host.options);
			} else if (!$host.open) {
				$host.reconnect();
			} else {
				this.updatePeers();
			}
		}, 1000);
	}

	stop() {
		const { $host, $peers } = this;

		clearInterval(this.$timer);

		$host.removeAllListeners();
		$host.disconnect();

		for (const pid of Object.keys($peers)) {
			this.closePeer(pid);
		}
	}

	destroy() {
		this.stop();
		this.$host.destroy();
	}
}

export default PeerConn;
