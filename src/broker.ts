import {
	type DataConnection,
	Peer,
	type PeerOptions,
} from 'npm:peerjs/dist/bundler.mjs';
import { TypedEmitter } from 'npm:tiny-typed-emitter';

export class TrackedConn {
	constructor(public user: string, public dc: DataConnection) {}
	public get id(): string {
		return this.dc.peer;
	}
	public get name(): string {
		return this.user;
	}
}

export interface PeerHostEvents {
	connection: (id: string) => void;
}

export class Broker extends TypedEmitter<PeerHostEvents> {
	private peer: Peer;
	private conns: Record<string, TrackedConn> = {};

	get connIds(): TrackedConn[] {
		return Object.values(this.conns);
	}

	constructor(private id: string, options?: PeerOptions) {
		super();

		this.peer = new Peer(this.id, options);

		this.peer.addListener('connection', this.handleConnection.bind(this));
		this.peer.addListener('open', console.log.bind(this, 'open'));
		this.peer.addListener('close', console.log.bind(this, 'close'));
		this.peer.addListener('error', console.log.bind(this, 'error'));
	}

	sendPeers(): void {
		const allPeers = Object.values(this.conns).map((conn) => ({
			id: conn.id,
			name: conn.name,
		}));

		for (const [id, conn] of Object.entries(this.conns)) {
			const peers = allPeers.filter((peer) => peer.id !== id);
			console.log({ peers });
			conn.dc.send({ peers });
		}
	}

	private handleConnection(conn: DataConnection): void {
		const connid = conn.connectionId;

		conn.addListener('open', () => {
			console.log(`new connection: ${connid}`);
		});

		conn.addListener('close', () => {
			console.log(`close connection: ${connid}`);
			delete this.conns[connid];
			this.sendPeers();
		});

		conn.addListener('data', (d: unknown) => {
			// TODO check creds
			if (this.conns[connid]) {
				try {
					conn.close();
				} catch (_e) {}
				delete this.conns[connid];
				return;
			}

			this.conns[connid] = new TrackedConn(String(d), conn);
			this.sendPeers();
			this.emit('connection', connid);
		});
	}

	destroy(): void {
		this.peer.destroy();
	}
}

export default Broker;
