import { TypedEmitter } from 'npm:tiny-typed-emitter';
import type { AnyObject } from './utils/types.ts';
import {
	type BatchedEventCallbackFn,
	createDeepObserverBatched,
	removeDeepObserverBatched,
} from 'jsr:@smujdev/deep-observer';
import type { PeerConn } from './peer-conn.ts';

interface NetEventsI<S extends AnyObject> {
	HELO: undefined;
	GETASSET: { id: string };
	ASSETLIST: { assets: string[] };
	ASSETSTATE: { id: string; state: S };
}

const netEventType: (keyof NetEventsI<never>)[] = [
	'HELO',
	'GETASSET',
	'ASSETLIST',
	'ASSETSTATE',
];

type NetEventT<S extends AnyObject> = {
	[K in keyof NetEventsI<S>]: [K, NetEventsI<S>[K]];
}[keyof NetEventsI<S>];

export interface PeerSyncEvents<PD = unknown> {
	assetState: (id: string, state: PD) => void;
}

function parseEvent<S extends AnyObject>(data: unknown): NetEventT<S> | [] {
	if (!(data instanceof Array)) return [];

	const [type, payload] = data;
	if (!netEventType.includes(type)) return [];

	return [type, payload];
}

export class PeerSync<S extends AnyObject>
	extends TypedEmitter<PeerSyncEvents<S>> {
	private $conn: PeerConn;
	private $assets: Record<
		string,
		{
			state?: S;
			asset?: S;
			owner?: string;
			callback: BatchedEventCallbackFn;
		}
	> = {};
	private $cleanup?: () => void;

	getAssets(): Record<string, S> {
		const { $assets } = this;
		const assets: Record<string, S> = {};

		for (const [id, { asset }] of Object.entries($assets)) {
			if (!asset) continue;
			assets[id] = asset;
		}

		return assets;
	}

	get assets(): Record<string, S> {
		return this.getAssets();
	}

	getAssetsByOwner(pid?: string): Record<string, S> {
		const { $assets } = this;
		const assets: Record<string, S> = {};

		for (const [id, { asset, owner }] of Object.entries($assets)) {
			if (!asset) continue;
			if (owner !== pid) continue;
			assets[id] = asset;
		}
		return assets;
	}

	constructor(conn: PeerConn) {
		super();

		this.$conn = conn;

		const handlePeers = this.handlePeers.bind(this);
		const handlePeerOpen = this.handlePeerOpen.bind(this);
		const handlePeerData = this.handlePeerData.bind(this);

		conn.on('peers', handlePeers);
		conn.on('peerOpen', handlePeerOpen);
		conn.on('peerData', handlePeerData);

		this.$cleanup = () => {
			conn.off('peers', handlePeers);
			conn.off('peerOpen', handlePeerOpen);
			conn.off('peerData', handlePeerData);
		};

		// TODO memoize this somehow
		// this.getAssets = memoize(this.getAssets.bind(this));
		// this.getAssetsByOwner = memoize(this.getAssetsByOwner.bind(this));
	}

	private clearAssetCache(): void {
		// TODO
	}

	private emitAssetState(id: string, state: S): void {
		this.clearAssetCache();
		this.emit('assetState', id, state);
	}

	private send<T extends keyof NetEventsI<S>>(
		id: string,
		type: T,
		payload: NetEventsI<S>[T],
	): void {
		this.$conn.send(id, [type, payload]);
	}

	private sendAll<T extends keyof NetEventsI<S>>(
		type: T,
		payload: NetEventsI<S>[T],
	): void {
		this.$conn.sendAll([type, payload]);
	}

	private handleAssetChange(
		id: string,
		state: S,
		owner: string | undefined,
		_props: Parameters<BatchedEventCallbackFn>[0],
	): void {
		if (owner) {
			this.emitAssetState(id, state);
		} else {
			this.clearAssetCache();
			this.sendAll('ASSETSTATE', { id, state });
		}
	}

	createAsset(id: string, state: S): S {
		return this.$createAsset(id, state, undefined);
	}

	private $reserveAsset(id: string, owner: string | undefined): void {
		this.removeAssetById(id);

		this.$assets[id] = {
			owner,
			callback: () => {},
		};
	}

	private $createAsset(id: string, state: S, owner: string | undefined): S {
		this.$reserveAsset(id, owner);

		const callback = this.handleAssetChange.bind(this, id, state, owner);

		const asset = createDeepObserverBatched(state, callback, 1);
		this.$assets[id] = {
			state,
			asset,
			owner,
			callback,
		};

		this.emitAssetState(id, state);

		return asset;
	}

	removeAssetById(id: string): void {
		const instance = this.$assets[id];
		if (!instance) return;

		const { asset, callback } = instance;

		if (asset && callback) {
			removeDeepObserverBatched(asset, callback);
		}

		delete this.$assets[id];
	}

	private handlePeers(_pids: string[]): void {
		this.cleanAssets();
	}

	private handlePeerOpen(pid: string): void {
		this.send(pid, 'HELO', undefined);
	}

	private handlePeerData(pid: string, event: unknown): void {
		const [type, payload] = parseEvent<S>(event);

		switch (type) {
			case 'HELO': {
				this.sendAssetList(pid);
				break;
			}
			case 'GETASSET': {
				const { id } = payload;
				this.sendAsset(pid, id);
				break;
			}
			case 'ASSETLIST': {
				const { assets } = payload;

				this.cleanAssets();

				for (const id of assets) {
					this.$reserveAsset(id, pid);
					this.send(pid, 'GETASSET', { id });
				}
				break;
			}
			case 'ASSETSTATE': {
				const { id, state } = payload;
				const { asset, owner } = this.$assets[id] || {};

				if (owner !== pid) {
					this.send(pid, 'HELO', undefined);
					break;
				}

				if (!asset) {
					this.$createAsset(id, state, pid);
					break;
				}

				for (const [key, value] of Object.entries(state)) {
					Reflect.set(asset, key, value);
				}
				break;
			}
			default:
		}
	}

	cleanAssets(): void {
		const { $conn, $assets } = this;
		const { peers } = $conn;

		for (const [id, { owner }] of Object.entries($assets)) {
			if (owner === undefined) continue;
			if (peers.includes(owner)) continue;
			this.removeAssetById(id);
		}
	}

	sendAssetList(pid: string): void {
		const assets = Object.entries(this.$assets).filter((
			[, { owner, asset }],
		) => asset && owner === undefined).map(([id]) => id);
		this.send(pid, 'ASSETLIST', {
			assets,
		});
	}

	sendAllAssetList(): void {
		const assets = Object.entries(this.$assets).filter((
			[, { owner, asset }],
		) => asset && owner === undefined).map(([id]) => id);
		this.sendAll('ASSETLIST', {
			assets,
		});
	}

	sendAsset(pid: string, id: string): void {
		const { $assets } = this;
		const { state } = $assets[id];

		if (!state) return;

		this.send(pid, 'ASSETSTATE', {
			id,
			state,
		});
	}

	destroy(): void {
		this.$cleanup?.();
	}
}

export default PeerSync;
